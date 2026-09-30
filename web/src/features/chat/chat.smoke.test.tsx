import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MODELS } from '@filament/shared/models';
import { MessageItem } from '../../components/MessageItem.tsx';
import { loadHistory, saveHistory } from './history.ts';
import {
  appendText,
  createAssistantTurn,
  createUserTurn,
  patchTurn,
  toChatMessages,
} from './turns.ts';

function memoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe('главный сценарий чата', () => {
  it('сохраняет оборванный ответ и модель после перезагрузки', () => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: memoryStorage(),
    });

    try {
      const question = createUserTurn('Объясни SSE');
      const answer = createAssistantTurn(MODELS[1].id);
      let turns = [question, answer];

      turns = appendText(turns, answer.id, 'Ответ приходит ');
      turns = appendText(turns, answer.id, 'по частям.');
      turns = patchTurn(turns, answer.id, { status: 'stopped' });
      saveHistory(turns);

      const restored = loadHistory();
      const restoredAnswer = restored[1];

      expect(restoredAnswer).toMatchObject({
        content: 'Ответ приходит по частям.',
        modelId: MODELS[1].id,
        status: 'stopped',
      });
      expect(toChatMessages(restored)).toEqual([
        { role: 'user', content: 'Объясни SSE' },
        { role: 'assistant', content: 'Ответ приходит по частям.' },
      ]);

      if (!restoredAnswer) {
        throw new Error('Ответ не восстановился из истории');
      }

      const html = renderToStaticMarkup(<MessageItem turn={restoredAnswer} onRetry={() => {}} />);
      expect(html).toContain(MODELS[1].title);
      expect(html).not.toContain(MODELS[0].title);
      expect(html).toContain('Остановлено. Полученный кусок ответа остался в истории.');
    } finally {
      Reflect.deleteProperty(globalThis, 'sessionStorage');
    }
  });
});
