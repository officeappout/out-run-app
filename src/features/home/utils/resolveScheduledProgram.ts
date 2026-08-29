import type { UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';
import { excludeRunningShadowEntry } from '@/features/schedule/services/excludeRunningShadowEntry';

/**
 * Pure decision logic behind StatsOverview's "what should today's workout be
 * generated from" step. Extracted specifically so the trap below is covered
 * by a unit test — this repo's vitest has no jsdom, so the surrounding
 * component itself isn't testable, but this piece is.
 *
 * `rawEntries` is whatever `getScheduleEntries` already had for the date.
 * `hydrated` is whatever `hydrateFromTemplate` just wrote — populated ONLY
 * when the caller had nothing usable in `rawEntries` (that's why hydration
 * ran in the first place), so exactly one of the two is ever non-empty for
 * training-id purposes. Ids must be collected from BOTH, not `rawEntries`
 * alone — a day that was just hydrated for the first time has all its real
 * training entries in `hydrated`, none in `rawEntries`.
 */
export interface ScheduledProgramInput {
  rawEntries: UserScheduleEntry[];
  hydrated: UserScheduleEntry[];
  /** `profile.lifestyle.recurringTemplate?.[todayLetter]`, unfiltered. */
  templateDayIds: string[] | undefined;
  /** `(scheduleDays.length ?? 0) > 0 || Object.keys(recurringTemplate ?? {}).length > 0`. */
  hasScheduleConfigured: boolean;
  activeProgramId: string | undefined;
  /**
   * `profile.running.activeProgram?.programId`. The running bridge writes
   * this same id into `recurringTemplate[day]`, so `hydrateFromTemplate`
   * materializes a shadow `UserScheduleEntry` for it — excluded from id
   * collection below via `excludeRunningShadowEntry` so it never leaks into
   * the strength generator's `scheduledProgramIds` as if it were a real
   * strength program. Confirmed live bug before this fix (29.08.2026):
   * `resolveToSlug` doesn't safely reject an unrecognized id, it passes it
   * through — "exercise may get wrong level" per its own comment.
   */
  runningProgramId: string | undefined;
}

export interface ScheduledProgramResolution {
  isRestDay: boolean;
  scheduledProgramIds: string[];
}

export function resolveScheduledProgram(input: ScheduledProgramInput): ScheduledProgramResolution {
  const { rawEntries, hydrated, templateDayIds, hasScheduleConfigured, activeProgramId, runningProgramId } = input;

  const rawMatch: UserScheduleEntry | null =
    rawEntries.find((e) => e.type === 'training' && e.source !== 'community') ??
    rawEntries.find((e) => e.type === 'rest') ??
    null;

  // Single-value rest-day signal — prefer the raw match; if hydration ran
  // instead (rawMatch was null), fall back to whatever it produced.
  const entry: UserScheduleEntry | null =
    rawMatch ?? hydrated.find((e) => e.type === 'rest') ?? hydrated[0] ?? null;

  const isExplicitRestDay = entry?.type === 'rest';

  const templateFallbackIds =
    !entry && templateDayIds
      ? templateDayIds.filter(Boolean)
      : null;

  const isImplicitOffDay =
    !entry && !templateFallbackIds?.length && hasScheduleConfigured;

  const isRestDay = isExplicitRestDay || isImplicitOffDay;

  // Collect training ids across BOTH rawEntries and hydrated, deduped,
  // template-array order preserved.
  const scheduledTrainingIds: string[] = (() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const relevantEntries = excludeRunningShadowEntry([...rawEntries, ...hydrated], runningProgramId);
    for (const e of relevantEntries) {
      if (e.type !== 'training' || e.source === 'community') continue;
      for (const pid of e.programIds ?? []) {
        if (!seen.has(pid)) { seen.add(pid); out.push(pid); }
      }
    }
    return out;
  })();

  const scheduledProgramIds: string[] = isRestDay
    ? []
    : scheduledTrainingIds.length > 0
      ? scheduledTrainingIds
      : templateFallbackIds?.length
        ? templateFallbackIds
        : activeProgramId ? [activeProgramId] : [];

  return { isRestDay, scheduledProgramIds };
}
