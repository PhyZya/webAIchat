/** Чтение и проверка переменных окружения. Всё падает здесь, при старте, а не в первом запросе. */

import { resolve } from 'node:path';

const ENV_FILE = resolve(import.meta.dirname, '../../.env');

// .env может не существовать: в продакшене переменные приходят из окружения,
// а не из файла. Отсутствие файла — не ошибка, отсутствие ключа — ошибка ниже.
try {
  process.loadEnvFile(ENV_FILE);
} catch {
  // файла нет — работаем с тем, что уже в окружении
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Не задана переменная окружения ${name}. Скопируйте .env.example в .env и заполните её.`,
    );
  }
  return value;
}

// Опечатка в PORT иначе превращается в NaN, и сервер падает с непонятной
// ошибкой уже при попытке слушать порт.
function readPort(): number {
  const port = Number(process.env.PORT ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT должен быть целым числом от 1 до 65535.');
  }
  return port;
}

export const config = {
  /** Ключ OpenRouter. Читается только здесь и уходит только в заголовок исходящего запроса. */
  openRouterKey: requireEnv('OPENROUTER_API_KEY'),
  port: readPort(),
  /** OpenRouter показывает эти два поля в статистике аккаунта. Не секреты. */
  appUrl: process.env.APP_URL ?? 'http://localhost:5173',
  appTitle: process.env.APP_TITLE ?? 'Filament',
  isProduction: process.env.NODE_ENV === 'production',
} as const;
