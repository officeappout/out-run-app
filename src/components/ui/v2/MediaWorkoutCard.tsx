'use client';

/**
 * MediaWorkoutCard — a workout card of a horizontal workout rail with the
 * home daily card's media treatment (HeroMediaBackground: the workout's own
 * exercise still → its video loop, or the place's photo, or the brand
 * gradient), a dark gradient over the media and the text + CTA on it.
 * Sized for a carousel (≈ home's side card), the whole card is the button.
 * Used by the place pages ("מתאים לך כאן", "אימונים על המסלול הזה").
 *
 *   <MediaWorkoutCard media={{ thumbnailUrl, videoUrl }} eyebrow="מהתוכנית שלך"
 *     title="גוף מלא" meta="35 דק׳ · 6 תרגילים" cta="התחל אימון" onStart={start} />
 */

import { Play } from 'lucide-react';
import { BRAND_CTA_FILL_CLASS } from '@/components/ui/BrandCtaButton';
import HeroMediaBackground from './HeroMediaBackground';

export const MEDIA_WORKOUT_CARD_W = 248;
export const MEDIA_WORKOUT_CARD_H = 292;

/** Dark scrim: clear over the top half, near-ink under the text. */
const SCRIM = 'linear-gradient(to bottom, rgba(14,20,25,0) 28%, rgba(14,20,25,0.55) 55%, rgba(14,20,25,0.94) 100%)';

export interface MediaWorkoutCardMedia {
  thumbnailUrl: string;
  videoUrl: string;
}

export interface MediaWorkoutCardProps {
  media: MediaWorkoutCardMedia;
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
  media, eyebrow, title, meta, cta, onStart, highlight = false, busy = false, ariaLabel,
}: MediaWorkoutCardProps) {
  return (
    <button
      type="button"
      onClick={onStart}
      disabled={busy}
      aria-label={ariaLabel ?? `${cta} · ${title}`}
      aria-busy={busy || undefined}
      className="relative block shrink-0 overflow-hidden rounded-[24px] text-start text-white shadow-v2-card transition-transform duration-150 ease-v2 active:scale-[0.98] disabled:opacity-80"
      style={{ width: MEDIA_WORKOUT_CARD_W, height: MEDIA_WORKOUT_CARD_H }}
    >
      <span className="absolute inset-0">
        <HeroMediaBackground thumbnailUrl={media.thumbnailUrl} videoUrl={media.videoUrl} alt="" />
      </span>
      <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: SCRIM }} />
      <span
        className={`absolute start-3 top-3 max-w-[calc(100%-24px)] truncate whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-extrabold ${
          highlight ? 'bg-v2-tint text-v2-deep' : 'bg-black/35 text-white backdrop-blur-md'
        }`}
      >
        {eyebrow}
      </span>
      <span className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-3.5">
        <span className="truncate whitespace-nowrap text-[19px] font-black !tracking-[-0.02em]">{title}</span>
        {meta && <span className="truncate whitespace-nowrap text-[13px] font-bold text-white/80">{meta}</span>}
        <span
          className={`${BRAND_CTA_FILL_CLASS} mt-2.5 flex h-10 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-[15px] font-extrabold`}
          style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5), 0 10px 26px -12px rgba(0,186,247,0.7)' }}
        >
          <Play size={14} strokeWidth={2.6} className="fill-current" aria-hidden />
          {cta}
        </span>
      </span>
    </button>
  );
}
