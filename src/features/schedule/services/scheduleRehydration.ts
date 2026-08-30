import {
  type DayOfWeek,
  type PrioritizedSkill,
  type ProgramId,
  type ScheduleDay,
  type ScheduleItemId,
} from '@/features/schedule/types/smartSchedule.types';
import { buildDefaultTemplate } from '@/features/schedule/engine/scheduleRules';

/**
 * Extracted from ScheduleStep.tsx (onboarding), 30.08.2026 — a straight
 * relocation of the lazy `useState<ScheduleDay[]>(() => {...})` initializer
 * that rehydrated the schedule grid when a user returns to the step. Pulled
 * out alongside `scheduleSeed.service.ts` for the same reason (single
 * source, no forked copy for a future post-onboarding schedule surface).
 *
 * Cascade (first matching source wins):
 *   1. `scheduleGridSessions` — confirmed via repo-wide grep to be NEVER
 *      written to Firestore; lives only in the ephemeral in-memory
 *      onboarding store. Requires exactly 7 entries (one per weekday).
 *   2. `scheduleDayIndices`   — legacy shape, a plain array of picked
 *      weekday indices; each picked day gets a single default UPPER_BODY
 *      session.
 *   3. `buildDefaultTemplate(seedPrograms, seedSkills, frequency)` — the
 *      existing rule-engine fallback, unchanged.
 *
 * NOTE: `recurringTemplate` (the Firestore-persisted field) is deliberately
 * NOT a source here — it is never read by ScheduleStep.tsx today (it's
 * write-only, built fresh in handleContinue). Adding a recurringTemplate-
 * reading branch would be new logic for a caller that doesn't exist yet
 * (a future post-onboarding schedule-rebuild surface) — deliberately
 * deferred until that caller is actually being built, not omitted by
 * oversight.
 */
export interface RehydrateScheduleGridInput {
  scheduleGridSessions?: Array<{ dayOfWeek: number; skillIds: string[] }>;
  scheduleDayIndices?: number[];
  seedPrograms: ProgramId[];
  seedSkills: PrioritizedSkill[];
  frequency: number;
}

export function rehydrateScheduleGrid(input: RehydrateScheduleGridInput): ScheduleDay[] {
  const { scheduleGridSessions, scheduleDayIndices, seedPrograms, seedSkills, frequency } = input;

  if (scheduleGridSessions && scheduleGridSessions.length === 7) {
    return scheduleGridSessions.map((entry) => ({
      dayOfWeek: entry.dayOfWeek as DayOfWeek,
      sessions: entry.skillIds.map((skillId) => ({
        skillId: skillId as ScheduleItemId,
        volumePercent: 100,
        sessionType: 'FULL' as const,
      })),
      isRestDay: entry.skillIds.length === 0,
      warnings: [],
    }));
  }

  if (scheduleDayIndices && scheduleDayIndices.length > 0) {
    // Legacy shape — translate to grid by placing a hardcoded UPPER_BODY
    // session on each previously-selected day. Matches the original inline
    // code exactly: this branch does NOT read seedPrograms/seedSkills at
    // all (only the buildDefaultTemplate fallback below does).
    return Array.from({ length: 7 }, (_, dow) => {
      const isPicked = scheduleDayIndices.includes(dow);
      return {
        dayOfWeek: dow as DayOfWeek,
        sessions: isPicked
          ? [{ skillId: 'UPPER_BODY' as ScheduleItemId, volumePercent: 100, sessionType: 'FULL' as const }]
          : [],
        isRestDay: !isPicked,
        warnings: [],
      };
    });
  }

  // Use the resolved seeds so the template reflects the user's actual programs.
  return buildDefaultTemplate(seedPrograms, seedSkills, frequency);
}
