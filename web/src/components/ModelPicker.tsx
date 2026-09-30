/**
 * Выбор модели.
 *
 * Обычный select, а не своё выпадающее меню: он уже умеет клавиатуру,
 * программы чтения с экрана и родной вид на телефоне. Свой список пришлось бы
 * учить этому заново и хуже.
 *
 * Список нужен не ради выбора как такового: бесплатные модели регулярно заняты,
 * и возможность перейти на соседнюю — рабочий выход из ошибки 429.
 */

import { MODELS } from '@filament/shared/models';
import './ModelPicker.css';

type Props = {
  value: string;
  disabled: boolean;
  onChange: (model: string) => void;
};

export function ModelPicker({ value, disabled, onChange }: Props) {
  return (
    <div className="picker">
      <label className="sr-only" htmlFor="model-picker">
        Модель
      </label>
      <select
        id="model-picker"
        className="picker__select"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {MODELS.map((model) => (
          <option key={model.id} value={model.id}>
            {model.title} — {model.hint}
          </option>
        ))}
      </select>
    </div>
  );
}
