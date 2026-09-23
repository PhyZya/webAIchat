/**
 * Разбор потока Server-Sent Events.
 *
 * Лежит в общем пакете, потому что нужен обеим сторонам: сервер разбирает им поток
 * OpenRouter, браузер — поток от нашего сервера. Формат один и тот же, и двух копий
 * одного парсера в проекте быть не должно.
 *
 * Написан руками, а не взят библиотекой: нужного здесь — полсотни строк,
 * а поведение на границах кусков (событие пришло разорванным между чтениями)
 * хочется видеть глазами и покрыть тестом.
 */

/** Символ, которым SSE отделяет имя поля от значения. */
const FIELD_SEPARATOR = ':';

export class SseParser {
  /** Хвост последнего куска: строка могла оборваться на середине. */
  private buffer = '';

  /** Строки data: текущего события — по спецификации их может быть несколько. */
  private dataLines: string[] = [];

  /**
   * Принимает очередной кусок текста и возвращает содержимое всех событий,
   * которые в нём завершились.
   */
  push(chunk: string): string[] {
    this.buffer += chunk;

    const lines = this.buffer.split('\n');
    // Последний элемент — незавершённая строка, оставляем до следующего куска.
    this.buffer = lines.pop() ?? '';

    const events: string[] = [];

    for (const rawLine of lines) {
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

      if (line === '') {
        const completed = this.flush();
        if (completed !== null) {
          events.push(completed);
        }
        continue;
      }

      // Строка, начинающаяся с двоеточия, — комментарий. OpenRouter шлёт ими
      // keep-alive (": OPENROUTER PROCESSING"), чтобы соединение не закрыли прокси.
      if (line.startsWith(FIELD_SEPARATOR)) {
        continue;
      }

      const separatorAt = line.indexOf(FIELD_SEPARATOR);
      const field = separatorAt === -1 ? line : line.slice(0, separatorAt);
      if (field !== 'data') {
        // Поля event/id/retry нам не нужны: протокол OpenRouter их не использует.
        continue;
      }

      const value = separatorAt === -1 ? '' : line.slice(separatorAt + 1);
      // Спецификация разрешает ровно один пробел после двоеточия — он не часть данных.
      this.dataLines.push(value.startsWith(' ') ? value.slice(1) : value);
    }

    return events;
  }

  /** Отдаёт накопленное событие и очищает накопитель. null — если накапливать было нечего. */
  private flush(): string | null {
    if (this.dataLines.length === 0) {
      return null;
    }
    const payload = this.dataLines.join('\n');
    this.dataLines = [];
    return payload;
  }
}
