'use client';

/** Planner v2: the row-time rule (shownPlannedTime) bound to the user's reminder times. */
import { useCallback } from 'react';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { shownPlannedTime, type PlannedTimePrefs } from '@/features/schedule/week-builder/planner/plannedTime';

export function useShownPlannedTime(): (startTime: unknown) => string | null {
  const prefs = useUserStore((s) => (s.profile as { lifestyle?: { reminders?: PlannedTimePrefs } } | null)?.lifestyle?.reminders ?? null);
  return useCallback((startTime: unknown) => shownPlannedTime(startTime, prefs), [prefs]);
}
