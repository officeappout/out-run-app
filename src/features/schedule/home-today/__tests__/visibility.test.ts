import { describe, it, expect } from 'vitest';
import { HOME_TODAY_CARDS_ON_HOME } from '../visibility';

describe('home "היום שלך" cards (Z3)', () => {
  it('stay hidden on home until the "what I did today" version is designed', () => {
    expect(HOME_TODAY_CARDS_ON_HOME).toBe(false);
  });
});
