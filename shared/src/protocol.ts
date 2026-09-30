/**
 * Протокол между браузером и нашим прокси.
 *
 * Почему свой протокол, а не проксирование сырого потока OpenRouter:
 * OpenRouter может отдать HTTP 200, начать поток и положить ошибку в его середину.
 * При простой перекачке байтов клиент этого не заметит и покажет оборванный ответ
 * как успешный. Разбирая поток на сервере, мы отдаём вниз явное событие ошибки.
 */

/**
 * Коды ошибок. Список объявлен значением, а не только типом: браузер получает
 * код строкой по сети, и его нужно проверять в рантайме, а не верить на слово.
 *
 * Текст для человека живёт на клиенте — сервер словами не разговаривает.
 */
export const ERROR_CODES = [
  /** 429 от OpenRouter: бесплатная модель занята или исчерпан лимит аккаунта. */
  'upstream_rate_limited',
  /** Наш собственный лимит запросов с одного адреса. */
  'local_rate_limited',
  /** 402 от OpenRouter: бесплатная квота аккаунта на сегодня исчерпана — ждать бесполезно. */
  'quota_exhausted',
  /** Модель не ответила вовремя или поток завис на середине. */
  'upstream_timeout',
  /** Модель недоступна: снята с каталога, перегружена, отвечает 5xx. */
  'model_unavailable',
  /** Прочий отказ OpenRouter. */
  'upstream_error',
  /** Тело запроса не прошло проверку схемой. */
  'bad_request',
  /** Сломались мы сами. */
  'server_error',
  /** Соединение браузера с нашим сервером оборвалось: пропала сеть, сервер упал. */
  'network_error',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value);
}

/** Причина штатного завершения потока. */
export type DoneReason =
  /** Модель закончила мысль. */
  | 'stop'
  /** Упёрлись в потолок токенов — ответ оборван по длине. */
  | 'length';

/** События, которые сервер шлёт вниз по SSE. */
export type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; reason: DoneReason }
  | { type: 'error'; code: ErrorCode; retryAfterSec?: number };

/** Роли сообщений. Системную роль клиент прислать не может — её ставит сервер. */
export type Role = 'user' | 'assistant';

export type ChatMessage = {
  role: Role;
  content: string;
};

export type ChatRequest = {
  messages: ChatMessage[];
  model: string;
};

/** Границы, общие для проверки на клиенте и схемы на сервере. */
export const LIMITS = {
  /** Длина одного сообщения пользователя. */
  maxUserMessageChars: 8_000,
  /**
   * Длина одного ответа модели в истории. Отдельный предел, потому что ответы
   * бывают намного длиннее вопросов: с общим пределом в 8 000 знаков один длинный
   * ответ делал невозможным следующий вопрос — сервер отклонял всю историю.
   */
  maxAssistantMessageChars: 100_000,
  /** Сколько сообщений истории уезжает в модель. */
  maxMessages: 40,
} as const;

/**
 * Разбор события, пришедшего строкой из SSE.
 * Возвращает null, если пришло что-то не по протоколу: рвать разговор из-за
 * одного непонятного события незачем.
 */
export function parseStreamEvent(payload: string): StreamEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }

  const event = parsed as Record<string, unknown>;

  if (event.type === 'delta' && typeof event.text === 'string') {
    return { type: 'delta', text: event.text };
  }

  if (event.type === 'done' && (event.reason === 'stop' || event.reason === 'length')) {
    return { type: 'done', reason: event.reason };
  }

  if (event.type === 'error' && isErrorCode(event.code)) {
    // NaN или отрицательное число превратились бы в «подождите NaN с.».
    const retryAfterSec = event.retryAfterSec;
    return {
      type: 'error',
      code: event.code,
      retryAfterSec:
        typeof retryAfterSec === 'number' && Number.isFinite(retryAfterSec) && retryAfterSec >= 0
          ? retryAfterSec
          : undefined,
    };
  }

  return null;
}
