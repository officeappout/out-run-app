import { describe, it, expect } from 'vitest';
import { mergePlannedStrengthDays } from '../plannedStrengthDays';
import type { PlannedEntry } from '../../advisor/types';

const strength = (dow: number, slugs: string[], ids: PlannedEntry['strengthIds'] = []): PlannedEntry => ({
  date: `2026-10-${25 + dow}`,
  dayOfWeek: dow,
  kind: 'strength',
  source: 'override',
  strengthSlugs: slugs,
  strengthIds: ids,
  runRef: null,
  runDay: null,
  runName: null,
  completedAtSource: false,
});

describe('mergePlannedStrengthDays: pilot P11 (combined week shows strength like the schedule)', () => {
  it('adds the schedule doc strength days the template does not hold', () => {
    const out = mergePlannedStrengthDays([strength(0, ['push']), strength(3, [], ['FULL_BODY'])], []);
    expect(out).toEqual([
      { dow: 0, slug: 'push', ids: ['push'] },
      { dow: 3, slug: 'full_body', ids: ['FULL_BODY'] },
    ]);
  });

  it('keeps the template day when both have one, and ignores non-strength entries', () => {
    const run = { ...strength(2, []), kind: 'run' } as PlannedEntry;
    const out = mergePlannedStrengthDays([strength(1, ['pull']), run], [{ dow: 1, slug: 'legs', ids: ['legs'] }]);
    expect(out).toEqual([{ dow: 1, slug: 'legs', ids: ['legs'] }]);
  });

  it('a strength entry with no known id still shows (neutral full body)', () => {
    expect(mergePlannedStrengthDays([strength(4, [])], [])).toEqual([{ dow: 4, slug: 'full_body', ids: ['full_body'] }]);
  });
});
