import { beforeEach, describe, expect, it } from 'vitest';
import { RATE_LIMIT } from '../constants.ts';
import { resetRateLimit, takeToken } from './rate-limit.ts';

const NOW = 1_700_000_000_000;

describe('takeToken', () => {
  beforeEach(() => {
    resetRateLimit();
  });

  it('пропускает запросы в пределах запаса и отказывает дальше', () => {
    for (let attempt = 0; attempt < RATE_LIMIT.burst; attempt += 1) {
      expect(takeToken('1.2.3.4', NOW)).toBe(true);
    }

    expect(takeToken('1.2.3.4', NOW)).toBe(false);
  });

  it('считает адреса по отдельности', () => {
    for (let attempt = 0; attempt < RATE_LIMIT.burst; attempt += 1) {
      takeToken('1.2.3.4', NOW);
    }

    expect(takeToken('5.6.7.8', NOW)).toBe(true);
  });

  it('восстанавливает запас со временем', () => {
    for (let attempt = 0; attempt < RATE_LIMIT.burst; attempt += 1) {
      takeToken('1.2.3.4', NOW);
    }
    expect(takeToken('1.2.3.4', NOW)).toBe(false);

    expect(takeToken('1.2.3.4', NOW + 60_000)).toBe(true);
  });
});
