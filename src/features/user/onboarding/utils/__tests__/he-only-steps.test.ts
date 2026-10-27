import { describe, it, expect } from 'vitest';
import { shouldShowHeOnlySteps, withoutHeOnlyPersonas } from '../he-only-steps';

describe('shouldShowHeOnlySteps', () => {
  it('flag off: always shown, any locale', () => {
    for (const locale of ['he', 'en', 'ru', 'de']) {
      expect(shouldShowHeOnlySteps({ locale, flagOn: false })).toBe(true);
    }
  });
  it('flag on + he: shown', () => {
    expect(shouldShowHeOnlySteps({ locale: 'he', flagOn: true })).toBe(true);
  });
  it('flag on + non-he: hidden', () => {
    for (const locale of ['en', 'ru', 'de']) {
      expect(shouldShowHeOnlySteps({ locale, flagOn: true })).toBe(false);
    }
  });
});

describe('withoutHeOnlyPersonas', () => {
  it('keeps everything when shown, drops military when hidden', () => {
    expect(withoutHeOnlyPersonas(['student', 'military'], true)).toEqual(['student', 'military']);
    expect(withoutHeOnlyPersonas(['student', 'military'], false)).toEqual(['student']);
  });
});
