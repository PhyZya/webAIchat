/**
 * Обращение к нашему серверу и чтение потока ответа.
 *
 * Здесь нет ни адреса OpenRouter, ни ключа — браузер знает только про /api/chat.
 */

import type { ChatRequest, StreamEvent } from '@filament/shared';
import { isErrorCode, parseStreamEvent } from '@filament/shared';
import { SseParser } from '@filament/shared/sse';

const CHAT_ENDPOINT = '/api/chat';

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

async function readEvents(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser();

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return;
    }

    for (const payload of parser.push(decoder.decode(value, { stream: true }))) {
      const event = parseStreamEvent(payload);
      if (event) {
        onEvent(event);
      }
    }
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
