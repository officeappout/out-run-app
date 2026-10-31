/**
 * Today's planned walk as a card of the map's "מה עושים היום?" carousel (enable_home_v2).
 * PURE. The home ↔ map link for walkers: the same slot home's daily carousel pins
 * (resolveHomeWalkSlot, home-walk-slot.ts) becomes, on the map, a card with the walk's
 * goal; its CTA opens the free walk on the route step (a loop that fits the goal).
 *
 * Only today's pending walk gets a card — the short "complete your steps" walk is already
 * what the map's walk + strength card sizes itself by (remaining steps).
 *
 * withTodayPlanSlots orders the plan's lead cards exactly like home (day-plan.ts
 * leadPlanKinds): the walk, then a quality run / a running-only user's run; an easy run on a
 * strength day goes after the first card (home: after the first strength card).
 */
import { withUnit } from '@/lib/i18n/units';
import { makeLiveT } from '@/lib/i18n/live-t';
import { map } from '@/messages/ns/map';
import { common } from '@/messages/ns/common';
import type { HomeWalkSlot } from '@/features/home/utils/home-walk-slot';
import { leadPlanKinds } from '@/features/home/utils/day-plan';
import { plannedWalkSteps, plannedWalkTargetHe } from '@/features/schedule/walking/walkWeekView';
import type { HybridSlot, PlannedRunSlot, PlannedWalkSlot } from './hybrid-slots';

export const PLANNED_WALK_SLOT_ID = 'planned_walk';

/** Steps / walk amber (v2 activity colour). */
const WALK_ACCENT = '#f59e0b';

const fmt = (n: number) => n.toLocaleString('he-IL');

/** AH1: card copy and units in the app locale at call time (Hebrew byte-identical). */
const tMap = makeLiveT(map);
const tCommon = makeLiveT(common);

export function buildPlannedWalkSlot(walkSlot: HomeWalkSlot | null | undefined): PlannedWalkSlot | null {
  if (!walkSlot || walkSlot.kind !== 'today') return null;
  const { entry } = walkSlot;
  const target = plannedWalkTargetHe(entry.plannedRun, tCommon);
  const steps = plannedWalkSteps(entry.plannedRun);
  return {
    kind: 'planned_walk',
    id: PLANNED_WALK_SLOT_ID,
    title: tMap('hybrid.slot.plannedWalk.title'),
    subtitle: [target, steps ? `~${withUnit('steps', fmt(steps), tCommon)}` : null].filter(Boolean).join(' · ') || tMap('hybrid.slot.plannedWalk.fallback'),
    bolts: 1,
    recommended: false,
    accent: WALK_ACCENT,
    reason: tMap('hybrid.slot.plannedWalk.reason'),
    entry: { date: entry.date, entryId: entry.entryId, plannedRun: entry.plannedRun },
  };
}

export interface TodayPlanSlots {
  walk: PlannedWalkSlot | null;
  run: PlannedRunSlot | null;
  /** The planned run is a quality run (intervals / tempo). */
  runIsQuality: boolean;
  /** Today is a strength day (the map's full-park card leads it). */
  strengthToday: boolean;
}

/** The plan's cards first, in home's order; no plan → the slots unchanged. */
export function withTodayPlanSlots(slots: HybridSlot[], plan: TodayPlanSlots): HybridSlot[] {
  const { walk, run, runIsQuality, strengthToday } = plan;
  if (!walk && !run) return slots;
  const rest = slots.filter((s) => s.id !== walk?.id && s.id !== run?.id);
  const lead = leadPlanKinds({ walk: !!walk, run: run ? { quality: runIsQuality } : null, strength: strengthToday });
  const head: HybridSlot[] = lead.map((k) => (k === 'walk' ? walk : run)).filter((s): s is PlannedWalkSlot | PlannedRunSlot => !!s);
  const runLeads = lead.includes('run');
  if (run && !runLeads) {
    // Easy / long run on a strength day: after the first card.
    const firstRest = rest.length ? [rest[0]] : [];
    return [...head, ...firstRest, run, ...rest.slice(1)];
  }
  return [...head, ...rest];
}
