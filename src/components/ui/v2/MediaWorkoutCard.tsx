'use client';

/**
 * MediaWorkoutCard — a workout card of a horizontal workout rail with the
 * home daily card's media treatment (HeroMediaBackground: the workout's own
 * exercise still → its video loop, or the place's photo, or the brand
 * gradient), a dark gradient over the media and the text + CTA on it.
 * Compact carousel card (200×236), the whole card is the button.
 * Used by the place pages ("מתאים לך כאן", "אימונים על המסלול הזה").
 * `art` replaces the media with a drawn visual on the ink surface (the run /
 * walk / hybrid cards' intensity graph).
 *
 *   <MediaWorkoutCard media={{ thumbnailUrl, videoUrl }} eyebrow="מהתוכנית שלך"
 *     title="גוף מלא" meta="35 דק׳ · 6 תרגילים" cta="התחל אימון" onStart={start} />
 */

import type { ReactNode } from 'react';
import { Play } from 'lucide-react';
import { BRAND_CTA_FILL_CLASS } from '@/components/ui/BrandCtaButton';
import HeroMediaBackground from './HeroMediaBackground';

/** Compact rail card (owner 26.10: smaller), ≈ home's card proportions. */
export const MEDIA_WORKOUT_CARD_W = 200;
export const MEDIA_WORKOUT_CARD_H = 236;
/** Height the drawn `art` (intensity graph) gets inside the card. */
export const MEDIA_WORKOUT_CARD_ART_H = 72;

/** Dark scrim: clear over the top half, near-ink under the text. */
/** The ink surface under `art` (no media). */
const INK_BG = 'linear-gradient(160deg, #0e1419, #24323d)';
const SCRIM = 'linear-gradient(to bottom, rgba(14,20,25,0) 28%, rgba(14,20,25,0.55) 55%, rgba(14,20,25,0.94) 100%)';

export interface MediaWorkoutCardMedia {
  thumbnailUrl: string;
  videoUrl: string;
}

export interface MediaWorkoutCardProps {
  media: MediaWorkoutCardMedia;
  /** Drawn instead of the media (top of the card, over the ink surface). */
  art?: ReactNode;
  /** Small pill over the media (e.g. "מהתוכנית שלך", the style). */
  eyebrow: string;
  title: string;
  meta?: string | null;
  cta: string;
  onStart: () => void;
  /** The plan's card: the eyebrow pill is the brand tint instead of glass. */
  highlight?: boolean;
  busy?: boolean;
  /** Accessible label (defaults to `${cta} · ${title}`). */
  ariaLabel?: string;
}

export default function MediaWorkoutCard({
  media, art, eyebrow, title, meta, cta, onStart, highlight = false, busy = false, ariaLabel,
}: MediaWorkoutCardProps) {
  return (
    <button
      type="button"
      onClick={onStart}
      disabled={busy}
      aria-label={ariaLabel ?? `${cta} · ${title}`}
      aria-busy={busy || undefined}
      className="relative block shrink-0 overflow-hidden rounded-[22px] text-start text-white shadow-v2-card transition-transform duration-150 ease-v2 active:scale-[0.98] disabled:opacity-80"
      style={{ width: MEDIA_WORKOUT_CARD_W, height: MEDIA_WORKOUT_CARD_H, background: art ? INK_BG : undefined }}
    >
      {art ? (
        <span aria-hidden className="absolute inset-x-3 top-11 block" data-card-art>{art}</span>
      ) : (
        <>
          <span className="absolute inset-0">
            <HeroMediaBackground thumbnailUrl={media.thumbnailUrl} videoUrl={media.videoUrl} alt="" />
          </span>
          <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: SCRIM }} />
        </>
      )}
      <span
        className={`absolute start-2.5 top-2.5 max-w-[calc(100%-20px)] truncate whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-extrabold ${
          highlight ? 'bg-v2-tint text-v2-deep' : 'bg-black/35 text-white backdrop-blur-md'
        }`}
      >
        {eyebrow}
      </span>
      <span className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-3">
        <span className="truncate whitespace-nowrap text-[16px] font-black !tracking-[-0.02em]">{title}</span>
        {meta && <span className="truncate whitespace-nowrap text-[12px] font-bold text-white/80">{meta}</span>}
        <span
          className={`${BRAND_CTA_FILL_CLASS} mt-2 flex h-11 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-[14px] font-extrabold`}
          style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5), 0 10px 26px -12px rgba(0,186,247,0.7)' }}
        >
          <Play size={13} strokeWidth={2.6} className="fill-current" aria-hidden />
          {cta}
        </span>
      </span>
    </button>
  );
}
