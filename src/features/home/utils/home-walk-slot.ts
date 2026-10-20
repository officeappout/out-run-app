/**
 * The walker's home (enable_home_v2, owner 20.10.2026) — pure.
 *
 * Owner's home model: week strip → today's pinned workout card → the workout carousel
 * → the tabs. For a walker (a planned walk in the coming week, useWalkWeek):
 *  - walk day, walk still pending → today's walk is THE pinned card: first slide of the
 *    daily carousel (same sentinel slot as today's run card), or on its own when the
 *    carousel isn't showing;
 *  - otherwise (no walk today / it's done) and steps are missing → the short
 *    "complete your steps" walk as a carousel card (last);
 *  - the tabs: "מדדי בריאות" (steps + activity) first and the default.
 * Strength / run users (not walkers) → null / unchanged everywhere.
 */
import type { UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';
import { stepGapWalk } from '@/features/schedule/walking/walkPlan';
import type { HomeAnchorState } from './home-run-slot';

export type HomeWalkSlot =
  | { kind: 'today'; entry: UserScheduleEntry }
  | { kind: 'gap'; missingSteps: number; minutes: number };

export interface ResolveHomeWalkSlotInput {
  v2: boolean;
  isWalker: boolean;
  /** The selected date is today (the slot is about today only). */
  isViewingToday: boolean;
  today: UserScheduleEntry | null;
  /** A walk was already logged today. */
  walkedToday: boolean;
  steps: number | null | undefined;
  stepGoal: number | null | undefined;
}

export function resolveHomeWalkSlot(input: ResolveHomeWalkSlotInput): HomeWalkSlot | null {
  const { v2, isWalker, isViewingToday, today, walkedToday, steps, stepGoal } = input;
  if (!v2 || !isWalker || !isViewingToday) return null;
  if (today && !today.completed && !walkedToday) return { kind: 'today', entry: today };
  const gap = stepGapWalk(steps, stepGoal);
  return gap ? { kind: 'gap', ...gap } : null;
}

/**
 * Where the walk card renders: a slide of the carousel when it shows; on its own
 * (above the StatsOverview fallback) when it doesn't — today's walk always, the short
 * walk only when nothing is loading. Past / future days / loading → nowhere.
 */
export function resolveWalkSlotSurface(
  slot: HomeWalkSlot | null,
  anchor: HomeAnchorState,
): 'carousel' | 'standalone' | null {
  if (!slot) return null;
  if (anchor === 'carousel') return 'carousel';
  if (anchor === 'loading' || anchor === 'other') return null;
  return 'standalone';
}

/** Today's walk leads the carousel; the short walk goes last. */
export function placeWalkCard<T>(items: readonly T[], walkItem: T, slot: HomeWalkSlot): T[] {
  return slot.kind === 'today' ? [walkItem, ...items] : [...items, walkItem];
}

export type HomeTab = 'strength' | 'health';

/**
 * The tabs and the active one. Without a program only "health" (as before). A walker
 * gets "health" first and as the default until they pick a tab themselves.
 */
export function resolveHomeTabs(
  hasProgram: boolean,
  walkerFirst: boolean,
  picked: HomeTab | null,
): { tabs: HomeTab[]; active: HomeTab } {
  if (!hasProgram) return { tabs: ['health'], active: 'health' };
  const tabs: HomeTab[] = walkerFirst ? ['health', 'strength'] : ['strength', 'health'];
  return { tabs, active: picked ?? tabs[0] };
}
