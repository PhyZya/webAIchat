/**
 * Коды ошибок в человеческие слова.
 *
 * Тексты живут на клиенте, а не приходят с сервера: сервер не должен решать,
 * как разговаривать с пользователем, а переводить интерфейс проще, когда все
 * формулировки лежат в одном файле.
 */

import type { ErrorCode } from '@filament/shared';

export type ErrorText = {
  /** Короткая строка: что произошло. */
  title: string;
  /** Что с этим делать. */
  hint: string;
  /** Имеет ли смысл кнопка «Повторить». */
  canRetry: boolean;
};

const TEXTS: Record<ErrorCode, ErrorText> = {
  upstream_rate_limited: {
    title: 'Модель сейчас занята',
    hint: 'Бесплатные модели делятся между всеми. Подождите немного или выберите другую.',
    canRetry: true,
  },
  local_rate_limited: {
    title: 'Слишком много запросов подряд',
    hint: 'Это ограничение нашего сервера. Подождите несколько секунд.',
    canRetry: true,
  },
  quota_exhausted: {
    title: 'Бесплатная квота на сегодня исчерпана',
    hint: 'Лимит бесплатных запросов у аккаунта закончился — ждать в пределах минуты бесполезно.',
    canRetry: false,
  },
  upstream_timeout: {
    title: 'Модель не ответила вовремя',
    hint: 'Скорее всего, она перегружена. Попробуйте ещё раз или смените модель.',
    canRetry: true,
  },
  model_unavailable: {
    title: 'Модель недоступна',
    hint: 'Её могли снять с публикации или она перегружена. Выберите другую в списке сверху.',
    canRetry: true,
  },
  upstream_error: {
    title: 'Сервис моделей ответил ошибкой',
    hint: 'Ошибка на стороне OpenRouter. Обычно помогает повтор.',
    canRetry: true,
  },
  bad_request: {
    title: 'Сообщение не принято',
    hint: 'Оно пустое или слишком длинное. Сократите и отправьте снова.',
    canRetry: false,
  },
  server_error: {
    title: 'Сбой на нашей стороне',
    hint: 'Проверьте, что в .env указан рабочий ключ OpenRouter, и посмотрите консоль сервера.',
    canRetry: true,
  },
  network_error: {
    title: 'Нет связи с сервером',
    hint: 'Соединение оборвалось. Проверьте сеть и то, что сервер запущен.',
    canRetry: true,
  },
};

export function errorText(code: ErrorCode): ErrorText {
  return TEXTS[code];
}
