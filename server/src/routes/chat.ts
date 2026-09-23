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
import { log, newRequestId } from '../lib/logger.ts';
import { retryAfterSeconds, takeToken } from '../lib/rate-limit.ts';
import { streamChat } from '../openrouter/client.ts';

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(LIMITS.maxMessageChars),
});

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

    for await (const event of streamChat({
      messages: parsed.data.messages,
      model: parsed.data.model,
      requestId,
      clientSignal: cancellation.signal,
    })) {
      await stream.writeSSE({ data: JSON.stringify(event) });
    }
  });
});
