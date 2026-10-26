'use client';

/**
 * Pilot P11: this week's planned strength sessions, read the way the schedule reads them
 * (userSchedule day docs + template, via materializePlanned). One batched read, read-only.
 * Empty until loaded, or when `enabled` is false / the read fails.
 */
import { useEffect, useState } from 'react';
import { getScheduleEntriesForDates } from '@/features/user/scheduling/services/userSchedule.service';
import { materializePlanned, weekKeysOf } from '@/features/schedule/advisor';
import { localDateKey } from '@/features/schedule/advisor/adapters/client';
import type { AdvisorProfile, AdvisorScheduleDay, PlannedEntry } from '@/features/schedule/advisor/types';
import { resolveToSlug } from '@/features/workout-engine/services/program-hierarchy.utils';

export function useWeekPlannedStrength(uid: string | null | undefined, profile: unknown, enabled: boolean): PlannedEntry[] {
  const [planned, setPlanned] = useState<PlannedEntry[]>([]);
  useEffect(() => {
    if (!enabled || !uid || !profile) return;
    let alive = true;
    const keys = weekKeysOf(localDateKey(new Date()));
    getScheduleEntriesForDates(uid, keys)
      .then((entries) => {
        if (!alive || !entries) return;
        const days: AdvisorScheduleDay[] = Object.entries(entries).map(([date, list]) => ({
          date,
          entries: [...list] as AdvisorScheduleDay['entries'],
        }));
        const all = materializePlanned(profile as AdvisorProfile, keys, days, resolveToSlug);
        setPlanned(all.filter((p) => p.kind === 'strength'));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [uid, profile, enabled]);
  return planned;
}
