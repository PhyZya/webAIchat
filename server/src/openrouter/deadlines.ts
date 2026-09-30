/**
 * Сторож таймаутов для одного обращения к модели.
 *
 * Таймаутов намеренно несколько, а не один общий: один общий либо рубит длинный
 * честный ответ на середине, либо выставляется таким большим, что зависший поток
 * висит минутами. Поэтому отдельно считаем ожидание первого токена, отдельно —
 * паузу между токенами, и сверху держим потолок на весь ответ.
 */

export type DeadlineReason = 'first_token' | 'stall' | 'total';

export class Deadlines {
  private readonly controller = new AbortController();
  private readonly totalTimer: NodeJS.Timeout;
  private stageTimer: NodeJS.Timeout | undefined;
  private reason: DeadlineReason | null = null;

  constructor(totalMs: number) {
    this.totalTimer = setTimeout(() => this.trip('total'), totalMs);
  }

  /** Сигнал, который надо передать в fetch. */
  get signal(): AbortSignal {
    return this.controller.signal;
  }

  /** Какой именно срок вышел, если вышел. */
  get expiredReason(): DeadlineReason | null {
    return this.reason;
  }

  /** Перевести текущий этап ожидания: предыдущий срок отменяется, начинается новый. */
  expect(ms: number, reason: DeadlineReason): void {
    clearTimeout(this.stageTimer);
    this.stageTimer = setTimeout(() => this.trip(reason), ms);
  }

  dispose(): void {
    clearTimeout(this.stageTimer);
    clearTimeout(this.totalTimer);
  }

  private trip(reason: DeadlineReason): void {
    // Общий срок и срок этапа могут выйти почти одновременно. Первая причина —
    // настоящая, вторая не должна её переписать.
    if (this.controller.signal.aborted) {
      return;
    }
    this.reason = reason;
    this.controller.abort();
    this.dispose();
  }
}
