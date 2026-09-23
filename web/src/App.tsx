/** Сборка экрана: шапка, лента диалога, поле ввода и клавиатурные сокращения. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { findModel } from '@filament/shared/models';
import { Composer } from './components/Composer.tsx';
import { EmptyState } from './components/EmptyState.tsx';
import { MessageItem } from './components/MessageItem.tsx';
import { ModelPicker } from './components/ModelPicker.tsx';
import { useChat } from './features/chat/useChat.ts';
import './App.css';

/** Насколько близко к низу нужно быть, чтобы лента продолжала прилипать к нему. */
const STICK_THRESHOLD_PX = 80;

export function App() {
  const chat = useChat();
  const [draft, setDraft] = useState('');

  const scrollRef = useRef<HTMLElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  // Пока человек внизу ленты — доводим её за ответом. Стоит отлистать вверх,
  // чтобы перечитать написанное, и автопрокрутка перестаёт вырывать текст из-под глаз.
  const stickToBottom = useRef(true);

  const handleScroll = useCallback(() => {
    const view = scrollRef.current;
    if (!view) {
      return;
    }
    const distance = view.scrollHeight - view.scrollTop - view.clientHeight;
    stickToBottom.current = distance < STICK_THRESHOLD_PX;
  }, []);

  useEffect(() => {
    const view = scrollRef.current;
    if (view && stickToBottom.current) {
      view.scrollTop = view.scrollHeight;
    }
  }, [chat.turns]);

  // Esc слушаем на всём окне, а не на кнопке «Стоп»: иначе сочетание работает
  // только тогда, когда фокус уже стоит на этой кнопке, а это бесполезно.
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && chat.isBusy) {
        event.preventDefault();
        chat.stop();
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [chat]);

  const pickSuggestion = (text: string) => {
    setDraft(text);
    fieldRef.current?.focus();
  };

  const modelTitle = findModel(chat.model)?.title ?? chat.model;

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__header-inner">
          <h1 className="app__brand">Нить</h1>

          <div className="app__tools">
            <ModelPicker value={chat.model} disabled={chat.isBusy} onChange={chat.setModel} />
            {chat.turns.length > 0 ? (
              <button type="button" className="app__clear" onClick={chat.clear}>
                Очистить
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <main ref={scrollRef} className="app__scroll" onScroll={handleScroll}>
        <div className="app__column">
          {chat.turns.length === 0 ? (
            <EmptyState onPick={pickSuggestion} />
          ) : (
            <ol className="app__list" role="log">
              {chat.turns.map((turn) => (
                <MessageItem
                  key={turn.id}
                  turn={turn}
                  modelTitle={modelTitle}
                  onRetry={chat.retry}
                />
              ))}
            </ol>
          )}
        </div>
      </main>

      {/* Состояние генерации словами — «нить» его показывает глазами, но программе
          чтения с экрана нужен текст. */}
      <p role="status" className="sr-only">
        {chat.isBusy ? 'Модель отвечает' : ''}
      </p>

      <footer className="app__footer">
        <Composer
          text={draft}
          isBusy={chat.isBusy}
          fieldRef={fieldRef}
          onChange={setDraft}
          onSend={chat.send}
          onStop={chat.stop}
        />
      </footer>
    </div>
  );
}
