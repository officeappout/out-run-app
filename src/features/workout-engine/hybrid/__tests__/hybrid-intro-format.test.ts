import { describe, it, expect } from 'vitest';
import { formatApproxDistance } from '../hybrid-intro-format';

describe('formatApproxDistance — start-of-walk intro distance readout (G3.1)', () => {
  it('rounds sub-100m distances to the nearest meter', () => {
    expect(formatApproxDistance(42)).toBe('42 מ׳');
    expect(formatApproxDistance(0)).toBe('0 מ׳');
  });

  it('rounds 100-999m distances to the nearest 10m', () => {
    expect(formatApproxDistance(234)).toBe('230 מ׳');
    expect(formatApproxDistance(999)).toBe('1000 מ׳');
  });

  it('shows km with one decimal at 1000m and above', () => {
    expect(formatApproxDistance(1000)).toBe('1.0 ק"מ');
    expect(formatApproxDistance(1700)).toBe('1.7 ק"מ');
  });
});
