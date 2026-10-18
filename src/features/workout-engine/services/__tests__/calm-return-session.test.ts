import { describe, it, expect } from 'vitest';
import { applyCalmReturnToPolicy, capDifficultyForCalmReturn } from '../calm-return-session';
import { resolveSessionPolicy } from '../periodization.service';
import { calculateVolumeAdjustment } from '../../logic/workout-budgeting.utils';
import { CALM_LOADS, NO_CHANGE_LOAD, resolveCalmReturn } from '@/lib/calm-return/policy';
import { calmCopy } from '@/lib/calm-return/surface';

const LABEL = calmCopy(null).lightVersionBadge;

/** The generator context a home pipeline builds, reduced to what calculateVolumeAdjustment reads. */
function ctx(overrides: Record<string, unknown> = {}): any {
  return { userLevel: 10, daysInactive: 0, periodizationWeek: 1, ...overrides };
}

/** What the pipeline does with the flag ON: cycle policy + calm load → generator context. */
function calmSets(daysAway: number, episode?: unknown, cycleWeek = 1) {
  const calm = resolveCalmReturn({ daysAway, episode, now: new Date(2026, 9, 18) });
  const policy = applyCalmReturnToPolicy(resolveSessionPolicy(cycleWeek, 0), calm.load, LABEL);
  return calculateVolumeAdjustment(
    ctx({
      daysInactive: 0,
      calmReturnLabel: calm.isLightened ? LABEL : undefined,
      volumeReductionOverride: policy.volumeReductionOverride,
      periodizationWeek: policy.periodizationWeek,
    }),
    2,
  );
}

describe('strength load reduction per tier (flag ON)', () => {
  it('0–3 days: unchanged', () => {
    const r = calmSets(2);
    expect(r.reductionPercent).toBe(0);
    expect(r.adjustedSets).toBe(r.originalSets);
  });

  it('4–6 days: −20%, numberless badge', () => {
    const r = calmSets(5);
    expect(r.reductionPercent).toBe(20);
    expect(r.badge).toBe('גרסה קלה לחזרה');
  });

  it('7–27 days: −30%', () => {
    expect(calmSets(10).reductionPercent).toBe(30);
  });

  it('28+ days: −40% week 1, −20% week 2', () => {
    expect(calmSets(35).reductionPercent).toBe(40);
    const ep = { startDate: '2026-10-09', tier: 're_entry', v: 1 }; // 9 days ago → week 2
    expect(calmSets(0, ep).reductionPercent).toBe(20);
  });

  it('never a day count in the badge', () => {
    for (const d of [4, 9, 40]) expect(calmSets(d).badge).not.toMatch(/\d/);
  });

  it('a deload week stays a deload (−50% beats any return tier)', () => {
    const p = applyCalmReturnToPolicy(resolveSessionPolicy(5, 0), CALM_LOADS.fresh_start_w1, LABEL);
    expect(p.volumeReductionOverride).toBe(0.5);
    expect(p.reason).toBe('deload');
  });

  it('no cycle restart and no peak overload while coming back', () => {
    const p = applyCalmReturnToPolicy(resolveSessionPolicy(4, 0), CALM_LOADS.re_entry_w1, LABEL);
    expect(p.shouldRestartCycle).toBe(false);
    expect(p.deltaOverride).toBeUndefined();
    expect(p.volumeMultiplier).toBe(1);
    expect(p.protocolMultiplier).toBeLessThanOrEqual(1);
    expect(p.detrainingLock).toBe(true);
    expect(p.coachCue).toBe(LABEL);
  });

  it('no lightening → the plain cycle policy (still no restart)', () => {
    const base = resolveSessionPolicy(2, 0);
    expect(applyCalmReturnToPolicy(base, NO_CHANGE_LOAD, LABEL)).toEqual({ ...base, shouldRestartCycle: false });
  });

  it('difficulty 3 is never auto-offered while lightened; an explicit pick is honoured', () => {
    expect(capDifficultyForCalmReturn(3, CALM_LOADS.welcome_back, false)).toBe(2);
    expect(capDifficultyForCalmReturn(1, CALM_LOADS.welcome_back, false)).toBe(1);
    expect(capDifficultyForCalmReturn(3, CALM_LOADS.welcome_back, true)).toBe(3);
    expect(capDifficultyForCalmReturn(3, null, false)).toBe(3);
  });
});

describe('flag OFF = unchanged (snapshot of today\'s behaviour)', () => {
  it('calculateVolumeAdjustment without calmReturnLabel keeps the legacy −40% inactivity badge', () => {
    expect(calculateVolumeAdjustment(ctx({ daysInactive: 5 }), 2)).toMatchInlineSnapshot(`
      {
        "adjustedSets": 2,
        "badge": "🦥 חזרה אחרי 5 ימים",
        "originalSets": 3,
        "reason": "inactivity",
        "reductionPercent": 40,
      }
    `);
  });

  it('the gap-override branch keeps its legacy badge', () => {
    expect(calculateVolumeAdjustment(ctx({ volumeReductionOverride: 0.4 }), 2).badge).toBe('🦥 מצב מופחת');
  });

  it('resolveSessionPolicy gap tiers are untouched (detraining / long gap / rebuild)', () => {
    const tiers = [5, 10, 25].map((gap) => {
      const p = resolveSessionPolicy(2, gap);
      return { gap, reason: p.reason, override: p.volumeReductionOverride, restart: p.shouldRestartCycle, week: p.periodizationWeek };
    });
    expect(tiers).toMatchInlineSnapshot(`
      [
        {
          "gap": 5,
          "override": 0.4,
          "reason": "detraining",
          "restart": false,
          "week": 2,
        },
        {
          "gap": 10,
          "override": 0.5,
          "reason": "long_gap_deload",
          "restart": false,
          "week": 5,
        },
        {
          "gap": 25,
          "override": 0.5,
          "reason": "rebuild",
          "restart": true,
          "week": 5,
        },
      ]
    `);
  });
});
