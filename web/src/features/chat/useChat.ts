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
import type { Turn } from './types.ts';
import { appendText, createTurn, patchTurn, toChatMessages } from './turns.ts';

export type ChatController = {
  turns: Turn[];
  model: string;
  /** Идёт ли обмен с моделью прямо сейчас. */
  isBusy: boolean;
  send: (text: string) => void;
  stop: () => void;
  retry: () => void;
  clear: () => void;
  setModel: (model: string) => void;
};

export function useChat(): ChatController {
  const [turns, setTurns] = useState<Turn[]>(loadHistory);
  const [model, setModel] = useState<string>(DEFAULT_MODEL_ID);
  const [isBusy, setBusy] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
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

  const run = useCallback(
    async (history: Turn[], answerId: string) => {
      const controller = new AbortController();
      abortRef.current = controller;
      stoppedByUserRef.current = false;
      setBusy(true);

      /** Пришло ли итоговое событие — успех или отказ. */
      let settled = false;

      await streamChat({ messages: toChatMessages(history), model }, controller.signal, (event) => {
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
      });

      if (!settled) {
        // Поток закончился, а итогового события не было: либо нажали «Стоп»,
        // либо связь с сервером оборвалась молча.
        setTurns((current) =>
          stoppedByUserRef.current
            ? patchTurn(current, answerId, { status: 'stopped' })
            : patchTurn(current, answerId, { status: 'failed', errorCode: 'network_error' }),
        );
      }

      abortRef.current = null;
      setBusy(false);
    },
    [model],
  );

  const send = useCallback(
    (text: string) => {
      const content = text.trim();
      if (!content || isBusy) {
        return;
      }

      const question = createTurn('user', content, 'done');
      const answer = createTurn('assistant', '', 'pending');
      const history = [...turns, question];

      setTurns([...history, answer]);
      void run(history, answer.id);
    },
    [isBusy, run, turns],
  );

  const stop = useCallback(() => {
    stoppedByUserRef.current = true;
    abortRef.current?.abort();
  }, []);

  const retry = useCallback(() => {
    const last = turns.at(-1);
    if (isBusy || last?.role !== 'assistant') {
      return;
    }

    // Выкидываем неудачный ответ и задаём тот же вопрос заново.
    const history = turns.slice(0, -1);
    const answer = createTurn('assistant', '', 'pending');

    setTurns([...history, answer]);
    void run(history, answer.id);
  }, [isBusy, run, turns]);

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
