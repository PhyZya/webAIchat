/**
 * Что человек видит до первого сообщения.
 *
 * Пустой экран с полем ввода не отвечает на вопрос «а что тут можно спросить».
 * Поэтому: имя, одна строка о том, как это устроено, и три затравки,
 * которые подставляются в поле — не отправляются сами, решение остаётся за человеком.
 */

import './EmptyState.css';

const SUGGESTIONS = [
  'Объясни простыми словами, что такое Server-Sent Events',
  'Составь план изучения TypeScript на две недели',
  'Придумай пять названий для приложения-дневника',
] as const;

type Props = {
  onPick: (text: string) => void;
};

export function EmptyState({ onPick }: Props) {
  return (
    <section className="empty">
      <h2 className="empty__title">Спросите модель о чём угодно</h2>
      <p className="empty__subtitle">
        Ответ появляется по мере генерации — его видно с первого слова и можно оборвать
        в любой момент, не теряя написанного.
      </p>

      <ul className="empty__suggestions">
        {SUGGESTIONS.map((suggestion) => (
          <li key={suggestion}>
            <button type="button" className="empty__suggestion" onClick={() => onPick(suggestion)}>
              {suggestion}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
