/**
 * Ограничение частоты запросов по адресу клиента.
 *
 * Зачем это здесь: требование задания «ключ не должен попадать в браузер» закрывает
 * утечку ключа, но не закрывает то, что эндпоинт /api/chat открыт всем, кто узнал адрес.
 * Без лимита прокси — это бесплатный публичный доступ к чужому ключу и квоте.
 *
 * Счётчики живут в памяти процесса: для одного сервера этого достаточно, а тащить
 * Redis в проект без базы данных — несоразмерно.
 */

import { RATE_LIMIT } from '../constants.ts';

type Bucket = {
  tokens: number;
  updatedAt: number;
};

const MINUTE_MS = 60_000;

/** Записи старше этого срока считаем протухшими и выкидываем, чтобы карта не росла бесконечно. */
const IDLE_TTL_MS = 10 * MINUTE_MS;

const buckets = new Map<string, Bucket>();

function refill(bucket: Bucket, now: number): number {
  const elapsedMinutes = (now - bucket.updatedAt) / MINUTE_MS;
  const restored = elapsedMinutes * RATE_LIMIT.perMinute;
  return Math.min(RATE_LIMIT.burst, bucket.tokens + restored);
}

function dropStale(now: number): void {
  for (const [key, bucket] of buckets) {
    if (now - bucket.updatedAt > IDLE_TTL_MS) {
      buckets.delete(key);
    }
  }
}

/**
 * Пытается списать одну попытку. Возвращает false, если лимит исчерпан.
 */
export function takeToken(clientKey: string, now: number = Date.now()): boolean {
  dropStale(now);

  const existing = buckets.get(clientKey);
  const tokens = existing ? refill(existing, now) : RATE_LIMIT.burst;

  if (tokens < 1) {
    buckets.set(clientKey, { tokens, updatedAt: now });
    return false;
  }

  buckets.set(clientKey, { tokens: tokens - 1, updatedAt: now });
  return true;
}

/** Через сколько секунд имеет смысл повторить попытку. */
export function retryAfterSeconds(): number {
  return Math.ceil(MINUTE_MS / RATE_LIMIT.perMinute / 1000);
}

/** Только для тестов: сбросить накопленное состояние. */
export function resetRateLimit(): void {
  buckets.clear();
}
