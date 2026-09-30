import { describe, expect, it } from 'vitest';
import { LIMITS } from '@filament/shared';
import type { Turn } from './types.ts';
import {
  createAssistantTurn,
  createUserTurn,
  prepareRetry,
  toChatMessages,
} from './turns.ts';

describe('операции с историей диалога', () => {
  it('повторяет выбранный ответ и отбрасывает более позднюю ветку', () => {
    const question = createUserTurn('Первый вопрос');
    const failedAnswer: Turn = {
      ...createAssistantTurn('old-model'),
      status: 'failed',
      errorCode: 'upstream_error',
    };
    const laterQuestion = createUserTurn('Следующий вопрос');

    const plan = prepareRetry(
      [question, failedAnswer, laterQuestion],
      failedAnswer.id,
      'new-model',
    );

    expect(plan).not.toBeNull();
    if (!plan) {
      throw new Error('План повтора не создан');
    }

    expect(plan.history).toEqual([question]);
    expect(plan.turns).toEqual([question, plan.answer]);
    expect(plan.answer).toMatchObject({ role: 'assistant', modelId: 'new-model' });
  });

  it('не отправляет на сервер больше допустимого числа сообщений', () => {
    const turns = Array.from({ length: LIMITS.maxMessages + 1 }, (_, index): Turn => ({
      id: String(index),
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: String(index),
      status: 'done',
    }));

    const messages = toChatMessages(turns);

    expect(messages).toHaveLength(LIMITS.maxMessages - 1);
    expect(messages[0]?.role).toBe('user');
    expect(messages.at(-1)?.content).toBe(String(LIMITS.maxMessages));
  });

  it('обрезает слишком длинный ответ только в контексте для модели', () => {
    const answer: Turn = {
      id: 'answer',
      role: 'assistant',
      content: `начало${'x'.repeat(LIMITS.maxAssistantMessageChars)}`,
      status: 'done',
    };

    const messages = toChatMessages([createUserTurn('Вопрос'), answer]);

    expect(messages[0]?.role).toBe('user');
    expect(messages[1]?.content).toHaveLength(LIMITS.maxAssistantMessageChars);
    expect(answer.content).toMatch(/^начало/);
  });
});
