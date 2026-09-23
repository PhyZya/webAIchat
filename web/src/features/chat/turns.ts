/**
 * Чистые операции над списком реплик.
 *
 * Отдельно от хука, потому что здесь нет ни React, ни сети: это просто
 * преобразования данных, которые удобно читать и проверять по отдельности.
 * Все функции возвращают новый список и не трогают старый.
 */

import type { ChatMessage } from '@filament/shared';
import type { Turn, TurnStatus } from './types.ts';

export function createTurn(role: Turn['role'], content: string, status: TurnStatus): Turn {
  return { id: crypto.randomUUID(), role, content, status };
}

export function patchTurn(turns: Turn[], id: string, patch: Partial<Turn>): Turn[] {
  return turns.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn));
}

export function appendText(turns: Turn[], id: string, text: string): Turn[] {
  return turns.map((turn) =>
    turn.id === id ? { ...turn, content: turn.content + text, status: 'streaming' } : turn,
  );
}

/**
 * Готовит историю для отправки модели.
 *
 * Пустые реплики выбрасываем: сервер их не примет, да и смысла в них нет.
 * Оборванный ответ, наоборот, оставляем — он часть разговора, и модель должна
 * видеть, на чём её прервали.
 */
export function toChatMessages(turns: Turn[]): ChatMessage[] {
  return turns
    .filter((turn) => turn.content.trim().length > 0)
    .map((turn) => ({ role: turn.role, content: turn.content }));
}
