/** Progress hub v2 — strength page: balance, sets per week, insights only from real data, render. */
import { describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null } }));

import { imbalanceInsight, monthDomainSets, mostImproved, newRecord, trendOf, weeklySets } from '../strength/strength-page.model';
import { toExerciseTrend, type ExerciseTrend } from '../strength/exercise-trends.service';
import StrengthInsightsCard from '../strength/StrengthInsightsCard';
import MuscleBalanceCard from '../strength/MuscleBalanceCard';
import StrengthExercisesList from '../strength/StrengthExercisesList';
import type { ProgressWorkout } from '../../utils/progress-model';

const NOW = new Date(2026, 9, 22, 12);
const w = (d: Date, sets: number, domainSets: Record<string, number> = {}): ProgressWorkout => ({
  id: `${d.getTime()}`, date: d, kind: 'strength', type: 'strength', minutes: 40, km: 0, pace: 0, sets, domainSets,
});
const ex = (over: Partial<ExerciseTrend>): ExerciseTrend => ({
  exerciseId: 'e', name: 'E', recentMax: [], lastBest: 0, bestReps: 0, bestAt: null, updatedAt: null, ...over,
});

const workouts = [
  w(new Date(2026, 8, 28, 9), 10, { push: 10 }), // last month — not in balance
  w(new Date(2026, 9, 6, 9), 18, { push: 8, pull: 6, legs: 2 }),
  w(new Date(2026, 9, 14, 9), 20, { push: 6, pull: 8, legs: 2, core: 4 }),
  w(new Date(2026, 9, 20, 9), 16, { pull: 6, push: 6, core: 4 }),
];

describe('strength model', () => {
  it('muscle balance = this month, sorted', () => {
    expect(monthDomainSets(workouts, NOW)).toEqual([
      { domain: 'push', sets: 20 },
      { domain: 'pull', sets: 20 },
      { domain: 'core', sets: 8 },
      { domain: 'legs', sets: 4 },
    ]);
  });

  it('sets per week, the current week last', () => {
    const v = weeklySets(workouts, NOW);
    expect(v).toHaveLength(8);
    expect(v[7]).toMatchObject({ done: 16, current: true });
    expect(v[6].done).toBe(20);
  });

  it('imbalance only with enough sets and a real gap', () => {
    expect(imbalanceInsight(monthDomainSets(workouts, NOW))).toEqual({ low: { domain: 'legs', sets: 4 }, high: { domain: 'push', sets: 20 } });
    expect(imbalanceInsight([{ domain: 'push', sets: 6 }, { domain: 'legs', sets: 1 }])).toBeNull(); // < 12 sets
    expect(imbalanceInsight([{ domain: 'push', sets: 10 }, { domain: 'legs', sets: 8 }])).toBeNull(); // balanced
  });

  it('most improved needs ≥ 3 sessions and a real gain; new record = best set in the last 7 days', () => {
    const list = [
      ex({ name: 'A', recentMax: [10, 11, 12] }),
      ex({ name: 'B', recentMax: [5, 6, 7, 8] }),
      ex({ name: 'C', recentMax: [9, 9] }),
      ex({ name: 'D', bestReps: 9, bestAt: new Date(2026, 9, 19) }),
      ex({ name: 'F', bestReps: 30, bestAt: new Date(2026, 8, 1) }),
    ];
    expect(mostImproved(list)).toEqual({ name: 'B', from: 5, to: 8, pct: 60, sessions: 4 });
    expect(mostImproved([ex({ recentMax: [8, 8, 8] })])).toBeNull();
    expect(newRecord(list, NOW)).toMatchObject({ name: 'D', reps: 9 });
    expect(newRecord([list[4]], NOW)).toBeNull();
    expect(trendOf([5, 8])).toBe('up');
    expect(trendOf([5])).toBeNull();
  });

  it('exerciseHistory doc → trend (recentMax, else the last reps)', () => {
    expect(toExerciseTrend('x', { exerciseName: 'Pull', reps: [8, 7], recentMax: [6, 8], bestReps: 9 })).toMatchObject({ name: 'Pull', lastBest: 8, bestReps: 9 });
    expect(toExerciseTrend('y', { reps: [8, 10] })).toMatchObject({ name: 'y', lastBest: 10, recentMax: [] });
  });
});

describe('strength render', () => {
  it('no insight → no card; insights render only what exists', () => {
    expect(renderToStaticMarkup(h(StrengthInsightsCard, { improved: null, imbalance: null, record: null }))).toBe('');
    const html = renderToStaticMarkup(
      h(StrengthInsightsCard, {
        improved: { name: 'מתח', from: 5, to: 8, pct: 60, sessions: 4 },
        imbalance: { low: { domain: 'legs', sets: 4 }, high: { domain: 'push', sets: 20 } },
        record: null,
      }),
    );
    expect(html).toContain('הכי השתפר: מתח +60%');
    expect(html).toContain('איזון: רגליים מאחור');
    expect(html).toContain('4 סטים של רגליים מול 20 של דחיפה החודש');
    expect(html).not.toContain('שיא חדש');
  });

  it('muscle balance bars are cyan; exercises show the last best and a trend line', () => {
    const bal = renderToStaticMarkup(h(MuscleBalanceCard, { domains: [{ domain: 'pull', sets: 10 }] }));
    expect(bal).toContain('משיכה');
    expect(bal).toContain('background:#00baf7');
    const list = renderToStaticMarkup(h(StrengthExercisesList, { items: [ex({ exerciseId: 'p', name: 'מתח', recentMax: [5, 7, 9], lastBest: 9 })] }));
    expect(list).toContain('הסט הטוב באימון האחרון: 9');
    expect(list).toContain('<polyline');
    expect(list).toContain('במגמת עלייה');
  });
});
