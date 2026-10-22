/**
 * 3e — goal exercises (pure). Flag enable_goal_presence_v1.
 *
 *   presence, not force: a goal exercise that hasn't appeared in the last GOAL_PRESENCE_EVERY_N
 *     sessions of its area gets +GOAL_SCORE_BOOST in the synergy pass. Never on D1, deload, heat,
 *     calm return or recovery (the caller gates the session; D1 is gated per option).
 *   performance ramp: target = max(today's target, last best [+ one step when the double
 *     progression is off]) — never above the goal, no "30 % of the goal" start, the range only
 *     grows to what the user actually did. A true skill's 3d ceiling still wins afterwards.
 */
import { MG_TO_DOMAIN } from '@/features/workout-engine/shared/constants/domain-mapping.constants';
import { GOAL_PRESENCE_EVERY_N, GOAL_STEP_HOLD_S, GOAL_STEP_REPS } from './adaptive.config';

export interface SessionLogLike {
  domainSets?: Record<string, number>;
  exerciseIds?: string[];
}

/** domain → exercise ids of the last `n` sessions that trained that domain (newest first). */
export function recentIdsByDomain(logs: SessionLogLike[], n = GOAL_PRESENCE_EVERY_N): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const seen: Record<string, number> = {};
  for (let i = logs.length - 1; i >= 0; i--) {
    const log = logs[i];
    for (const [domain, sets] of Object.entries(log.domainSets ?? {})) {
      if (!(sets > 0) || (seen[domain] ?? 0) >= n) continue;
      seen[domain] = (seen[domain] ?? 0) + 1;
      const ids = out[domain] ?? (out[domain] = []);
      for (const id of log.exerciseIds ?? []) if (!ids.includes(id)) ids.push(id);
    }
  }
  return out;
}

export interface GoalExerciseLike {
  id: string;
  movementGroup?: string | null;
}

/**
 * Goal ids to boost: absent from the recent sessions of their own area. Without a per-area
 * history the plain recent list (last N sessions, any area) is used; with neither, every goal
 * counts as absent.
 */
export function goalPresenceBoostIds(opts: {
  goalIds: Iterable<string>;
  exercisesById: Map<string, GoalExerciseLike>;
  recentByDomain?: Record<string, string[]>;
  recentIds?: Iterable<string>;
}): Set<string> {
  const recentAny = new Set(Array.from(opts.recentIds ?? []));
  const out = new Set<string>();
  for (const id of Array.from(opts.goalIds)) {
    const mg = opts.exercisesById.get(id)?.movementGroup ?? '';
    const domain = MG_TO_DOMAIN[mg];
    const areaList = domain && opts.recentByDomain ? opts.recentByDomain[domain] : undefined;
    const seen = areaList ? areaList.includes(id) : recentAny.has(id);
    if (!seen) out.add(id);
  }
  return out;
}

/** Performance-driven goal target (reps or seconds), never above the goal. */
export function goalRampTarget(opts: {
  current: number;
  lastBest: number | null | undefined;
  goal: number;
  isHold: boolean;
  /** The double progression already stepped `current` — don't add a second step. */
  adaptiveOn: boolean;
}): number {
  const step = opts.isHold ? GOAL_STEP_HOLD_S : GOAL_STEP_REPS;
  const best = typeof opts.lastBest === 'number' && Number.isFinite(opts.lastBest) && opts.lastBest > 0
    ? opts.lastBest + (opts.adaptiveOn ? 0 : step)
    : 0;
  return Math.max(1, Math.min(opts.goal, Math.max(opts.current, best)));
}
