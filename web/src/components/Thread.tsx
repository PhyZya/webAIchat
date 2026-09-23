/**
 * «Нить» — вертикальная линия слева от ответа модели.
 *
 * Это не украшение, а индикатор состояния: по виду линии видно, ждём ли мы
 * первый токен, идёт ли текст, договорила ли модель, оборвали ли её вручную
 * или всё сломалось. Она закрывает сразу три требования задания — показать,
 * что модель печатает; показать, что ответ неполный; не оставлять человека
 * наедине с вечным спиннером.
 *
 * Для программы чтения с экрана линия скрыта: то же самое сказано словами
 * в самой реплике.
 */

import type { TurnStatus } from '../features/chat/types.ts';
import './Thread.css';

const STATE_CLASS: Record<TurnStatus, string> = {
  pending: 'thread--pending',
  streaming: 'thread--streaming',
  done: 'thread--done',
  stopped: 'thread--stopped',
  failed: 'thread--failed',
};

type Props = {
  status: TurnStatus;
};

export function Thread({ status }: Props) {
  return (
    <span className={`thread ${STATE_CLASS[status]}`} aria-hidden="true">
      <span className="thread__line" />
    </span>
  );
}
