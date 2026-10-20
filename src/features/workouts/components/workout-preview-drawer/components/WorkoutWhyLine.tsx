'use client';

/**
 * "Why this workout" — one short reason line under the drawer title
 * (enable_home_v2, owner 20.10.2026): "היום יום עליון בתוכנית עליון / תחתון · 4 ימים בשבוע",
 * "אין מתח בבית — דחיפה + ליבה", "יום כל הגוף · 3 ימים בשבוע". The text comes from the
 * pure whyLineOfWorkout helper; nothing to say → renders nothing. The host renders this
 * only for v2 users.
 */
import { Sparkles } from 'lucide-react';
import { useMemo } from 'react';
import { whyLineOfWorkout, type WhyProfileSlice } from '@/features/workout-engine/services/split-decision/why-this-workout';
import type { DayFocus } from '@/features/workout-engine/services/split-decision/day-focus.utils';
import type { PullGapMode } from '@/features/workout-engine/services/split-decision/why-this-workout';

export interface WorkoutWhyLineProps {
  workout: { dayFocus?: DayFocus; pullGap?: PullGapMode } | null | undefined;
  profile: WhyProfileSlice | null | undefined;
  location?: string | null;
}

export default function WorkoutWhyLine({ workout, profile, location }: WorkoutWhyLineProps) {
  const text = useMemo(() => {
    try {
      return whyLineOfWorkout({ workout, profile, location });
    } catch {
      return null;
    }
  }, [workout, profile, location]);
  if (!text) return null;
  return (
    <p className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[12.5px] font-bold text-v2-muted" data-testid="workout-why-line">
      <Sparkles size={14} className="shrink-0 text-v2-deep" aria-hidden />
      <span className="truncate whitespace-nowrap">{text}</span>
    </p>
  );
}
