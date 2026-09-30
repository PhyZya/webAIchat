/** Поле ввода и кнопка действия: отправить или остановить. */

import { useEffect } from 'react';
import { LIMITS } from '@filament/shared';
import './Composer.css';

/** Выше этой высоты поле перестаёт расти и начинает прокручиваться. */
const MAX_HEIGHT_PX = 200;

/** За сколько символов до предела показываем счётчик. */
const COUNTER_MARGIN = 400;

type Props = {
  text: string;
  isBusy: boolean;
  /** Ссылку держит родитель: подстановка затравки должна вернуть фокус в поле. */
  fieldRef: React.RefObject<HTMLTextAreaElement | null>;
  onChange: (text: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
};

export function Composer({ text, isBusy, fieldRef, onChange, onSend, onStop }: Props) {

  // Поле растёт под текст: сначала сбрасываем высоту, иначе scrollHeight
  // запомнит прежний размер и поле перестанет уменьшаться.
  // Ссылка на узел между рендерами не меняется, поэтому в списке зависимостей
  // она безвредна — линтер считает её лишней только формально.
  /* oxlint-disable react/exhaustive-effect-dependencies */
  useEffect(() => {
    const field = fieldRef.current;
    if (!field) {
      return;
    }
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [text, fieldRef]);
  /* oxlint-enable react/exhaustive-effect-dependencies */

  const submit = () => {
    if (isBusy || !text.trim()) {
      return;
    }
    onSend(text);
    onChange('');
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // isComposing — набор иероглифов и других составных символов ещё не закончен,
    // Enter в этот момент подтверждает ввод в системной панели, а не отправляет.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const left = LIMITS.maxUserMessageChars - text.length;
  const showCounter = left <= COUNTER_MARGIN;

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label className="sr-only" htmlFor="composer-field">
        Сообщение модели
      </label>

      <textarea
        id="composer-field"
        ref={fieldRef}
        className="composer__field"
        value={text}
        onChange={(event) => onChange(event.target.value.slice(0, LIMITS.maxUserMessageChars))}
        onKeyDown={handleKeyDown}
        placeholder="Спросите что-нибудь"
        rows={1}
        maxLength={LIMITS.maxUserMessageChars}
        aria-describedby="composer-help"
      />

      {isBusy ? (
        <button type="button" className="composer__stop" onClick={onStop}>
          Стоп
        </button>
      ) : (
        <button type="submit" className="composer__send" disabled={!text.trim()}>
          Отправить
        </button>
      )}

      <p id="composer-help" className="composer__help">
        <span>
          <kbd>Enter</kbd> — отправить, <kbd>Shift</kbd>+<kbd>Enter</kbd> — перенос строки,{' '}
          <kbd>Esc</kbd> — остановить
        </span>
        {showCounter ? (
          <span className={left < 0 ? 'composer__counter--over' : 'composer__counter'}>
            осталось {left} знаков
          </span>
        ) : null}
      </p>
    </form>
  );
}
