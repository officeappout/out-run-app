import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {}, app: {} }));

import { dropCoreSlotWhenWeeklyTargetMet } from '../WorkoutGenerator';
import { resolveCoreWeeklyContext } from '../../services/core-weekly-context';

const ex = (id: string, core: boolean, role: 'main' | 'warmup' = 'main') =>
  ({
    exercise: { id, targetPrograms: core ? [{ programId: 'core', level: 3 }] : [{ programId: 'push', level: 3 }] },
    exerciseRole: role,
    sets: 3,
  }) as any;

const workout = () => [ex('push1', false), ex('pull1', false), ex('core1', true)];
const ids = (list: any[]) => list.map((e) => e.exercise.id);

describe('R31 core slot in the generator (dropCoreSlotWhenWeeklyTargetMet)', () => {
  it('drops the core slot when the week\'s core sets reached the target', () => {
    const list = workout();
    expect(dropCoreSlotWhenWeeklyTargetMet(list, { weeklyCoreTarget: 4, weeklyCoreSets: 4 })).toBe(true);
    expect(ids(list)).toEqual(['push1', 'pull1']);
  });

  it('keeps the core slot while the target is not met', () => {
    const list = workout();
    expect(dropCoreSlotWhenWeeklyTargetMet(list, { weeklyCoreTarget: 8, weeklyCoreSets: 4 })).toBe(false);
    expect(ids(list)).toEqual(['push1', 'pull1', 'core1']);
  });

  it('keeps it with no target, a forced core form, or core as the only exercise', () => {
    const a = workout();
    dropCoreSlotWhenWeeklyTargetMet(a, { weeklyCoreSets: 99 });
    expect(ids(a)).toContain('core1');
    const b = workout();
    dropCoreSlotWhenWeeklyTargetMet(b, { weeklyCoreTarget: 4, weeklyCoreSets: 8, forcedCoreForm: 'tabata' });
    expect(ids(b)).toContain('core1');
    const c = [ex('core1', true)];
    dropCoreSlotWhenWeeklyTargetMet(c, { weeklyCoreTarget: 4, weeklyCoreSets: 8 });
    expect(ids(c)).toEqual(['core1']);
  });
});

describe('resolveCoreWeeklyContext (pipeline wiring)', () => {
  const now = new Date(2026, 9, 28, 12, 0, 0); // Wednesday
  const logs = (userId: string, coreSets: number[]) => () => ({
    userId,
    sessionLogs: coreSets.map((n, i) => ({ completedAt: new Date(2026, 9, 25 + i, 8, 0), coreSets: n })),
  });

  it('target by core level + sets from the device logs: two tabatas (8) meet a level-3 week (6)', () => {
    const ctx = resolveCoreWeeklyContext({ coreLevel: 3, userId: 'u1', now, readLogs: logs('u1', [4, 4]) });
    expect(ctx).toEqual({ weeklyCoreTarget: 6, weeklyCoreSets: 8 });
    const list = workout();
    expect(dropCoreSlotWhenWeeklyTargetMet(list, ctx)).toBe(true);
  });

  it('level 13: one tabata (4) leaves the slot open, tabata + 8-min card (12) closes it', () => {
    const open = resolveCoreWeeklyContext({ coreLevel: 13, userId: 'u1', now, readLogs: logs('u1', [4]) });
    expect(dropCoreSlotWhenWeeklyTargetMet(workout(), open)).toBe(false);
    const closed = resolveCoreWeeklyContext({
      coreLevel: 13,
      userId: 'u1',
      now,
      readLogs: () => ({
        userId: 'u1',
        sessionLogs: [
          { completedAt: new Date(2026, 9, 26, 8), coreSets: 4 },
          { completedAt: new Date(2026, 9, 27, 8), sessionKind: 'core_card' as const, durationMinutes: 8 },
        ],
      }),
    });
    expect(closed.weeklyCoreSets).toBe(12);
    expect(dropCoreSlotWhenWeeklyTargetMet(workout(), closed)).toBe(true);
  });

  it('explicit options win; another user\'s logs count 0; an explicit core request opts out', () => {
    expect(resolveCoreWeeklyContext({ target: 10, setsThisWeek: 3 })).toEqual({ weeklyCoreTarget: 10, weeklyCoreSets: 3 });
    expect(resolveCoreWeeklyContext({ coreLevel: 3, userId: 'u2', now, readLogs: logs('u1', [8]) }).weeklyCoreSets).toBe(0);
    expect(resolveCoreWeeklyContext({ coreLevel: 3, requiredDomains: ['core'], readLogs: logs('u1', [8]) })).toEqual({});
  });

  it('an unreadable store keeps the slot open', () => {
    const ctx = resolveCoreWeeklyContext({ coreLevel: 3, readLogs: () => { throw new Error('x'); } });
    expect(ctx.weeklyCoreSets).toBe(0);
    expect(dropCoreSlotWhenWeeklyTargetMet(workout(), ctx)).toBe(false);
  });
});
