import { describe, it, expect } from 'vitest';
import {
  buildPlanContentRows,
  buildWeeklyVolumePattern,
  easyPaceRangeLabel,
  isConservativePlan,
  recoveryCadenceWeeks,
  weekLabelsToShow,
} from '../running-plan-shape';
import { buildVolumeMultipliers, distributePhases } from '@/features/workout-engine/core/services/plan-generator.service';

describe('buildWeeklyVolumePattern', () => {
  it('10 weeks, conservative: the generator multipliers, recovery dips, gold last week', () => {
    const bars = buildWeeklyVolumePattern(10, true);
    expect(bars.map((b) => b.multiplier)).toEqual([1.0, 1.1, 1.2, 1.0, 1.0, 1.1, 0.8, 1.1, 1.1, 0.6]);
    expect(bars.map((b) => b.kind)).toEqual([
      'build', 'build', 'build', 'recovery', 'build', 'build', 'recovery', 'build', 'build', 'goal',
    ]);
    expect(bars[2].relative).toBe(1);
    expect(bars[9].relative).toBe(0.5);
  });

  it('matches distributePhases + buildVolumeMultipliers for every plan length 4–52', () => {
    for (let w = 4; w <= 52; w++) {
      for (const conservative of [true, false]) {
        const bars = buildWeeklyVolumePattern(w, conservative);
        expect(bars).toHaveLength(w);
        const layout = distributePhases(w);
        const expected: number[] = [];
        for (const ph of ['base', 'build', 'peak', 'taper'] as const) {
          const n = layout[ph].weeks;
          if (n <= 0) continue;
          const m = buildVolumeMultipliers(ph, n, conservative);
          for (let i = 0; i < n; i++) expected.push(Array.isArray(m) ? m[i] : m);
        }
        expect(bars.map((b) => b.multiplier)).toEqual(expected);
        expect(bars[w - 1].kind).toBe('goal');
        expect(Math.max(...bars.map((b) => b.relative))).toBe(1);
        bars.forEach((b) => expect(b.relative).toBeGreaterThan(0));
      }
    }
  });

  it('is deterministic', () => {
    expect(buildWeeklyVolumePattern(12, true)).toEqual(buildWeeklyVolumePattern(12, true));
  });

  it('non-conservative 12 weeks has fewer recovery weeks than conservative', () => {
    const rec = (c: boolean) => buildWeeklyVolumePattern(12, c).filter((b) => b.kind === 'recovery').length;
    expect(rec(false)).toBeLessThanOrEqual(rec(true));
  });

  it('degrades safely below the 4-week floor', () => {
    const bars = buildWeeklyVolumePattern(2, true);
    expect(bars.map((b) => b.kind)).toEqual(['build', 'goal']);
  });
});

describe('isConservativePlan / recoveryCadenceWeeks', () => {
  it('onboarding default (no history) is conservative', () => {
    expect(isConservativePlan({})).toBe(true);
    expect(isConservativePlan({ runningHistoryMonths: 24 })).toBe(false);
    expect(isConservativePlan({ runningHistoryMonths: 24, hasInjuries: true })).toBe(true);
    expect(recoveryCadenceWeeks(true)).toBe(3);
    expect(recoveryCadenceWeeks(false)).toBe(4);
  });
});

describe('weekLabelsToShow', () => {
  it('labels every week up to 12, thins out longer plans, always keeps first and last', () => {
    expect(Array.from(weekLabelsToShow(10))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const l = weekLabelsToShow(20);
    expect(l.has(1)).toBe(true);
    expect(l.has(20)).toBe(true);
    expect(l.has(2)).toBe(false);
    expect(l.has(3)).toBe(true);
  });
});

describe('easyPaceRangeLabel', () => {
  it('null without an entered result', () => {
    expect(easyPaceRangeLabel({ goalPath: 'start_running', targetDistance: '5k' })).toBeNull();
  });
  it('10K in 50:00 → slow/fast table easy zone, formatted m:ss–m:ss', () => {
    const label = easyPaceRangeLabel({ goalPath: 'improve_time', targetDistance: '10k', paceInputSeconds: 3000 });
    expect(label).toMatch(/^\d+:\d{2}–\d+:\d{2}$/);
  });
});

describe('buildPlanContentRows', () => {
  const bars = buildWeeklyVolumePattern(10, true);
  it('improve_time → intervals & tempo; recovery weeks listed; pace when known', () => {
    const rows = buildPlanContentRows({ goalPath: 'improve_time', frequency: 3, bars, easyPaceLabel: '6:20–6:50' });
    expect(rows.map((r) => r.kind)).toEqual(['easy', 'quality', 'recovery', 'adapt']);
    expect(rows[0].sub).toContain('6:20–6:50');
    expect(rows[1].title).toBe('אינטרוולים וטמפו');
    expect(rows[1].sub).toContain('עד פעמיים');
    expect(rows[2].sub).toContain('4');
    expect(rows[2].sub).toContain('7');
  });
  it('2 runs/week → quality once a week; beginner gets the gentle pool', () => {
    const rows = buildPlanContentRows({ goalPath: 'start_running', frequency: 2, bars, easyPaceLabel: null });
    expect(rows[1].sub).toContain('פעם בשבוע');
    expect(rows[1].title).toContain('פארטלק');
  });
  it('no recovery row when the pattern has none', () => {
    const rows = buildPlanContentRows({ goalPath: 'maintain_fitness', frequency: 4, bars: buildWeeklyVolumePattern(4, true), easyPaceLabel: null });
    expect(rows.some((r) => r.kind === 'recovery')).toBe(false);
    expect(rows[0].title).toBe('ריצות קלות וארוכות');
  });
});
