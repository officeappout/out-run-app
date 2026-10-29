import { describe, expect, it } from 'vitest';
import {
  coreSetsOfCompletedPlan,
  coreSetsOfSessionLog,
  countCoreSetsThisWeek,
  defaultWeeklyCoreTarget,
  startOfWeekSunday,
} from '../core-weekly-count';

const core = (id: string, sets = 3, extra: Record<string, unknown> = {}) => ({ id, sets, muscleGroups: ['abs'], ...extra });
const push = (id: string, sets = 3) => ({ id, sets, muscleGroups: ['chest'] });

describe('coreSetsOfCompletedPlan (R31 counting rules)', () => {
  it('single core exercises count their done sets (log wins over planned)', () => {
    const segs = [{ id: 'seg-main', exercises: [push('p1'), core('c1', 3), core('c2', 2)] }];
    expect(coreSetsOfCompletedPlan(segs, new Map([['c1', 2]]))).toBe(4); // 2 logged + 2 planned
  });

  it('a core tabata block counts 4, whatever its members / rounds', () => {
    const segs = [
      { id: 'seg-main', exercises: [push('p1')] },
      { id: 'seg-tabata', protocol: 'tabata', exercises: [core('t1', 4), core('t2', 4), core('t3', 4), core('t4', 4)] },
    ];
    expect(coreSetsOfCompletedPlan(segs, new Map([['t1', 8], ['t2', 8]]))).toBe(4);
  });

  it('a tabata block with no core member, or nothing done, counts 0', () => {
    const noCore = [{ id: 'seg-tabata', protocol: 'tabata', exercises: [push('x')] }];
    expect(coreSetsOfCompletedPlan(noCore, new Map())).toBe(0);
    const notDone = [{ id: 'seg-tabata', protocol: 'tabata', exercises: [core('t1', 0)] }];
    expect(coreSetsOfCompletedPlan(notDone, new Map([['t1', 0]]))).toBe(0);
  });

  it('a core follow-along (4-minute video) counts 4', () => {
    const segs = [{ id: 'seg-main', exercises: [core('f1', 1, { isFollowAlong: true })] }];
    expect(coreSetsOfCompletedPlan(segs, new Map())).toBe(4);
  });

  it('warmup / cooldown core moves do not count; empty input is 0', () => {
    const segs = [{ id: 'seg-warmup', exercises: [core('w1', 2, { exerciseRole: 'warmup' })] }];
    expect(coreSetsOfCompletedPlan(segs, new Map())).toBe(0);
    expect(coreSetsOfCompletedPlan(undefined, new Map())).toBe(0);
  });
});

describe('countCoreSetsThisWeek (Sunday week start)', () => {
  // Wednesday 28.10.2026 12:00 local; week started Sunday 25.10.2026 00:00.
  const now = new Date(2026, 9, 28, 12, 0, 0);

  it('week starts on Sunday 00:00 local', () => {
    expect(startOfWeekSunday(now)).toEqual(new Date(2026, 9, 25, 0, 0, 0, 0));
    const sunday = new Date(2026, 9, 25, 8, 0, 0);
    expect(startOfWeekSunday(sunday)).toEqual(new Date(2026, 9, 25, 0, 0, 0, 0));
  });

  it('sums this week only: coreSets, the 8-minute core card (8), legacy domainSets.core', () => {
    const logs = [
      { completedAt: new Date(2026, 9, 24, 20, 0), coreSets: 4 }, // Saturday: last week
      { completedAt: new Date(2026, 9, 25, 7, 0), coreSets: 4 }, // tabata on Sunday
      { completedAt: new Date(2026, 9, 26, 7, 0).toISOString(), sessionKind: 'core_card' as const, durationMinutes: 8 },
      { completedAt: new Date(2026, 9, 27, 7, 0), domainSets: { core: 2, push: 6 } }, // pre-coreSets log
    ];
    expect(countCoreSetsThisWeek(logs, now)).toBe(14);
  });

  it('recovery logs count only an explicit coreSets; bad dates are skipped', () => {
    expect(coreSetsOfSessionLog({ completedAt: now, isRecovery: true, domainSets: { core: 3 } })).toBe(0);
    expect(coreSetsOfSessionLog({ completedAt: now, isRecovery: true, coreSets: 4 })).toBe(4);
    expect(countCoreSetsThisWeek([{ completedAt: 'nope', coreSets: 4 }], now)).toBe(0);
    expect(countCoreSetsThisWeek(undefined, now)).toBe(0);
  });

  it('a core card defaults to 8 minutes = 8 sets', () => {
    expect(coreSetsOfSessionLog({ completedAt: now, sessionKind: 'core_card' })).toBe(8);
  });
});

describe('defaultWeeklyCoreTarget (GlobalLevelConfig.weeklyTargetCore tiers)', () => {
  it('6 / 8 / 10 by level (owner 27.10.2026)', () => {
    expect(defaultWeeklyCoreTarget(1)).toBe(6);
    expect(defaultWeeklyCoreTarget(5)).toBe(6);
    expect(defaultWeeklyCoreTarget(6)).toBe(8);
    expect(defaultWeeklyCoreTarget(12)).toBe(8);
    expect(defaultWeeklyCoreTarget(13)).toBe(10);
    expect(defaultWeeklyCoreTarget(undefined)).toBe(6);
  });
});
