'use client';

/**
 * RecommendationCard — the "ממליצים לך" tint card that opens a pre-filled
 * question (signup schedule steps, boards sch/S-5a / S-5d). Brand tint +
 * accent ring, never a filled gradient (the screen's one gradient is its CTA).
 *
 *   <RecommendationCard title="3 ימים בשבוע · כוח מלא א׳ / ג׳ / ה׳"
 *     detail="רמה 4 · 48 שעות התאוששות בין אימונים" aside="אפשר לשנות"
 *     notes={['+ ליבה 10′ ×2 בערב']} />
 */
import { Sparkles } from 'lucide-react';

export interface RecommendationCardProps {
  /** The recommendation itself, one or two lines. */
  title: string;
  /** Why / what it's based on — one truncated line. */
  detail?: string;
  /** Small trailing note, e.g. "אפשר לשנות". */
  aside?: string;
  /** Extra one-line reasons / add-ons under the detail ("+ ליבה 10′ ×2 בערב"). */
  notes?: readonly string[];
  /** Eyebrow label; defaults to "ממליצים לך". */
  eyebrow?: string;
  className?: string;
}

export default function RecommendationCard({ title, detail, aside, notes, eyebrow = 'ממליצים לך', className = '' }: RecommendationCardProps) {
  return (
    <div
      className={`rounded-[20px] p-3.5 ring-1 ring-inset ring-v2-accent/35 ${className}`}
      style={{ background: 'linear-gradient(135deg, rgba(0,186,247,0.10), rgba(12,242,227,0.10))' }}
    >
      <div className="flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-extrabold text-v2-deep">
        <Sparkles size={14} strokeWidth={2.2} aria-hidden />
        {eyebrow}
      </div>
      <p className="mt-1 text-[18px] font-black leading-[1.35] !tracking-[-0.01em] text-v2-ink">{title}</p>
      {(detail || aside) && (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="min-w-0 truncate whitespace-nowrap text-[12.5px] font-bold text-v2-ink-2">{detail}</span>
          {aside && <span className="shrink-0 whitespace-nowrap text-[12.5px] font-extrabold text-v2-deep">{aside}</span>}
        </div>
      )}
      {notes && notes.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {notes.map((n) => (
            <li key={n} className="truncate whitespace-nowrap text-[12px] font-bold text-v2-ink-2">
              {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
