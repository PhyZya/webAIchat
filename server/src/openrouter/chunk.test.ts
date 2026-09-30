import { describe, expect, it } from 'vitest';
import { eventFromClosedStream, parseChunk } from './chunk.ts';

describe('parseChunk', () => {
  it('достаёт текст из обычного куска ответа', () => {
    const result = parseChunk('{"choices":[{"delta":{"content":"Привет"}}]}');

    expect(result).toEqual({ kind: 'data', text: 'Привет', finish: null });
  });

  it('распознаёт конец потока', () => {
    expect(parseChunk('[DONE]')).toEqual({ kind: 'end' });
  });

  it('видит обрыв по длине ответа', () => {
    const result = parseChunk('{"choices":[{"delta":{},"finish_reason":"length"}]}');

    expect(result).toEqual({ kind: 'data', text: '', finish: 'length' });
  });

  it('превращает ошибку внутри потока в код нашего протокола', () => {
    // Главный случай ради которого поток разбирается на сервере: HTTP был 200,
    // а отказ приехал в середине уже открытого потока.
    const result = parseChunk('{"error":{"code":429,"message":"rate limited"}}');

    expect(result).toEqual({
      kind: 'error',
      code: 'upstream_rate_limited',
    });
  });

  it('считает повреждённое событие ошибкой внешнего сервиса', () => {
    expect(parseChunk('{не json')).toEqual({ kind: 'error', code: 'upstream_error' });
  });
});

describe('eventFromClosedStream', () => {
  it('считает конец соединения без причины завершения обрывом', () => {
    expect(eventFromClosedStream(null)).toEqual({ type: 'error', code: 'upstream_error' });
  });

  it('принимает конец соединения после finish_reason за штатное завершение', () => {
    expect(eventFromClosedStream('length')).toEqual({ type: 'done', reason: 'length' });
  });
});
