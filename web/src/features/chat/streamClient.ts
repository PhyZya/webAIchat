/**
 * Обращение к нашему серверу и чтение потока ответа.
 *
 * Здесь нет ни адреса OpenRouter, ни ключа — браузер знает только про /api/chat.
 */

import type { ChatRequest, StreamEvent } from '@filament/shared';
import { isErrorCode, parseStreamEvent } from '@filament/shared';
import { SseParser } from '@filament/shared/sse';

const CHAT_ENDPOINT = '/api/chat';

/**
 * Сколько терпим полную тишину в соединении.
 *
 * Сервер присылает признак жизни раз в пять секунд, поэтому тишина дольше
 * этого срока означает, что связи больше нет: сервер упал, сеть пропала или
 * соединение подвисло у посредника. Без этого сторожа интерфейс остаётся
 * в состоянии «идёт генерация» навсегда — тот самый вечный спиннер.
 *
 * Серверные таймауты здесь не помогают: когда умирает сервер, некому
 * их отсчитывать.
 */
const SILENCE_LIMIT_MS = 20_000;

/** Ошибка сторожа тишины. Отдельный класс, чтобы не спутать с сетевым сбоем. */
class SilenceError extends Error {}

/** Ждёт результат, но не дольше отведённого времени. */
function withSilenceWatch<T>(promise: Promise<T>, limitMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new SilenceError()), limitMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/** Отказ до начала потока приходит обычным JSON с кодом внутри. */
async function readRejection(response: Response): Promise<StreamEvent> {
  const body: unknown = await response.json().catch(() => null);
  const shape = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;

  return {
    type: 'error',
    code: isErrorCode(shape.code) ? shape.code : 'server_error',
    retryAfterSec: typeof shape.retryAfterSec === 'number' ? shape.retryAfterSec : undefined,
  };
}

async function pump(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  const decoder = new TextDecoder();
  const parser = new SseParser();

  while (true) {
    const { done, value } = await withSilenceWatch(reader.read(), SILENCE_LIMIT_MS);
    if (done) {
      return;
    }

    for (const payload of parser.push(decoder.decode(value, { stream: true }))) {
      const event = parseStreamEvent(payload);
      if (!event) {
        continue;
      }

      onEvent(event);
      // После done или error сервер больше ничего не пришлёт. Ждать закрытия
      // соединения незачем: если посредник его придержит, интерфейс ещё
      // двадцать секунд показывал бы генерацию, а потом — ложный обрыв связи.
      if (event.type !== 'delta') {
        return;
      }
    }
  }
}

async function readEvents(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  const reader = body.getReader();

  try {
    await pump(reader, onEvent);
  } finally {
    // Отпускаем соединение. При срабатывании сторожа оно всё ещё открыто,
    // и без этого браузер продолжит держать мёртвый сокет.
    await reader.cancel().catch(() => {
      // Поток уже сломан — отменять нечего.
    });
  }
}

/**
 * Отправляет диалог и вызывает onEvent на каждое событие потока.
 *
 * Прерывание через signal — штатный путь, а не ошибка: браузер закрывает
 * соединение, сервер видит это и обрывает запрос к модели.
 */
export async function streamChat(
  request: ChatRequest,
  signal: AbortSignal,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  let response: Response;

  try {
    response = await fetch(CHAT_ENDPOINT, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch {
    if (!signal.aborted) {
      onEvent({ type: 'error', code: 'network_error' });
    }
    return;
  }

  if (!response.ok || !response.body) {
    onEvent(await readRejection(response));
    return;
  }

  try {
    await readEvents(response.body, onEvent);
  } catch {
    // Поток оборвался на середине. Если это сделал пользователь — всё в порядке,
    // иначе связь с сервером потеряна и об этом надо сказать.
    if (!signal.aborted) {
      onEvent({ type: 'error', code: 'network_error' });
    }
  }
}
