/**
 * Чистые операции над списком реплик.
 *
 * Отдельно от хука, потому что здесь нет ни React, ни сети: это просто
 * преобразования данных, которые удобно читать и проверять по отдельности.
 * Все функции возвращают новый список и не трогают старый.
 */

import { LIMITS, type ChatMessage } from '@filament/shared';
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
 *
 * Границы сервера соблюдаем здесь же, иначе длинный разговор однажды целиком
 * получит отказ: берём только последние сообщения, а слишком длинный ответ
 * обрезаем с начала — конец ближе к следующему вопросу. На экране история
 * остаётся полной, обрезается только то, что уходит в модель.
 */
export function toChatMessages(turns: Turn[]): ChatMessage[] {
  const messages = turns
    .filter((turn) => turn.content.trim().length > 0)
    .map((turn) => ({
      role: turn.role,
      content:
        turn.role === 'assistant'
          ? turn.content.slice(-LIMITS.maxAssistantMessageChars)
          : turn.content,
    }));

  // Разговор, который начинается с ответа модели без вопроса, выглядит для неё
  // странно, поэтому после среза первым всегда идёт вопрос.
  const limited = messages.slice(-LIMITS.maxMessages);
  return limited[0]?.role === 'assistant' ? limited.slice(1) : limited;
}
