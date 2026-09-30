/** Одна реплика диалога: вопрос человека или ответ модели. */

import { findModel } from '@filament/shared/models';
import { errorText } from '../features/chat/errorText.ts';
import type { Turn } from '../features/chat/types.ts';
import { Markdown } from './Markdown.tsx';
import { Thread } from './Thread.tsx';
import './MessageItem.css';

type Props = {
  turn: Turn;
  onRetry: (answerId: string) => void;
};

export function MessageItem({ turn, onRetry }: Props) {
  if (turn.role === 'user') {
    return (
      <li className="turn-question">
        <h2 className="sr-only">Ваше сообщение</h2>
        <p className="turn-question__text">{turn.content}</p>
      </li>
    );
  }

  const failure = turn.errorCode ? errorText(turn.errorCode) : null;
  // Модель могли убрать из списка после того, как ответ сохранился в истории, —
  // тогда показываем её идентификатор как есть.
  const modelTitle = turn.modelId ? (findModel(turn.modelId)?.title ?? turn.modelId) : 'Модель';

  return (
    <li className="turn-answer">
      <Thread status={turn.status} />

      <div className="turn-answer__body">
        <h2 className="turn-answer__meta">{modelTitle}</h2>

        {turn.status === 'pending' && !failure ? (
          <p className="turn-answer__thinking">Модель думает…</p>
        ) : null}

        {turn.content ? (
          <Markdown text={turn.content} isStreaming={turn.status === 'streaming'} />
        ) : null}

        {turn.status === 'stopped' ? (
          <p className="turn-answer__note">
            {turn.content
              ? 'Остановлено. Полученный кусок ответа остался в истории.'
              : 'Остановлено — модель не успела сказать ни слова.'}
          </p>
        ) : null}

        {failure ? (
          <div className="turn-failure" role="alert">
            <p className="turn-failure__title">{failure.title}</p>
            <p className="turn-failure__hint">
              {failure.hint}
              {turn.retryAfterSec ? ` Подождите примерно ${turn.retryAfterSec} с.` : ''}
            </p>
            {failure.canRetry ? (
              <button
                type="button"
                className="turn-failure__retry"
                onClick={() => onRetry(turn.id)}
              >
                Повторить
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
