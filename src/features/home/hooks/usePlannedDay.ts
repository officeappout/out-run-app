'use client';

/**
 * A future day's plan for home's week strip (enable_home_v2): ONE read of that day's
 * userSchedule doc (no hydrate write, no listener) + the run already in the profile,
 * resolved for that date. Disabled / no date → nothing is read and `plan` is null.
 * The ordering and titles are day-plan.ts (pure, shared with the map).
 */
import { useEffect, useMemo, useState } from 'react';
import { getScheduleEntries } from '@/features/user/scheduling/services/userSchedule.service';
import type { UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';
import { getHebrewDayLetter } from '@/features/user/scheduling/utils/dateUtils';
import { resolveRunningDayState } from '@/lib/running-day-resolution';
import { runPlacementOf } from '@/features/schedule/utils/runWeekByType';
import { resolveRunningCurrentWeek } from '@/features/workout-engine/shared/utils/running-current-week.utils';
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import { buildPlannedDay, type PlannedDay } from '../utils/day-plan';
import type { HomeRunEntry } from '../utils/home-run-slot';
import { plannedDayFocusOf } from '../utils/planned-day-focus';

export function usePlannedDay(
  profile: UserFullProfile | null | undefined,
  dateISO: string | null,
  enabled: boolean,
  /** Without a strength program the template / scheduleDays fallback is not a strength day. */
  hasStrengthProgram: boolean,
): { plan: PlannedDay | null; loading: boolean } {
  const uid = profile?.id;
  const [entries, setEntries] = useState<{ date: string; list: UserScheduleEntry[] } | null>(null);

  useEffect(() => {
    if (!enabled || !uid || !dateISO) return;
    let alive = true;
    getScheduleEntries(uid, dateISO)
      .then((list) => { if (alive) setEntries({ date: dateISO, list }); })
      .catch((err) => {
        console.warn('[usePlannedDay] read failed', err);
        if (alive) setEntries({ date: dateISO, list: [] });
      });
    return () => { alive = false; };
  }, [enabled, uid, dateISO]);

  const running = profile?.running;
  const lifestyle = profile?.lifestyle as
    | { scheduleDays?: string[]; recurringTemplate?: Record<string, string[]> }
    | undefined;

  const plan = useMemo<PlannedDay | null>(() => {
    if (!enabled || !dateISO || !entries || entries.date !== dateISO) return null;
    const date = new Date(`${dateISO}T00:00:00`);
    const letter = getHebrewDayLetter(date);

    const schedule = running?.activeProgram?.schedule as HomeRunEntry[] | undefined;
    const hasRunningPlan = !!running?.isUnlocked && !!schedule?.length;
    let run: HomeRunEntry | null = null;
    if (hasRunningPlan) {
      const startDate = running?.activeProgram?.startDate as Date | string | number | undefined;
      const placement = runPlacementOf(running);
      const state = resolveRunningDayState<HomeRunEntry>(
        (running?.scheduleDays as string[] | undefined) ?? [],
        schedule,
        resolveRunningCurrentWeek(startDate, running?.activeProgram?.currentWeek, date) ?? 1,
        date,
        startDate,
        { byType: true, level: placement.level, targetDistance: placement.targetDistance, preferredLongRunDay: placement.preferredLongRunDay, runMoves: placement.runMoves },
      );
      const e = state.todayEntry;
      if (state.isRunDay && e && e.status !== 'skipped') run = e;
    }

    const scheduleDays = hasStrengthProgram ? lifestyle?.scheduleDays ?? [] : [];
    const template = hasStrengthProgram ? lifestyle?.recurringTemplate ?? {} : {};
    // The recommended split's focus for that day ("אימון עליון") — same rule as the generator.
    const dayIds = entries.list.find((e) => e.type === 'training' && e.source !== 'community' && e.programIds?.length)?.programIds
      ?? template[letter]
      ?? [profile?.progression?.activePrograms?.[0]?.templateId ?? ''];
    const strengthFocus = hasStrengthProgram && profile
      ? plannedDayFocusOf({ profile: profile as Parameters<typeof plannedDayFocusOf>[0]['profile'], dateISO, programIds: dayIds.filter(Boolean) })
      : null;
    return buildPlannedDay({
      entries: entries.list,
      templateDayIds: template[letter] ?? null,
      isStrengthScheduleDay: scheduleDays.includes(letter),
      runningProgramId: running?.activeProgram?.programId,
      run,
      hasSchedule: scheduleDays.length > 0 || Object.keys(template).length > 0 || hasRunningPlan || entries.list.length > 0,
      strengthFocus,
    });
    // profile: read for the focus only; running / lifestyle above already track its changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, dateISO, entries, running, lifestyle, hasStrengthProgram, profile?.progression]);

  return { plan, loading: enabled && !!dateISO && !plan };
}
