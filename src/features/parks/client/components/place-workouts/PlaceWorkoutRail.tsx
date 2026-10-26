'use client';

/**
 * The workout rail of a place page (boards RP-13 phones 1–2): section title +
 * subtitle, at most one banner, then up to 3 WorkoutMiniCards — the first one
 * dark (the plan's, when there is one), each with its own start pill.
 * Render-only: the caller ranks (suggestWorkoutsForPlace) and starts.
 */

import { Info } from 'lucide-react';
import { HScroller, WorkoutMiniCard } from '@/components/ui/v2';
import type { PlaceBanner, PlaceWorkoutSuggestion } from '@/features/workout-engine/place-fit';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import { placeWorkoutCopy, styleAccent, styleStrip, type GeneratedLead } from './place-workout-copy';

const BANNER_KEY = {
  unlit_after_dark: 'placeWorkouts.banner.unlitAfterDark',
  budget_spent: 'placeWorkouts.banner.budgetSpent',
  climb_for_plan: 'placeWorkouts.banner.climbForPlan',
} as const;

export interface PlaceWorkoutRailProps {
  title: string;
  subtitle: string;
  suggestions: readonly PlaceWorkoutSuggestion[];
  banner: PlaceBanner | null;
  /** The first card's generated workout (park page): ready / 'loading' / null (not generated). */
  lead?: GeneratedLead | 'loading' | null;
  onStart: (s: PlaceWorkoutSuggestion) => void;
}

export default function PlaceWorkoutRail({ title, subtitle, suggestions, banner, lead = null, onStart }: PlaceWorkoutRailProps) {
  const t = useT(map);
  if (suggestions.length === 0) return null;
  return (
    <section className="mb-6" data-place-workouts>
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <h3 className="whitespace-nowrap text-[17px] font-black text-v2-ink">{title}</h3>
        <span className="truncate text-[12px] font-bold text-v2-muted">{subtitle}</span>
      </div>
      {banner && (
        <p className="mb-2.5 flex items-start gap-1.5 rounded-[16px] bg-v2-surface px-3 py-2 text-[13px] font-bold leading-snug text-v2-ink-2 ring-1 ring-inset ring-v2-hairline">
          <Info size={15} className="mt-0.5 shrink-0 text-v2-deep" aria-hidden />
          {t(BANNER_KEY[banner])}
        </p>
      )}
      <HScroller gap={3} className="-mx-5 pb-1 pt-0.5">
        {suggestions.map((s, i) => {
          const copy = placeWorkoutCopy(s, t, i === 0 ? lead : null);
          const dark = i === 0 && s.isFromPlan;
          return (
            <WorkoutMiniCard
              key={s.id}
              dark={dark}
              eyebrow={copy.eyebrow}
              title={copy.title}
              meta={copy.meta}
              accent={styleAccent(s.style)}
              strip={dark ? undefined : styleStrip(s.style)}
              cta={i === 0 ? t('placeWorkouts.cta.lead') : t('placeWorkouts.cta.other')}
              onStart={() => onStart(s)}
            />
          );
        })}
      </HScroller>
    </section>
  );
}
