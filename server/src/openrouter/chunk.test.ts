import { describe, expect, it } from 'vitest';
import { parseChunk } from './chunk.ts';

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
      message: 'rate limited',
    });
  });

  it('не роняет разбор на битом JSON, а пропускает кусок', () => {
    expect(parseChunk('{не json')).toEqual({ kind: 'data', text: '', finish: null });
  });
});
