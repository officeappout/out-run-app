'use client';

/**
 * ProfileStrip — a workout's intensity profile: one rounded bar per block,
 * width by duration (`flex`), height by effort (0–100), in the block's
 * colour. Used by the v2 run preview card, briefing and weekly run cards
 * (under the JourneyStrip: the strip says the order, this says the effort).
 * Optional labels sit under the bars, spread edge to edge.
 */

export interface ProfileStripSegment {
  key: string;
  color: string;
  /** flex-grow — proportional width (e.g. minutes). */
  flex: number;
  /** Bar height, % of the strip (0–100). */
  height: number;
}

export interface ProfileStripProps {
  segments: readonly ProfileStripSegment[];
  /** Strip height in px. Default 30. */
  height?: number;
  /** Small labels under the bars ("חימום · 12′" …). */
  labels?: readonly string[];
  className?: string;
  /** Accessible summary; the strip itself is decorative. */
  ariaLabel?: string;
}

export default function ProfileStrip({ segments, height = 30, labels, className = '', ariaLabel }: ProfileStripProps) {
  if (!segments.length) return null;
  return (
    <div className={className} role={ariaLabel ? 'img' : undefined} aria-label={ariaLabel}>
      <div className="flex items-end gap-[2px]" style={{ height }} aria-hidden>
        {segments.map((s) => (
          <div
            key={s.key}
            className="min-w-[2px] rounded-[5px]"
            style={{ flex: s.flex, height: `${Math.max(8, Math.min(100, s.height))}%`, background: s.color }}
          />
        ))}
      </div>
      {labels && labels.length > 0 && (
        <div className="mt-1.5 flex justify-between gap-2 text-[11.5px] font-extrabold text-v2-muted" aria-hidden>
          {labels.map((l) => (
            <span key={l} className="whitespace-nowrap">{l}</span>
          ))}
        </div>
      )}
    </div>
  );
}
