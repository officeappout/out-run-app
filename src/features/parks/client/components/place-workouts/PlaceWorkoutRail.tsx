'use client';

/**
 * The workout rail of a place page (boards RP-13 phones 1–2): section title +
 * subtitle, at most one banner, then the real workouts that fit (at most 3,
 * often fewer) as MediaWorkoutCards — home's daily card treatment: the
 * generated workout's exercise media, else the place's photo, under a dark
 * gradient — for the strength card; run / walk / hybrid cards draw the
 * workout's intensity graph instead (place-card-visual, owner 26.10). The
 * plan's card gets the tinted eyebrow. Render-only: the caller
 * ranks (suggestWorkoutsForPlace) and starts.
 */

import { Info } from 'lucide-react';
import { HScroller, MediaWorkoutCard, MEDIA_WORKOUT_CARD_ART_H, ProfileStrip } from '@/components/ui/v2';
import type { RunBlock } from '@/features/workout-engine/players/running/types/run-block.type';
import type { RunPaceContext } from '@/features/workout-engine/players/running/utils/run-preview/run-estimates';
import type { PlaceBanner, PlaceWorkoutSuggestion } from '@/features/workout-engine/place-fit';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import { placeWorkoutCopy, type GeneratedLead } from './place-workout-copy';
import { placeCardMedia } from './place-card-media';
import { placeCardVisual } from './place-card-visual';

const NO_PACE: RunPaceContext = { basePace: 0, zones: null };

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
  /** The park workout generated on open (park page): ready / 'loading' / null (not generated). */
  lead?: GeneratedLead | 'loading' | null;
  /** The card `lead` belongs to (defaults to the first card). */
  leadId?: string | null;
  /** The place's own photo, for cards with no generated workout. */
  placePhoto?: string | null;
  /** Today's planned run blocks (its card's real intensity graph). */
  planRunBlocks?: readonly RunBlock[] | null;
  paceCtx?: RunPaceContext;
  onStart: (s: PlaceWorkoutSuggestion) => void;
}

export default function PlaceWorkoutRail({
  title, subtitle, suggestions, banner, lead = null, leadId, placePhoto = null, planRunBlocks = null, paceCtx = NO_PACE, onStart,
}: PlaceWorkoutRailProps) {
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
          const isLead = s.id === (leadId ?? suggestions[0]?.id);
          const copy = placeWorkoutCopy(s, t, isLead ? lead : null);
          const visual = placeCardVisual(s, { planRunBlocks, paceCtx });
          return (
            <MediaWorkoutCard
              key={s.id}
              media={placeCardMedia(s, isLead ? lead : null, placePhoto)}
              art={visual.kind === 'graph' ? <ProfileStrip segments={visual.segments} height={MEDIA_WORKOUT_CARD_ART_H} /> : undefined}
              highlight={s.isFromPlan}
              eyebrow={copy.eyebrow}
              title={copy.title}
              meta={copy.meta}
              cta={i === 0 ? t('placeWorkouts.cta.lead') : t('placeWorkouts.cta.other')}
              onStart={() => onStart(s)}
            />
          );
        })}
      </HScroller>
    </section>
  );
}
