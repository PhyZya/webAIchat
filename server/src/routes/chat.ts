/**
 * Единственный эндпоинт: принимает историю диалога и отдаёт ответ модели потоком.
 *
 * Разделение ответственности: здесь живёт только HTTP — проверка входа, лимит,
 * перекладывание событий в SSE. Разговор с моделью целиком в openrouter/client.
 */

import { getConnInfo } from '@hono/node-server/conninfo';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { LIMITS } from '@filament/shared';
import { isKnownModel } from '@filament/shared/models';
import { HEARTBEAT_INTERVAL_MS } from '../constants.ts';
import { log, newRequestId } from '../lib/logger.ts';
import { retryAfterSeconds, takeToken } from '../lib/rate-limit.ts';
import { streamChat } from '../openrouter/client.ts';

const messageSchema = z.discriminatedUnion('role', [
  z.object({
    role: z.literal('user'),
    content: z.string().min(1).max(LIMITS.maxUserMessageChars),
  }),
  z.object({
    role: z.literal('assistant'),
    content: z.string().min(1).max(LIMITS.maxAssistantMessageChars),
  }),
]);

const requestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(LIMITS.maxMessages),
  // Модель только из белого списка: иначе через наш ключ можно дёрнуть платную.
  model: z.string().refine(isKnownModel, 'неизвестная модель'),
});

/**
 * Кто к нам пришёл — для ограничения частоты.
 * За обратным прокси сюда придёт адрес прокси; тогда нужно будет читать
 * X-Forwarded-For, но доверять этому заголовку можно только от своего прокси.
 */
function clientKey(remoteAddress: string | undefined): string {
  return remoteAddress ?? 'unknown';
}

export const chatRoute = new Hono();

chatRoute.post('/chat', async (c) => {
  const requestId = newRequestId();
  const address = clientKey(getConnInfo(c).remote.address);

  if (!takeToken(address)) {
    log.warn('request.rate_limited', { requestId });
    return c.json(
      { code: 'local_rate_limited', retryAfterSec: retryAfterSeconds() },
      429,
    );
  }

  const body = await c.req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    log.warn('request.invalid', { requestId, issue: parsed.error.issues[0]?.message });
    return c.json({ code: 'bad_request' }, 400);
  }

  // Браузер закрыл соединение — либо нажали «Стоп», либо ушли со страницы.
  const cancellation = new AbortController();

  return streamSSE(c, async (stream) => {
    stream.onAbort(() => cancellation.abort());

    // Строка, начинающаяся с двоеточия, по спецификации SSE игнорируется
    // читателем. Нам она нужна как признак жизни: пока модель думает, данных
    // в соединении нет, и браузер не может отличить «ждём ответа» от «сервер
    // упал». Этот же приём использует сам OpenRouter.
    // Неудачная запись значит, что браузера на том конце уже нет: без обработки
    // это было бы необработанное отклонение промиса, а запрос к модели жил бы дальше.
    const heartbeat = setInterval(() => {
      void stream.write(': keep-alive\n\n').catch((error: unknown) => {
        if (!cancellation.signal.aborted) {
          log.warn('response.heartbeat_failed', {
            requestId,
            reason: error instanceof Error ? error.message.slice(0, 200) : 'неизвестная ошибка',
          });
        }
        cancellation.abort();
      });
    }, HEARTBEAT_INTERVAL_MS);

    try {
      for await (const event of streamChat({
        messages: parsed.data.messages,
        model: parsed.data.model,
        requestId,
        clientSignal: cancellation.signal,
      })) {
        await stream.writeSSE({ data: JSON.stringify(event) });
      }
    } finally {
      clearInterval(heartbeat);
    }
  });
});
