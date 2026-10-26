'use client';

/**
 * WorkoutMiniCard — the 176 × 196 workout card of a horizontal workout rail
 * (boards RP-12 / RP-13: "מתאים לך כאן" on the park page, "אימונים על המסלול
 * הזה" on the route page). `dark` = the lead card (the plan's workout: ink
 * gradient, white text); the rest are white with a mini intensity strip.
 * Each card carries its own start pill.
 *
 *   <WorkoutMiniCard dark eyebrow="מהתוכנית שלך" title="גוף מלא" meta="35 דק׳ · 6 תרגילים"
 *     cta="התחל אימון" onStart={start} />
 */

import ProfileStrip, { type ProfileStripSegment } from './ProfileStrip';

export const WORKOUT_MINI_CARD_W = 176;
export const WORKOUT_MINI_CARD_H = 196;

export interface WorkoutMiniCardProps {
  eyebrow: string;
  title: string;
  meta?: string | null;
  cta: string;
  onStart: () => void;
  /** The lead card (from the plan). */
  dark?: boolean;
  /** Eyebrow colour on a white card (the style's accent). */
  accent?: string;
  /** Mini intensity strip (white cards only). */
  strip?: readonly ProfileStripSegment[];
  /** The start is in flight (a workout is being prepared). */
  busy?: boolean;
  /** Accessible label of the start pill (defaults to `${cta} · ${title}`). */
  ctaAriaLabel?: string;
}

const DARK_BG = 'linear-gradient(160deg, #0e1419, #24323d)';

export default function WorkoutMiniCard({
  eyebrow, title, meta, cta, onStart, dark = false, accent, strip, busy = false, ctaAriaLabel,
}: WorkoutMiniCardProps) {
  return (
    <article
      className={`flex flex-col justify-between rounded-[24px] p-3.5 ${dark ? 'text-white' : 'bg-white text-v2-ink shadow-v2-card ring-1 ring-inset ring-v2-hairline'}`}
      style={{ width: WORKOUT_MINI_CARD_W, height: WORKOUT_MINI_CARD_H, background: dark ? DARK_BG : undefined }}
    >
      <div className="min-w-0">
        <p
          className={`truncate whitespace-nowrap text-[12.5px] font-extrabold ${dark ? 'opacity-80' : ''}`}
          style={!dark && accent ? { color: accent } : undefined}
        >
          {eyebrow}
        </p>
        <h3 className="mt-0.5 truncate whitespace-nowrap text-[17px] font-black !tracking-[-0.01em]">{title}</h3>
        {meta && (
          <p className={`truncate whitespace-nowrap text-[13px] font-bold ${dark ? 'opacity-80' : 'text-v2-muted'}`}>{meta}</p>
        )}
        {!dark && strip && strip.length > 0 && <ProfileStrip segments={strip} height={22} className="mt-2" />}
      </div>
      <button
        type="button"
        onClick={onStart}
        disabled={busy}
        aria-label={ctaAriaLabel ?? `${cta} · ${title}`}
        aria-busy={busy || undefined}
        className="flex h-[42px] w-full items-center justify-center whitespace-nowrap rounded-full bg-v2-cta text-[15px] font-extrabold text-v2-on-cta transition-transform duration-150 ease-v2 active:scale-[0.97] disabled:opacity-70"
      >
        {cta}
      </button>
    </article>
  );
}
