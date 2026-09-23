/** Одна реплика диалога: вопрос человека или ответ модели. */

import { errorText } from '../features/chat/errorText.ts';
import type { Turn } from '../features/chat/types.ts';
import { Thread } from './Thread.tsx';
import './MessageItem.css';

type Props = {
  turn: Turn;
  /** Подпись над ответом — какая модель отвечает. */
  modelTitle: string;
  onRetry: () => void;
};

export function MessageItem({ turn, modelTitle, onRetry }: Props) {
  if (turn.role === 'user') {
    return (
      <li className="turn-question">
        <h2 className="sr-only">Ваше сообщение</h2>
        <p className="turn-question__text">{turn.content}</p>
      </li>
    );
  }

  const failure = turn.errorCode ? errorText(turn.errorCode) : null;

  return (
    <li className="turn-answer">
      <Thread status={turn.status} />

      <div className="turn-answer__body">
        <h2 className="turn-answer__meta">{modelTitle}</h2>

        {turn.status === 'pending' && !failure ? (
          <p className="turn-answer__thinking">Модель думает…</p>
        ) : null}

        {turn.content ? (
          <p className="turn-answer__text">
            {turn.content}
            {turn.status === 'streaming' ? <span className="turn-answer__caret" aria-hidden="true" /> : null}
          </p>
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
              <button type="button" className="turn-failure__retry" onClick={onRetry}>
                Повторить
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
