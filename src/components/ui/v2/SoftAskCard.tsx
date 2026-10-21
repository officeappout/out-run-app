'use client';

/**
 * SoftAskCard (v2) — an inline "pre-permission" card: icon tile, title, one
 * line of value, a primary action and an optional quiet secondary. Used to
 * re-ask for something the OS will prompt for (push reminders in Settings),
 * so the OS dialog only ever follows an explicit tap.
 *
 *   <SoftAskCard
 *     icon={Bell}
 *     title="שנזכיר לך לפני אימון?"
 *     body="נזכיר לך רק לפני אימון ונשמור על הרצף"
 *     primaryLabel="כן, תזכירו לי"
 *     onPrimary={accept}            // run the OS prompt FIRST inside it (web gesture rule)
 *     secondaryLabel="לא עכשיו"     // optional
 *     onSecondary={defer}
 *     busy={saving}
 *     primaryTone="cta"             // 'cta' = the screen's one gradient; 'tint' when the screen already has one
 *   />
 *
 * Presentational only — the caller owns permission/state side effects.
 * Labels never wrap; nothing below 12px.
 */

import type { ComponentType } from 'react';
import type { LucideProps } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import IconTile from './IconTile';

export interface SoftAskCardProps {
  icon: ComponentType<LucideProps>;
  title: string;
  body: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Disables both actions and spins the primary. */
  busy?: boolean;
  /** 'cta' (default) = gradient pill; 'tint' = brand-tint pill (screen already has its gradient CTA). */
  primaryTone?: 'cta' | 'tint';
  className?: string;
}

const PRIMARY: Record<NonNullable<SoftAskCardProps['primaryTone']>, string> = {
  cta: 'bg-v2-cta text-v2-on-cta shadow-v2-cta',
  tint: 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40',
};

export default function SoftAskCard({
  icon,
  title,
  body,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  busy = false,
  primaryTone = 'cta',
  className = '',
}: SoftAskCardProps) {
  return (
    <div dir="rtl" data-v2-soft-ask className={`rounded-[20px] bg-white p-4 shadow-v2-ring ${className}`}>
      <div className="flex items-start gap-3">
        <IconTile icon={icon} tone="accent" size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate whitespace-nowrap text-[16px] font-black !tracking-[-0.01em] text-v2-ink">{title}</p>
          <p className="mt-0.5 text-[13.5px] font-bold leading-snug text-v2-muted">{body}</p>
        </div>
      </div>
      <div className="mt-3.5 flex items-center gap-2">
        <button
          type="button"
          onClick={onPrimary}
          disabled={busy}
          className={`flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 text-[15px] font-extrabold transition-transform duration-150 ease-v2 active:scale-[0.97] disabled:opacity-80 ${PRIMARY[primaryTone]}`}
        >
          {busy && <Loader2 size={18} className="animate-spin" aria-hidden />}
          {primaryLabel}
        </button>
        {secondaryLabel && onSecondary && (
          <button
            type="button"
            onClick={onSecondary}
            disabled={busy}
            className="h-11 whitespace-nowrap rounded-full px-4 text-[14.5px] font-extrabold text-v2-muted transition-transform duration-150 ease-v2 active:scale-[0.97]"
          >
            {secondaryLabel}
          </button>
        )}
      </div>
    </div>
  );
}
