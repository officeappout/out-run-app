'use client';

/**
 * The workout card inside a Kelly reply: the home hero card (HeroWorkoutCard), half the
 * height. Same visual pieces: the first main exercise's thumbnail as the hero image
 * (pickHeroExercise + resolveHeroMedia → the Bunny thumbnail, brand gradient when there
 * is none), the white fade into the content, the program icon + heavy title, difficulty
 * in words + bolts, and the gradient CTA pill with a play glyph. Chat additions: minute /
 * exercise / location chips and a small glass "קלי AI" tag on the image.
 *
 * Three states: ready (tap opens the regular workout preview), building (skeleton while
 * the device builds the workout) and failed. Always light (the chat screen is light only).
 */
import React, { useMemo } from 'react';
import { AlertCircle, Play, Sparkles } from 'lucide-react';
import type { WorkoutCard } from '@/lib/ai/coach/protocol';
import { BoltIcon, PROGRAM_ICON_MAP } from '@/features/home/components/HeroWorkoutCard';
import { pickHeroExercise, resolveHeroMedia } from '@/features/workout-engine/shared/utils/heroMedia.utils';
import { BRAND_CTA_FILL_CLASS } from '@/components/ui/BrandCtaButton';
import { getAiWorkout } from '../services/workout-cache';
import { workoutCardView } from '../services/workout-card-view.pure';
import { useT } from '@/hooks/useT';
import { coach } from '@/messages/ns/coach';

/** Half the home card (330px), so a reply with a card still fits the screen. */
export const AI_CARD_HEIGHT = 176;
const CARD_WIDTH = 'min(300px, 82vw)';
const CARD_RADIUS = 22;
/** v2 card depth: long, faint, negative-spread drop + a hairline ring (design language §4). */
const CARD_SHADOW = '0 24px 50px -36px rgba(9,30,50,0.45), 0 0 0 1px rgba(14,27,42,0.06)';
export const CTA_SHADOW = 'inset 0 1px 0 rgba(255,255,255,0.5), 0 10px 26px -12px rgba(0,186,247,0.7)';
/** The home card's fade, a little earlier: the content block is a larger share of a short card. */
export const CARD_FADE = 'linear-gradient(to bottom, rgba(255,255,255,0) 12%, rgba(255,255,255,0.92) 52%, #ffffff 66%)';
export const BRAND_GRADIENT = 'linear-gradient(135deg, #00BAF7 0%, #0CF2E3 100%)';
const SKILL_ICONS = new Set(['planche', 'front_lever', 'handstand', 'hspu', 'one_arm_pullup']);

function iconSrcFor(key: string): string | null {
  return PROGRAM_ICON_MAP[key] ?? (SKILL_ICONS.has(key) ? `/icons/programs/${key}.svg` : null);
}

export const frameStyle: React.CSSProperties = {
  width: CARD_WIDTH,
  height: AI_CARD_HEIGHT,
  borderRadius: CARD_RADIUS,
  boxShadow: CARD_SHADOW,
};

/** Liquid-glass tag over the image (design language §5, small). */
export function GlassTag() {
  const t = useT(coach);
  return (
    <span
      className="absolute right-2.5 top-2.5 z-20 inline-flex h-6 items-center gap-1 rounded-full px-2 text-[10.5px] font-extrabold text-v2-ink"
      style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.78), rgba(255,255,255,0.55))',
        WebkitBackdropFilter: 'blur(14px) saturate(180%)',
        backdropFilter: 'blur(14px) saturate(180%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.95), 0 0 0 0.5px rgba(14,27,42,0.1), 0 8px 20px -12px rgba(9,30,50,0.4)',
      }}
      aria-hidden
    >
      <Sparkles className="h-3 w-3 text-v2-deep" />
      {t('card.tag')}
    </span>
  );
}

export interface AiCoachWorkoutCardFaceProps {
  card: WorkoutCard;
  /** Hero image (the first main exercise's thumbnail); '' → brand gradient. */
  thumbnailUrl: string;
  /** Difficulty from the cached workout, for older cards that don't carry it. */
  cachedDifficulty?: number | null;
  onOpen: (card: WorkoutCard) => void;
}

/** Ready state, from plain props (rendered by tests without the device cache). */
export function AiCoachWorkoutCardFace({ card, thumbnailUrl, cachedDifficulty, onOpen }: AiCoachWorkoutCardFaceProps) {
  const t = useT(coach);
  const view = workoutCardView(card, cachedDifficulty, t);
  const iconSrc = iconSrcFor(view.iconKey);
  return (
    <button
      type="button"
      data-ai-card="ready"
      onClick={() => onOpen(card)}
      aria-label={view.ariaLabel}
      className="group relative block overflow-hidden bg-white text-right transition-transform duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-accent focus-visible:ring-offset-2"
      style={frameStyle}
      dir="rtl"
    >
      {/* Hero image (top part): the same media the home card picks */}
      <span className="absolute inset-x-0 top-0 h-[62%]" aria-hidden>
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnailUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : (
          <span className="block h-full w-full" style={{ background: BRAND_GRADIENT }} />
        )}
      </span>
      <span className="pointer-events-none absolute inset-0 z-[5]" style={{ background: CARD_FADE }} aria-hidden />
      <GlassTag />

      {/* Content */}
      <span className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-1.5 px-3 pb-3">
        <span className="flex items-center gap-1.5">
          {view.chips.map((c) => (
            <span
              key={c.key}
              data-chip={c.key}
              className="inline-flex h-[22px] items-center whitespace-nowrap rounded-full bg-v2-tint px-2 text-[11px] font-bold text-v2-deep"
            >
              {c.label}
            </span>
          ))}
          {view.difficultyLabel && view.difficulty && (
            <span
              data-chip="difficulty"
              className="ms-auto inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold text-v2-ink-2"
            >
              {view.difficultyLabel}
              <span className="flex items-center gap-px" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <BoltIcon key={i} filled={i < view.difficulty!} />
                ))}
              </span>
            </span>
          )}
        </span>

        <span className="flex min-w-0 items-center gap-1.5">
          {iconSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={iconSrc} alt="" width={18} height={18} className="shrink-0 opacity-80" aria-hidden />
          )}
          <span className="truncate text-[15px] font-black leading-tight text-v2-ink" style={{ letterSpacing: '-0.02em' }}>
            {view.title}
          </span>
        </span>

        <span
          className={`${BRAND_CTA_FILL_CLASS} pointer-events-none flex h-9 w-full items-center justify-center gap-1.5 text-[13.5px] font-extrabold`}
          style={{ boxShadow: CTA_SHADOW }}
        >
          <Play size={13} strokeWidth={2.6} className="fill-current" aria-hidden />
          {t('card.open')}
        </span>
      </span>
    </button>
  );
}

/** Ready state: resolves the hero image from the workout this device cached for the card. */
export default function AiCoachWorkoutCard({ card, onOpen }: { card: WorkoutCard; onOpen: (card: WorkoutCard) => void }) {
  const media = useMemo(() => {
    const cached = getAiWorkout(card.workoutId);
    if (!cached) return { thumbnailUrl: '', difficulty: null as number | null };
    const hero = pickHeroExercise(cached.workout.exercises, cached.location);
    return { thumbnailUrl: resolveHeroMedia(hero, cached.location).thumbnailUrl, difficulty: cached.workout.difficulty ?? null };
  }, [card.workoutId]);
  return <AiCoachWorkoutCardFace card={card} thumbnailUrl={media.thumbnailUrl} cachedDifficulty={media.difficulty} onOpen={onOpen} />;
}

/** Building state: the card's own shape, pulsing, while the device builds the workout. */
export function AiCoachWorkoutCardSkeleton() {
  const t = useT(coach);
  return (
    <div role="status" aria-live="polite" data-ai-card="building" className="relative overflow-hidden bg-white" style={frameStyle} dir="rtl">
      <div className="absolute inset-x-0 top-0 h-[62%] bg-v2-tint motion-safe:animate-pulse" aria-hidden />
      <div className="pointer-events-none absolute inset-0" style={{ background: CARD_FADE }} aria-hidden />
      <div className="absolute right-2.5 top-2.5 inline-flex h-6 items-center gap-1 rounded-full bg-white/85 px-2 text-[11px] font-extrabold text-v2-deep">
        <Sparkles className="h-3 w-3 motion-safe:animate-spin [animation-duration:2.4s]" aria-hidden />
        {t('card.building')}
      </div>
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 px-3 pb-3" aria-hidden>
        <div className="flex gap-1.5">
          <div className="h-[22px] w-14 rounded-full bg-gray-100 motion-safe:animate-pulse" />
          <div className="h-[22px] w-16 rounded-full bg-gray-100 motion-safe:animate-pulse" />
          <div className="h-[22px] w-12 rounded-full bg-gray-100 motion-safe:animate-pulse" />
        </div>
        <div className="h-4 w-40 rounded-md bg-gray-100 motion-safe:animate-pulse" />
        <div className="h-9 w-full rounded-full bg-gray-100 motion-safe:animate-pulse" />
      </div>
    </div>
  );
}

/** Failed state: the device could not build the workout. Impersonal copy (any user gender). */
export function AiCoachWorkoutCardError({ onRetry, onBuilder }: { onRetry?: () => void; onBuilder?: () => void }) {
  const t = useT(coach);
  return (
    <div
      role="alert"
      data-ai-card="failed"
      className="flex flex-col justify-center gap-2.5 bg-white px-4 py-3 text-right"
      style={{ ...frameStyle, height: 'auto', minHeight: 120 }}
      dir="rtl"
    >
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-v2-tint text-v2-deep">
          <AlertCircle className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block text-[14px] font-black text-v2-ink">{t('card.failed.title')}</span>
          <span className="block text-[12px] font-semibold text-v2-muted">{t('card.failed.body')}</span>
        </span>
      </div>
      {(onRetry || onBuilder) && (
        <div className="flex gap-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className={`${BRAND_CTA_FILL_CLASS} h-10 flex-1 text-[13px] font-extrabold transition-transform active:scale-[0.97]`}
            >
              {t('card.failed.retry')}
            </button>
          )}
          {onBuilder && (
            <button
              type="button"
              onClick={onBuilder}
              className="h-10 flex-1 rounded-full bg-white text-[13px] font-extrabold text-v2-ink ring-1 ring-inset ring-v2-pill-border transition-transform active:scale-[0.97]"
            >
              {t('card.failed.builder')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
