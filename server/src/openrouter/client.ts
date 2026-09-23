/**
 * Единственное место в проекте, которое ходит в OpenRouter.
 *
 * Ключ читается только отсюда и уходит только в заголовок исходящего запроса.
 * Наружу модуль отдаёт готовые события нашего протокола: выше по стеку про
 * формат OpenRouter никто не знает.
 */

import type { ChatMessage, DoneReason, StreamEvent } from '@filament/shared';
import { config } from '../config.ts';
import {
  FIRST_TOKEN_TIMEOUT_MS,
  OPENROUTER_URL,
  STALL_TIMEOUT_MS,
  TOTAL_TIMEOUT_MS,
} from '../constants.ts';
import { log } from '../lib/logger.ts';
import { parseChunk } from './chunk.ts';
import { Deadlines } from './deadlines.ts';
import { codeFromStatus, parseRetryAfter } from './errors.ts';
import { SseParser } from '@filament/shared/sse';

const SYSTEM_PROMPT =
  'Ты — помощник в веб-чате. Отвечай по существу и на языке собеседника. ' +
  'Не выдумывай факты: если чего-то не знаешь, так и скажи.';

type StreamParams = {
  messages: ChatMessage[];
  model: string;
  requestId: string;
  /** Обрыв со стороны браузера: нажали «Стоп» или закрыли вкладку. */
  clientSignal: AbortSignal;
};

type OpenResult =
  | { ok: true; body: ReadableStream<Uint8Array> }
  | { ok: false; event: StreamEvent };

async function openStream(params: StreamParams, signal: AbortSignal): Promise<OpenResult> {
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${config.openRouterKey}`,
      'Content-Type': 'application/json',
      // OpenRouter показывает эти два поля в статистике аккаунта. Секретов в них нет.
      'HTTP-Referer': config.appUrl,
      'X-Title': config.appTitle,
    },
    body: JSON.stringify({
      model: params.model,
      stream: true,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...params.messages],
    }),
  });

  if (response.ok && response.body) {
    return { ok: true, body: response.body };
  }

  const code = codeFromStatus(response.status);
  log.warn('upstream.rejected', {
    requestId: params.requestId,
    model: params.model,
    status: response.status,
    code,
  });

  return {
    ok: false,
    event: {
      type: 'error',
      code,
      retryAfterSec: parseRetryAfter(response.headers.get('retry-after')),
    },
  };
}

/** Что накопилось по ходу чтения одного ответа. */
type ReadState = {
  /** Причина завершения, если модель её назвала. */
  finish: DoneReason | null;
  /** Поток закончился — событие уже отдано, читать дальше нечего. */
  ended: boolean;
};

function* eventsFromPayload(
  payload: string,
  deadlines: Deadlines,
  state: ReadState,
): Generator<StreamEvent> {
  const chunk = parseChunk(payload);

  if (chunk.kind === 'end') {
    state.ended = true;
    yield { type: 'done', reason: state.finish ?? 'stop' };
    return;
  }

  if (chunk.kind === 'error') {
    state.ended = true;
    yield { type: 'error', code: chunk.code };
    return;
  }

  if (chunk.finish) {
    state.finish = chunk.finish;
  }

  if (chunk.text) {
    // Первый текст закрывает ожидание старта, дальше следим за паузами между кусками.
    deadlines.expect(STALL_TIMEOUT_MS, 'stall');
    yield { type: 'delta', text: chunk.text };
  }
}

async function* pump(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  deadlines: Deadlines,
): AsyncGenerator<StreamEvent> {
  const decoder = new TextDecoder();
  const parser = new SseParser();
  const state: ReadState = { finish: null, ended: false };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    for (const payload of parser.push(decoder.decode(value, { stream: true }))) {
      yield* eventsFromPayload(payload, deadlines, state);
      if (state.ended) {
        return;
      }
    }
  }

  // Соединение закрылось без маркера конца — считаем, что модель договорила.
  yield { type: 'done', reason: state.finish ?? 'stop' };
}

async function* readBody(
  body: ReadableStream<Uint8Array>,
  deadlines: Deadlines,
): AsyncGenerator<StreamEvent> {
  const reader = body.getReader();

  try {
    yield* pump(reader, deadlines);
  } finally {
    // Рвём соединение с OpenRouter. Без этого на их стороне генерация продолжается
    // и тратит квоту, даже когда в браузере уже нажали «Стоп».
    await reader.cancel().catch(() => {
      // Отменяем уже сломанный поток — жаловаться не на что и некому.
    });
  }
}

export async function* streamChat(params: StreamParams): AsyncGenerator<StreamEvent> {
  const startedAt = Date.now();
  const deadlines = new Deadlines(TOTAL_TIMEOUT_MS);
  const signal = AbortSignal.any([params.clientSignal, deadlines.signal]);

  let chars = 0;
  let outcome = 'ok';

  log.info('upstream.request', {
    requestId: params.requestId,
    model: params.model,
    messages: params.messages.length,
  });

  try {
    deadlines.expect(FIRST_TOKEN_TIMEOUT_MS, 'first_token');

    const opened = await openStream(params, signal);
    if (!opened.ok) {
      outcome = 'rejected';
      yield opened.event;
      return;
    }

    for await (const event of readBody(opened.body, deadlines)) {
      if (event.type === 'delta') {
        chars += event.text.length;
      }
      if (event.type === 'error') {
        outcome = event.code;
      }
      yield event;
    }
  } catch (error) {
    yield* handleFailure(params, deadlines, error, (next) => {
      outcome = next;
    });
  } finally {
    deadlines.dispose();
    log.info('upstream.finished', {
      requestId: params.requestId,
      model: params.model,
      outcome,
      chars,
      ms: Date.now() - startedAt,
    });
  }
}

async function* handleFailure(
  params: StreamParams,
  deadlines: Deadlines,
  error: unknown,
  setOutcome: (outcome: string) => void,
): AsyncGenerator<StreamEvent> {
  if (params.clientSignal.aborted) {
    // Нажали «Стоп». Это не сбой: соединение с браузером уже закрывается,
    // отправлять в него событие ошибки некуда и незачем.
    setOutcome('cancelled');
    return;
  }

  const expired = deadlines.expiredReason;
  if (expired) {
    setOutcome(`timeout:${expired}`);
    log.warn('upstream.timeout', { requestId: params.requestId, stage: expired });
    yield { type: 'error', code: 'upstream_timeout' };
    return;
  }

  setOutcome('network');
  log.error('upstream.failed', {
    requestId: params.requestId,
    reason: error instanceof Error ? error.message.slice(0, 200) : 'неизвестная ошибка',
  });
  yield { type: 'error', code: 'upstream_error' };
}
