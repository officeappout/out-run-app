/**
 * P-1e entry + sheet markup (enable_home_v2 progress tab). The Sheet primitive
 * is stubbed to render its children inline (it portals after mount).
 */
import { describe, expect, it, vi } from 'vitest';
import { createElement as h, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/components/ui/v2/Sheet', () => ({
  default: ({ open, title, children }: { open: boolean; title: string; children: ReactNode }) =>
    open ? h('section', { 'data-sheet': title }, children) : null,
}));

import PeriodSummaryRingCard from '../PeriodSummaryRingCard';
import PeriodCompareSheet from '../PeriodCompareSheet';
import { periodRanges, summarizePeriod } from '../../utils/progress-period';
import { periodSpark } from '../../utils/period-spark';
import type { ProgressWorkout } from '../../utils/progress-model';

const NOW = new Date(2026, 9, 21, 12);
const w = (over: Partial<ProgressWorkout> & { date: Date }): ProgressWorkout => ({
  id: Math.random().toString(36), kind: 'strength', type: 'strength', minutes: 30, km: 0, pace: 0, sets: 0, domainSets: {}, ...over,
});
const workouts = [
  w({ date: new Date(2026, 9, 19, 9), minutes: 96 }),
  w({ date: new Date(2026, 9, 20, 9), kind: 'run', type: 'running', minutes: 60, km: 11 }),
  w({ date: new Date(2026, 9, 12, 9), minutes: 70 }),
  w({ date: new Date(2026, 9, 13, 9), kind: 'run', type: 'running', minutes: 66, km: 12 }),
];
const ranges = periodRanges('week', NOW);
const current = summarizePeriod(workouts, [], ranges.current);
const previous = summarizePeriod(workouts, [], ranges.previous);

describe('summary card → comparison entry', () => {
  it('without onOpenCompare the card is unchanged (plain label, no buttons on the deltas)', () => {
    const html = renderToStaticMarkup(
      h(PeriodSummaryRingCard, { period: 'week', ranges, current, previous, spark: periodSpark('week', ranges.current, workouts, [], NOW) }),
    );
    expect(html).not.toContain('data-open-compare');
    expect(html).not.toContain('aria-label="השוואה');
  });

  it('with onOpenCompare: the "מול שבוע שעבר" pill, the ring and each ▲▼ are tap targets', () => {
    const html = renderToStaticMarkup(
      h(PeriodSummaryRingCard, {
        period: 'week', ranges, current, previous, spark: periodSpark('week', ranges.current, workouts, [], NOW), onOpenCompare: () => {},
      }),
    );
    expect(html).toContain('data-open-compare');
    expect(html).toContain('aria-label="השוואה מול שבוע שעבר"');
    expect(html).toContain('aria-label="השוואה · אימונים"');
  });
});

describe('PeriodCompareSheet', () => {
  it('headline, split bar and a paired row per activity', () => {
    const html = renderToStaticMarkup(h(PeriodCompareSheet, { open: true, onClose: () => {}, period: 'week', ranges, current, previous, now: NOW }));
    expect(html).toContain('data-sheet="השוואה"');
    expect(html).toContain('זזת 15% יותר'); // 156 vs 136 min
    expect(html).toContain('data-compare-tone="up"');
    expect(html).toContain('data-v2-split-bar');
    expect((html.match(/data-v2-paired-row/g) ?? []).length).toBe(2);
    expect(html).toContain('כוח · דקות');
    expect(html).toContain('ריצה · ק״מ');
  });

  it('closed → nothing', () => {
    expect(renderToStaticMarkup(h(PeriodCompareSheet, { open: false, onClose: () => {}, period: 'week', ranges, current, previous, now: NOW }))).toBe('');
  });
});
