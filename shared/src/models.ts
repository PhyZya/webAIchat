/**
 * Белый список моделей.
 *
 * Список здесь, а не в запросе клиента, по двум причинам:
 * клиент не должен иметь права отправить наш ключ в произвольную платную модель,
 * и селектор в интерфейсе нужен как рабочий выход из 429 — бесплатные модели
 * регулярно заняты, и «попробуйте другую» честнее, чем тупик с ошибкой.
 *
 * Все модели с суффиксом :free — как требует задание.
 */

export type ModelOption = {
  /** Идентификатор в каталоге OpenRouter. */
  id: string;
  /** Как называем в интерфейсе. */
  title: string;
  /** Одна строка о том, чем эта модель отличается от соседей. */
  hint: string;
};

// Порядок имеет значение: первая модель становится значением по умолчанию.
// Наверх поставлены те, что отвечали на момент проверки — бесплатные модели
// регулярно заняты, и встречать человека ошибкой 429 на первом же сообщении плохо.
//
// as const делает список кортежем известной длины — тогда MODELS[0] типизирован
// как существующий элемент и годится в значение по умолчанию.
export const MODELS = [
  {
    id: 'z-ai/glm-5.2:free',
    title: 'GLM 5.2',
    hint: 'Короткие ответы по делу',
  },
  {
    id: 'nvidia/nemotron-3-super-120b-a12b:free',
    title: 'Nemotron 3 Super',
    hint: 'Крупная модель, отвечает подробнее',
  },
  {
    id: 'google/gemma-4-31b-it:free',
    title: 'Gemma 4 31B',
    hint: 'Ровно говорит по-русски',
  },
  {
    id: 'qwen/qwen3.8-27b:free',
    title: 'Qwen 3.8 27B',
    hint: 'Быстрая, хороша в коде',
  },
] as const satisfies readonly ModelOption[];

export const DEFAULT_MODEL_ID = MODELS[0].id;

export function isKnownModel(id: string): boolean {
  return MODELS.some((model) => model.id === id);
}

export function findModel(id: string): ModelOption | undefined {
  return MODELS.find((model) => model.id === id);
}
