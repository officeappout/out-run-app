/**
 * Static markup of the progress-polish pieces (enable_home_v2): the P-1c
 * summary ring card and the P-7 consistency rows. StreakFlame (Lottie) is
 * stubbed — only our markup is under test.
 */
import { describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/components/ui/v2/StreakFlame', () => ({
  default: ({ tones }: { tones: string[] }) => h('i', { 'data-flame': tones.join('-') }),
}));

import PeriodSummaryRingCard from '../PeriodSummaryRingCard';
import ConsistencyCard from '../ConsistencyCard';
import { periodRanges, summarizePeriod } from '../../utils/progress-period';
import { periodSpark } from '../../utils/period-spark';
import { consistencyDays } from '../../utils/consistency-days';
import type { ProgressWorkout } from '../../utils/progress-model';

const NOW = new Date(2026, 9, 21, 12);
const w = (over: Partial<ProgressWorkout> & { date: Date }): ProgressWorkout => ({
  id: Math.random().toString(36), kind: 'strength', type: 'strength', minutes: 30, km: 0, pace: 0, sets: 10, domainSets: {}, ...over,
});

describe('PeriodSummaryRingCard', () => {
  it('hero minutes in the ring, three numbers with bars, a chip per activity', () => {
    const r = periodRanges('week', NOW);
    const workouts = [
      w({ date: new Date(2026, 9, 18, 9), minutes: 40 }),
      w({ date: new Date(2026, 9, 20, 9), kind: 'run', type: 'running', minutes: 30, km: 5 }),
      w({ date: new Date(2026, 9, 12, 9), minutes: 20 }),
    ];
    const html = renderToStaticMarkup(
      h(PeriodSummaryRingCard, {
        period: 'week',
        ranges: r,
        current: summarizePeriod(workouts, [], r.current),
        previous: summarizePeriod(workouts, [], r.previous),
        spark: periodSpark('week', r.current, workouts, [], NOW),
      }),
    );
    expect(html).toContain('70');
    expect(html).toContain('פעילות');
    expect(html).toContain('אימונים');
    expect(html).toContain('ריצה והליכה');
    expect(html).toContain('כוח');
    expect(html).toContain('ריצה');
    expect(html).not.toContain('הליכה ·'); // no walk minutes → no walk chip
    expect(html).toContain('data-v2-delta="up"');
  });
});

describe('ConsistencyCard', () => {
  it('a flame + reason chips for a counted day, "לא נספר" for the rest', () => {
    const days = consistencyDays([w({ date: new Date(2026, 9, 21, 8), minutes: 25 })], [], new Date(2026, 9, 20), NOW);
    const html = renderToStaticMarkup(h(ConsistencyCard, { days, currentStreak: 3, longestStreak: 9 }));
    expect(html).toContain('התמדה · רצף 3 ימים');
    expect(html).toContain('השיא שלך 9 ימים');
    expect(html).toContain('כוח · 25 דק׳');
    expect(html).toContain('data-flame="strength"');
    expect(html).toContain('לא נספר');
    expect(html).toContain('10 דק׳ פעילות');
  });
});
