import { describe, expect, it } from 'vitest';
import { walkAddOn, walkAudience } from '../walkPolicy';

describe('walking × recommendation policy', () => {
  it('belly / weight loss get the light core add-on; health does not', () => {
    expect(walkAddOn('belly', [], 35)?.kind).toBe('core');
    expect(walkAddOn('weight_loss', [], 35)?.kind).toBe('core');
    expect(walkAddOn('health', [], 35)).toBeNull();
  });
  it('older adults by persona or age', () => {
    expect(walkAudience(['vatikim'], null)).toBe('senior');
    expect(walkAudience([], 70)).toBe('senior');
    expect(walkAudience([], 30)).toBe('general');
  });
});
