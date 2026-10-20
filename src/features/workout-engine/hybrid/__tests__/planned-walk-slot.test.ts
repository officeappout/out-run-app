import { describe, expect, it } from 'vitest';
import type { UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';
import { buildPlannedWalkSlot, withTodayPlanSlots } from '../planned-walk-slot';
import type { HybridSlot, PlannedRunSlot } from '../hybrid-slots';

const walkEntry = {
  entryId: 'walkplan_2026-10-20', userId: 'u', date: '2026-10-20', programIds: [], type: 'training', source: 'auto',
  completed: false, scheduledCategories: ['walking'], plannedRun: { goal: { type: 'time', value: 30 } },
} as UserScheduleEntry;

const smart = (id: string): HybridSlot => ({ kind: 'aerobic_quick', id, title: id, subtitle: '', bolts: 1, recommended: false, accent: '#000', aerobicKind: 'walking' });
const run: PlannedRunSlot = { kind: 'planned_run', id: 'planned_run', title: 'הריצה של היום', subtitle: '', bolts: 1, recommended: false, accent: '#84cc16', href: '/x' };

describe('buildPlannedWalkSlot', () => {
  it("today's walk → a card with its goal and steps", () => {
    const slot = buildPlannedWalkSlot({ kind: 'today', entry: walkEntry });
    expect(slot?.kind).toBe('planned_walk');
    expect(slot?.subtitle).toContain('30 דק׳');
    expect(slot?.entry).toEqual({ date: '2026-10-20', entryId: 'walkplan_2026-10-20', plannedRun: walkEntry.plannedRun });
  });
  it('the short walk / nothing → no card', () => {
    expect(buildPlannedWalkSlot({ kind: 'gap', missingSteps: 3000, minutes: 25 })).toBeNull();
    expect(buildPlannedWalkSlot(null)).toBeNull();
  });
});

describe('withTodayPlanSlots — home order on the map', () => {
  const slots = [smart('full_park'), smart('walk_strength')];
  const walk = buildPlannedWalkSlot({ kind: 'today', entry: walkEntry });
  it('no plan → unchanged', () => {
    expect(withTodayPlanSlots(slots, { walk: null, run: null, runIsQuality: false, strengthToday: false })).toBe(slots);
  });
  it('walk leads', () => {
    expect(withTodayPlanSlots(slots, { walk, run: null, runIsQuality: false, strengthToday: true }).map((s) => s.id)).toEqual(['planned_walk', 'full_park', 'walk_strength']);
  });
  it('quality run leads a strength day; an easy run goes after the first card', () => {
    expect(withTodayPlanSlots(slots, { walk: null, run, runIsQuality: true, strengthToday: true }).map((s) => s.id)).toEqual(['planned_run', 'full_park', 'walk_strength']);
    expect(withTodayPlanSlots(slots, { walk: null, run, runIsQuality: false, strengthToday: true }).map((s) => s.id)).toEqual(['full_park', 'planned_run', 'walk_strength']);
  });
  it('run without strength today leads', () => {
    expect(withTodayPlanSlots(slots, { walk: null, run, runIsQuality: false, strengthToday: false })[0].id).toBe('planned_run');
  });
});
