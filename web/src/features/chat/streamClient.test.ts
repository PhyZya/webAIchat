import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StreamEvent } from '@filament/shared';
import { streamChat } from './streamClient.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('streamChat', () => {
  it('заканчивает чтение сразу после итогового события', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('data: {"type":"done","reason":"stop"}\n\n'),
        );
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })));

    const events: StreamEvent[] = [];
    await streamChat(
      { model: 'test-model', messages: [{ role: 'user', content: 'Привет' }] },
      new AbortController().signal,
      (event) => events.push(event),
    );

    expect(events).toEqual([{ type: 'done', reason: 'stop' }]);
  });
});
