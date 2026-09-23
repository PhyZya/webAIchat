/**
 * Разбор одного события потока OpenRouter.
 *
 * Отдельно от сетевого кода, потому что это чистая функция: на вход строка,
 * на выход решение. Её можно прогнать тестами без ключа, сети и модели.
 */

import type { DoneReason, ErrorCode } from '@filament/shared';
import { codeFromPayload, messageFromPayload } from './errors.ts';

/** Маркер конца потока в протоколе OpenAI, который повторяет OpenRouter. */
const END_MARKER = '[DONE]';

export type ChunkResult =
  /** Поток штатно закончился. */
  | { kind: 'end' }
  /** В потоке приехал отказ — дальше читать нечего. */
  | { kind: 'error'; code: ErrorCode; message?: string }
  /** Обычный кусок ответа. text может быть пустым: бывают служебные чанки без текста. */
  | { kind: 'data'; text: string; finish: DoneReason | null };

type StreamChunkShape = {
  choices?: Array<{
    delta?: { content?: unknown };
    finish_reason?: unknown;
  }>;
};

function toDoneReason(value: unknown): DoneReason | null {
  if (value === 'length') {
    return 'length';
  }
  // stop, content_filter, tool_calls и любое другое непустое значение означают,
  // что модель больше ничего не пришлёт. Для интерфейса это один и тот же случай.
  return typeof value === 'string' && value.length > 0 ? 'stop' : null;
}

export function parseChunk(payload: string): ChunkResult {
  const trimmed = payload.trim();

  if (trimmed === END_MARKER) {
    return { kind: 'end' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Нечитаемое событие — не повод рвать весь ответ: пропускаем его и читаем дальше.
    return { kind: 'data', text: '', finish: null };
  }

  const errorCode = codeFromPayload(parsed);
  if (errorCode) {
    return { kind: 'error', code: errorCode, message: messageFromPayload(parsed) };
  }

  const choice = (parsed as StreamChunkShape).choices?.[0];
  const content = choice?.delta?.content;

  return {
    kind: 'data',
    text: typeof content === 'string' ? content : '',
    finish: toDoneReason(choice?.finish_reason),
  };
}
