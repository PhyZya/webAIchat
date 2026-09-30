/**
 * Состояние диалога: отправка, поток, остановка, повтор, очистка.
 *
 * Хук держит только состояние и порядок действий. Сеть живёт в streamClient,
 * преобразования списка — в turns, хранение — в history.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_MODEL_ID } from '@filament/shared/models';
import { clearHistory, loadHistory, saveHistory } from './history.ts';
import { streamChat } from './streamClient.ts';
import type { StreamEvent } from '@filament/shared';
import type { Turn } from './types.ts';
import {
  appendText,
  createAssistantTurn,
  createUserTurn,
  patchTurn,
  prepareRetry,
  toChatMessages,
} from './turns.ts';

export type ChatController = {
  turns: Turn[];
  model: string;
  /** Идёт ли обмен с моделью прямо сейчас. */
  isBusy: boolean;
  send: (text: string) => void;
  stop: () => void;
  retry: (answerId: string) => void;
  clear: () => void;
  setModel: (model: string) => void;
};

export function useChat(): ChatController {
  const [turns, setTurns] = useState<Turn[]>(loadHistory);
  const [model, setModel] = useState<string>(DEFAULT_MODEL_ID);
  const [isBusy, setBusy] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  // Дублирует isBusy, но меняется сразу, а не на следующем рендере. Без него
  // быстрый двойной Enter успевал отправить два запроса подряд.
  const busyRef = useRef(false);
  const stoppedByUserRef = useRef(false);

  // Пишем в хранилище только в покое: во время потока это сотни записей в секунду
  // ради состояния, которое всё равно не восстановить после перезагрузки.
  useEffect(() => {
    if (!isBusy) {
      saveHistory(turns);
    }
  }, [turns, isBusy]);

  // Уход со страницы посреди генерации должен закрыть соединение,
  // иначе сервер продолжит тянуть ответ в никуда.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Модель передаётся явно, а не читается из состояния: ответ должен уйти
  // в ту модель, которая записана в его реплике.
  const run = useCallback(async (history: Turn[], answerId: string, modelId: string) => {
    const controller = new AbortController();
    abortRef.current = controller;
    busyRef.current = true;
    stoppedByUserRef.current = false;
    setBusy(true);

    /** Пришло ли итоговое событие — успех или отказ. */
    let settled = false;

    const handleEvent = (event: StreamEvent) => {
      if (event.type === 'delta') {
        setTurns((current) => appendText(current, answerId, event.text));
        return;
      }

      settled = true;

      if (event.type === 'error') {
        setTurns((current) =>
          patchTurn(current, answerId, {
            status: 'failed',
            errorCode: event.code,
            retryAfterSec: event.retryAfterSec,
          }),
        );
        return;
      }

      setTurns((current) => patchTurn(current, answerId, finishPatch(current, answerId)));
    };

    try {
      await streamChat(
        { messages: toChatMessages(history), model: modelId },
        controller.signal,
        handleEvent,
      );

      if (!settled) {
        // Поток закончился, а итогового события не было: либо нажали «Стоп»,
        // либо связь с сервером оборвалась молча.
        setTurns((current) =>
          stoppedByUserRef.current
            ? patchTurn(current, answerId, { status: 'stopped' })
            : patchTurn(current, answerId, { status: 'failed', errorCode: 'network_error' }),
        );
      }
    } finally {
      // Снимаем «занято» в finally: исключение внутри не должно оставить
      // интерфейс в вечной генерации. Проверка controller нужна на случай,
      // если после «Очистить» уже начался новый запрос — его флаг не трогаем.
      if (abortRef.current === controller) {
        abortRef.current = null;
        busyRef.current = false;
        setBusy(false);
      }
    }
  }, []);

  const send = useCallback(
    (text: string) => {
      const content = text.trim();
      if (!content || busyRef.current) {
        return;
      }

      const question = createUserTurn(content);
      const answer = createAssistantTurn(model);
      const history = [...turns, question];

      setTurns([...history, answer]);
      void run(history, answer.id, model);
    },
    [model, run, turns],
  );

  const stop = useCallback(() => {
    stoppedByUserRef.current = true;
    abortRef.current?.abort();
  }, []);

  // Повтор идёт в модель, выбранную сейчас: если прежняя ответила 429,
  // человек как раз переключился на соседнюю.
  const retry = useCallback(
    (answerId: string) => {
      if (busyRef.current) {
        return;
      }

      const plan = prepareRetry(turns, answerId, model);
      if (!plan) {
        return;
      }

      setTurns(plan.turns);
      void run(plan.history, plan.answer.id, model);
    },
    [model, run, turns],
  );

  const clear = useCallback(() => {
    abortRef.current?.abort();
    clearHistory();
    setTurns([]);
  }, []);

  return { turns, model, isBusy, send, stop, retry, clear, setModel };
}

/**
 * Модель закрыла поток. Если при этом не сказала ни слова — для человека это отказ,
 * а не пустой ответ, поэтому показываем ошибкой, а не пустым местом.
 */
function finishPatch(turns: Turn[], answerId: string): Partial<Turn> {
  const answer = turns.find((turn) => turn.id === answerId);

  if (answer && answer.content.length === 0) {
    return { status: 'failed', errorCode: 'upstream_error' };
  }
  return { status: 'done' };
}
