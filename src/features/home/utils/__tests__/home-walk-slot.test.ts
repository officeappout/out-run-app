import { describe, expect, it } from 'vitest';
import type { UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';
import { placeWalkCard, resolveHomeTabs, resolveHomeWalkSlot, resolveWalkSlotSurface } from '../home-walk-slot';

const today = {
  entryId: 'walkplan_2026-10-20', userId: 'u', date: '2026-10-20', programIds: [], type: 'training', source: 'auto',
  completed: false, scheduledCategories: ['walking'], plannedRun: { goal: { type: 'time', value: 30 } },
} as UserScheduleEntry;

const base = { v2: true, isWalker: true, isViewingToday: true, today, walkedToday: false, steps: 2000, stepGoal: 8000 };

describe('resolveHomeWalkSlot', () => {
  it('walk day, pending → today', () => {
    expect(resolveHomeWalkSlot(base)).toEqual({ kind: 'today', entry: today });
  });
  it('walk done (entry completed or a walk logged) → the short walk when steps are missing', () => {
    const a = resolveHomeWalkSlot({ ...base, today: { ...today, completed: true } });
    const b = resolveHomeWalkSlot({ ...base, walkedToday: true });
    expect(a?.kind).toBe('gap');
    expect(b?.kind).toBe('gap');
  });
  it('no walk today, steps missing → gap with minutes', () => {
    const s = resolveHomeWalkSlot({ ...base, today: null });
    expect(s).toMatchObject({ kind: 'gap', missingSteps: 6000 });
    expect(s && s.kind === 'gap' && s.minutes).toBeGreaterThan(0);
  });
  it('goal met → nothing', () => {
    expect(resolveHomeWalkSlot({ ...base, today: null, steps: 9000 })).toBeNull();
  });
  it('flag off / not a walker / another day → nothing', () => {
    expect(resolveHomeWalkSlot({ ...base, v2: false })).toBeNull();
    expect(resolveHomeWalkSlot({ ...base, isWalker: false })).toBeNull();
    expect(resolveHomeWalkSlot({ ...base, isViewingToday: false })).toBeNull();
  });
});

describe('resolveWalkSlotSurface', () => {
  const slot = { kind: 'today', entry: today } as const;
  it('carousel → slide; done / empty → standalone; loading / other day → none', () => {
    expect(resolveWalkSlotSurface(slot, 'carousel')).toBe('carousel');
    expect(resolveWalkSlotSurface(slot, 'done')).toBe('standalone');
    expect(resolveWalkSlotSurface(slot, 'empty')).toBe('standalone');
    expect(resolveWalkSlotSurface(slot, 'loading')).toBeNull();
    expect(resolveWalkSlotSurface(slot, 'other')).toBeNull();
    expect(resolveWalkSlotSurface(null, 'carousel')).toBeNull();
  });
});

describe('placeWalkCard', () => {
  it("today's walk leads, the short walk goes last", () => {
    expect(placeWalkCard(['a', 'b'], 'W', { kind: 'today', entry: today })).toEqual(['W', 'a', 'b']);
    expect(placeWalkCard(['a', 'b'], 'W', { kind: 'gap', missingSteps: 1, minutes: 10 })).toEqual(['a', 'b', 'W']);
  });
});

describe('resolveHomeTabs', () => {
  it('strength / run users: unchanged (strength first, default strength)', () => {
    expect(resolveHomeTabs(true, false, null)).toEqual({ tabs: ['strength', 'health'], active: 'strength' });
    expect(resolveHomeTabs(true, false, 'health').active).toBe('health');
  });
  it('no program: health only (as before)', () => {
    expect(resolveHomeTabs(false, false, 'strength')).toEqual({ tabs: ['health'], active: 'health' });
    expect(resolveHomeTabs(false, true, null)).toEqual({ tabs: ['health'], active: 'health' });
  });
  it('walker: health first and default, the user can still pick strength', () => {
    expect(resolveHomeTabs(true, true, null)).toEqual({ tabs: ['health', 'strength'], active: 'health' });
    expect(resolveHomeTabs(true, true, 'strength').active).toBe('strength');
  });
});
