import { describe, it, expect } from 'vitest';
import { parseDurationSeconds } from '../duration-target';

describe('parseDurationSeconds (pilot M20)', () => {
  it('ignores the sets prefix of a station label', () => {
    expect(parseDurationSeconds('1×20 שניות')).toBe(20);
    expect(parseDurationSeconds('3×45 שניות')).toBe(45);
    expect(parseDurationSeconds('3x30 שניות')).toBe(30);
  });
  it('reads a plain label and falls back when empty', () => {
    expect(parseDurationSeconds('45 שניות')).toBe(45);
    expect(parseDurationSeconds('20-30 שניות')).toBe(20);
    expect(parseDurationSeconds(undefined)).toBe(30);
    expect(parseDurationSeconds('שניות', 15)).toBe(15);
  });
});
