import { describe, expect, it } from 'vitest';
import { SseParser } from './sse.ts';

describe('SseParser', () => {
  it('собирает событие, разорванное между кусками сети', () => {
    const parser = new SseParser();

    expect(parser.push('data: {"a"')).toEqual([]);
    expect(parser.push(':1}\n\n')).toEqual(['{"a":1}']);
  });

  it('пропускает keep-alive комментарии OpenRouter', () => {
    const parser = new SseParser();

    const events = parser.push(': OPENROUTER PROCESSING\n\ndata: {"a":1}\n\n');

    expect(events).toEqual(['{"a":1}']);
  });

  it('читает несколько событий из одного куска', () => {
    const parser = new SseParser();

    const events = parser.push('data: one\n\ndata: two\n\ndata: [DONE]\n\n');

    expect(events).toEqual(['one', 'two', '[DONE]']);
  });

  it('понимает перевод строки в формате CRLF', () => {
    const parser = new SseParser();

    expect(parser.push('data: {"a":1}\r\n\r\n')).toEqual(['{"a":1}']);
  });

  it('не выдаёт событие, пока не пришла пустая строка', () => {
    const parser = new SseParser();

    expect(parser.push('data: {"a":1}\n')).toEqual([]);
  });
});
