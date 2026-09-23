/**
 * Единственная точка логирования на сервере.
 *
 * Поля намеренно ограничены примитивами: так в лог физически нельзя передать
 * массив сообщений или тело ответа модели. В лог идут идентификаторы, размеры
 * и итоги — по ним видно, наш это сбой или чужой сервис, и при этом переписка
 * пользователя никуда не утекает.
 */

type Level = 'info' | 'warn' | 'error';

type Fields = Record<string, string | number | boolean | undefined>;

function write(level: Level, event: string, fields: Fields = {}): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  });

  if (level === 'error') {
    console.error(line);
    return;
  }
  console.log(line);
}

export const log = {
  info: (event: string, fields?: Fields) => write('info', event, fields),
  warn: (event: string, fields?: Fields) => write('warn', event, fields),
  error: (event: string, fields?: Fields) => write('error', event, fields),
};

/** Короткий идентификатор запроса — чтобы связать строки одного обращения в логе. */
export function newRequestId(): string {
  return Math.random().toString(36).slice(2, 10);
}
