/**
 * Хранение диалога между перезагрузками страницы.
 *
 * Выбран sessionStorage, а не localStorage: задание говорит «история в рамках
 * сессии», и sessionStorage — ровно это. Перезагрузка страницы и случайно
 * закрытая вкладка диалог не теряют, но чужая переписка не остаётся навсегда
 * в общем браузере и не копится без ведома человека.
 *
 * Прочитанное считается недоверенным: в хранилище мог остаться формат прошлой
 * версии или чужие данные с того же адреса, поэтому всё проверяется по форме.
 */

import { isErrorCode } from '@filament/shared';
import type { Turn, TurnStatus } from './types.ts';

const STORAGE_KEY = 'filament.history.v1';
const TURN_STATUSES = new Set<TurnStatus>(['pending', 'streaming', 'done', 'stopped', 'failed']);

/** Незавершённые реплики не восстанавливаем: поток после перезагрузки не продолжить. */
function isRestorable(turn: Turn): boolean {
  return turn.status !== 'pending' && turn.status !== 'streaming';
}

function isTurnStatus(value: unknown): value is TurnStatus {
  return typeof value === 'string' && TURN_STATUSES.has(value as TurnStatus);
}

function hasValidOptionalFields(turn: Record<string, unknown>): boolean {
  return (
    (turn.modelId === undefined || typeof turn.modelId === 'string') &&
    (turn.errorCode === undefined || isErrorCode(turn.errorCode)) &&
    (turn.retryAfterSec === undefined ||
      (typeof turn.retryAfterSec === 'number' &&
        Number.isFinite(turn.retryAfterSec) &&
        turn.retryAfterSec >= 0))
  );
}

/**
 * Проверяет не только наличие полей, но и их значения: реплика с неизвестным
 * статусом или кодом ошибки отрисовалась бы непредсказуемо.
 */
function isTurn(value: unknown): value is Turn {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const turn = value as Record<string, unknown>;

  const hasValidBase =
    typeof turn.id === 'string' &&
    (turn.role === 'user' || turn.role === 'assistant') &&
    typeof turn.content === 'string' &&
    isTurnStatus(turn.status) &&
    hasValidOptionalFields(turn);

  if (!hasValidBase) {
    return false;
  }

  // Вопрос человека бывает только отправленным, а упавший ответ без кода
  // ошибки нечем объяснить на экране.
  if (turn.role === 'user') {
    return turn.status === 'done';
  }
  return turn.status !== 'failed' || isErrorCode(turn.errorCode);
}

export function loadHistory(): Turn[] {
  let raw: string | null = null;

  try {
    raw = sessionStorage.getItem(STORAGE_KEY);
  } catch {
    // В приватном режиме обращение к хранилищу может бросить исключение.
    // Чат обязан работать и без истории, поэтому просто начинаем с чистого листа.
    return [];
  }

  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isTurn).filter(isRestorable) : [];
  } catch {
    // Испорченная запись — не повод падать: начинаем новый диалог.
    return [];
  }
}

export function saveHistory(turns: Turn[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(turns.filter(isRestorable)));
  } catch {
    // Хранилище переполнено или запрещено. История в памяти всё равно работает,
    // теряется только переживание перезагрузки — ради этого падать нельзя.
  }
}

export function clearHistory(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Нечего чистить — значит, и записать туда ничего не удалось.
  }
}
