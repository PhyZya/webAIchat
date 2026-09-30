/**
 * Перевод отказов OpenRouter в коды нашего протокола.
 *
 * Отдельным файлом, потому что отказ приходит двумя разными путями — HTTP-статусом
 * до начала потока и объектом error в середине уже открытого потока, — а состояние
 * для пользователя в обоих случаях должно получаться одно и то же.
 */

import type { ErrorCode } from '@filament/shared';

export function codeFromStatus(status: number): ErrorCode {
  switch (status) {
    case 401:
    case 403:
      // Ключ неверный или отозван. Это поломка нашей настройки, а не действий
      // пользователя, поэтому наружу отдаём общий серверный сбой.
      return 'server_error';
    case 402:
      return 'quota_exhausted';
    case 404:
      return 'model_unavailable';
    case 408:
      return 'upstream_timeout';
    case 429:
      return 'upstream_rate_limited';
    case 502:
    case 503:
    case 504:
      return 'model_unavailable';
    default:
      return 'upstream_error';
  }
}

/** Заголовок Retry-After: либо секунды, либо дата. Возвращаем секунды. */
export function parseRetryAfter(header: string | null): number | undefined {
  if (!header) {
    return undefined;
  }

  const asSeconds = Number(header);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.ceil(asSeconds);
  }

  const asDate = Date.parse(header);
  if (Number.isNaN(asDate)) {
    return undefined;
  }

  const seconds = Math.ceil((asDate - Date.now()) / 1000);
  return seconds > 0 ? seconds : undefined;
}

type UpstreamErrorShape = {
  error?: {
    code?: unknown;
    message?: unknown;
  };
};

/**
 * Достаёт код ошибки из тела ответа или из события внутри потока.
 * Возвращает undefined, если ошибки в теле нет.
 */
export function codeFromPayload(payload: unknown): ErrorCode | undefined {
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }

  const { error } = payload as UpstreamErrorShape;
  if (!error) {
    return undefined;
  }

  return typeof error.code === 'number' ? codeFromStatus(error.code) : 'upstream_error';
}
