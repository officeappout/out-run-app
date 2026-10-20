import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { buildPlannedRunSlot, withPlannedRunSlot, PLANNED_RUN_SLOT_ID } from '../planned-run-slot';
import type { HomeRunSlot } from '@/features/home/utils/home-run-slot';
import type { HybridSlot } from '../hybrid-slots';

const tempo = { week: 3, day: 2, status: 'pending' as const, workoutId: 'tempo_w3', workoutName: 'טמפו 3×8′', category: 'tempo' };
const today: HomeRunSlot = { kind: 'today', entry: tempo, position: 'first' };

const quick: HybridSlot = {
  kind: 'aerobic_quick', id: 'aerobic_quick', aerobicKind: 'walking',
  title: 'הליכה', subtitle: '', bolts: 1, recommended: false, accent: '#84cc16',
};

describe('buildPlannedRunSlot', () => {
  it("today's run → a planned_run card that opens the overview with 'הצע לי מסלול' (suggest=1)", () => {
    const slot = buildPlannedRunSlot(today)!;
    expect(slot.kind).toBe('planned_run');
    expect(slot.id).toBe(PLANNED_RUN_SLOT_ID);
    expect(slot.subtitle).toBe('טמפו 3×8′');
    expect(slot.href).toBe('/map?workoutId=tempo_w3&week=3&day=2&context=running&suggest=1');
    expect(slot.href).not.toContain('autoStart');
  });

  it('no slot, a "next" run (rest day) or a skipped run → no card', () => {
    expect(buildPlannedRunSlot(null)).toBeNull();
    expect(buildPlannedRunSlot({ kind: 'next', entry: tempo, position: 'first', daysAway: 1 })).toBeNull();
    expect(buildPlannedRunSlot({ ...today, skippedToday: true })).toBeNull();
  });

  it('falls back to the run type when the entry has no name', () => {
    const slot = buildPlannedRunSlot({ ...today, entry: { ...tempo, workoutName: undefined } })!;
    expect(slot.subtitle.length).toBeGreaterThan(0);
  });
});

describe('withPlannedRunSlot', () => {
  it('leads the carousel; null → the slots unchanged (same array)', () => {
    const run = buildPlannedRunSlot(today)!;
    expect(withPlannedRunSlot([quick], run).map((s) => s.id)).toEqual([PLANNED_RUN_SLOT_ID, 'aerobic_quick']);
    const base = [quick];
    expect(withPlannedRunSlot(base, null)).toBe(base);
  });
});

describe('DiscoverLayer wiring (source-level)', () => {
  const src = readFileSync(
    fileURLToPath(new URL('../../../../app/map/layers/DiscoverLayer.tsx', import.meta.url)),
    'utf8',
  );
  it('the run card is enable_home_v2 only', () => {
    expect(src).toContain('useHomeRunSlot(profile, mapFeatureFlags.enableHomeV2, hasStrengthProgram, mapFeatureFlags.enableHomeV2)');
    // Flag off → the slots unchanged; flag on → the plan cards (run / walk) in home's order.
    expect(src).toContain('if (!mapFeatureFlags.enableHomeV2) return slots;');
    expect(src).toContain('const run = buildPlannedRunSlot(homeRun.slot);');
    expect(src).toContain('return withTodayPlanSlots(slots, {');
    expect(src).toContain('slots={carouselSlots}');
  });
  it('selecting it navigates to the planned run link (no compose)', () => {
    expect(src).toMatch(/if \(slot\.kind === 'planned_run'\) \{\s*resetHybridFlow\(\);\s*setMapMode\('idle'\);\s*router\.push\(slot\.href\);\s*return;/);
  });
});
