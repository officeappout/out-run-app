/**
 * Today's planned run as a card of the map's "מה עושים היום?" carousel (enable_home_v2).
 * PURE. The home ↔ map link for the planned-run state: the same slot home's daily
 * carousel resolves (resolveHomeRunSlot, home-run-slot.ts) becomes, on the map, a card
 * whose CTA opens the planned run's overview straight into "הצע לי מסלול"
 * (plannedRunMapUrl suggest=1 → PlannedPreviewLayer / RunOverviewMapHost →
 * suggestRoutesForWorkout, #491/#495).
 *
 * Only today's pending, not-skipped run gets a card — a "next" run (rest day) is not
 * something to go out for now, and the map has no day picker.
 */

import type { HomeRunSlot } from '@/features/home/utils/home-run-slot';
import { plannedRunMapUrl } from '@/features/workout-engine/players/running/utils/run-overview/run-overview-url';
import { inferRunKind, resolveRunCategory, runTypeLabel } from '@/features/workout-engine/players/running/utils/run-preview/run-kind';
import type { Bolts, HybridSlot, PlannedRunSlot } from './hybrid-slots';

export const PLANNED_RUN_SLOT_ID = 'planned_run';

/** Cardio green (v2 activity colour). */
const RUN_ACCENT = '#84cc16';

export function buildPlannedRunSlot(runSlot: HomeRunSlot | null | undefined): PlannedRunSlot | null {
  if (!runSlot || runSlot.kind !== 'today' || runSlot.skippedToday) return null;
  const { entry } = runSlot;
  const category = resolveRunCategory(entry.category);
  const kind = inferRunKind(category);
  const typeLabel = runTypeLabel(category, kind);
  const bolts: Bolts = kind === 'easy' ? 1 : kind === 'long' ? 2 : 3;
  return {
    kind: 'planned_run',
    id: PLANNED_RUN_SLOT_ID,
    title: 'הריצה של היום',
    subtitle: entry.workoutName || typeLabel,
    bolts,
    recommended: false,
    accent: RUN_ACCENT,
    reason: `${typeLabel} בתוכנית שלך — נמצא לה מסלול מתאים`,
    href: plannedRunMapUrl({ workoutId: entry.workoutId, week: entry.week, day: entry.day, suggest: true }),
  };
}

/** Today's run leads the carousel (it is the plan); no slot → the slots unchanged. */
export function withPlannedRunSlot(slots: HybridSlot[], runSlot: PlannedRunSlot | null): HybridSlot[] {
  if (!runSlot) return slots;
  return [runSlot, ...slots.filter((s) => s.id !== runSlot.id)];
}
