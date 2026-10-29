import { describe, it, expect } from 'vitest';
import { calmRunCategory } from '../calm-run-category';

const calm = { runEasyOnly: true };

describe('calmRunCategory (next run card under calm return)', () => {
  it('a quality run shows as an easy run', () => {
    expect(calmRunCategory('short_intervals', calm)).toBe('easy_run');
    expect(calmRunCategory('tempo', calm)).toBe('easy_run');
  });
  it('easy and long runs keep their category', () => {
    expect(calmRunCategory('fartlek_easy', calm)).toBe('fartlek_easy');
    expect(calmRunCategory('long_run', calm)).toBe('long_run');
  });
  it('no calm load, or a lighter load that keeps quality runs → unchanged', () => {
    expect(calmRunCategory('short_intervals', null)).toBe('short_intervals');
    expect(calmRunCategory('short_intervals', { runEasyOnly: false })).toBe('short_intervals');
    expect(calmRunCategory(null, calm)).toBeNull();
  });
});
