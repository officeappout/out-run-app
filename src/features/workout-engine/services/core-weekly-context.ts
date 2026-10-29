/**
 * R31 weekly core target (owner 27.10.2026): resolves the two generator context fields
 * (weeklyCoreTarget / weeklyCoreSets) for every strength generation that goes through
 * home-workout.service's shared pipeline (home trio, park / place workouts, planner, builder,
 * Kelly, hybrid).
 *
 * Read-only and query-free: the sets come from the WeeklyVolumeStore session logs already on
 * the device (written at workout completion). Callers may pass both values explicitly.
 */
import { useWeeklyVolumeStore } from '../core/store/useWeeklyVolumeStore';
import {
  countCoreSetsThisWeek,
  defaultWeeklyCoreTarget,
  type CoreSessionLogLike,
} from '../logic/protocols/core-weekly-count';

export interface CoreWeeklyContextInput {
  /** Explicit target (options.weeklyCoreTarget). Absent = by core level. */
  target?: number;
  /** Explicit sets done this week (options.weeklyCoreSets). Absent = from the device's logs. */
  setsThisWeek?: number;
  /** The user's core level (program level 'core', else the general level). */
  coreLevel?: number;
  /** Current user id; logs belonging to another user are ignored. */
  userId?: string;
  /** Domains the caller explicitly requires; 'core' here means the user asked for core. */
  requiredDomains?: readonly string[];
  now?: Date;
  /** Test seam; defaults to the WeeklyVolumeStore. */
  readLogs?: () => { userId?: string; sessionLogs?: readonly CoreSessionLogLike[] };
}

export interface CoreWeeklyContext {
  weeklyCoreTarget?: number;
  weeklyCoreSets?: number;
}

function readStoreLogs(): { userId?: string; sessionLogs?: readonly CoreSessionLogLike[] } {
  const s = useWeeklyVolumeStore.getState();
  return { userId: s.userId, sessionLogs: s.sessionLogs };
}

export function resolveCoreWeeklyContext(input: CoreWeeklyContextInput): CoreWeeklyContext {
  // A request that explicitly asks for core (builder / Kelly) never loses its core slot.
  if (input.requiredDomains?.includes('core')) return {};

  const weeklyCoreTarget = input.target ?? defaultWeeklyCoreTarget(input.coreLevel);
  let weeklyCoreSets = input.setsThisWeek;
  if (weeklyCoreSets == null) {
    try {
      const { userId, sessionLogs } = (input.readLogs ?? readStoreLogs)();
      const otherUser = !!userId && !!input.userId && userId !== input.userId;
      weeklyCoreSets = otherUser ? 0 : countCoreSetsThisWeek(sessionLogs, input.now);
    } catch {
      weeklyCoreSets = 0; // unreadable store: slot stays open (today's behavior)
    }
  }
  return { weeklyCoreTarget, weeklyCoreSets };
}
