"use client";

/**
 * GhostUpsell — clickable blur wrapper that nudges users to complete a
 * survey/onboarding flow.
 *
 * Pattern lifted from `StrengthVolumeWidget` lines 143–180 (the "השלם את
 * פרופיל הכוח שלך" upsell). Centralised here so Rows 2, 4 and 5 can apply
 * the same visual + interaction language to any incomplete-survey state.
 *
 * Behaviour:
 *   - Children are rendered blurred + dimmed and become non-interactive.
 *   - An absolute overlay button sits on top with the CTA text.
 *   - Clicking anywhere on the card fires `onClick` (typically navigates
 *     to the corresponding onboarding screen).
 */

import React from 'react';
import { Sparkles, Plus } from 'lucide-react';

interface GhostUpsellProps {
  /** Fired when the user taps the upsell card */
  onClick: () => void;
  /** Headline text shown over the blur (e.g. "השלם סקר כוח"). Ignored when `variant="silent"`. */
  label?: string;
  /** Small CTA text below the headline (e.g. "להגיע ל-100% →"). Ignored when `variant="silent"`. */
  ctaText?: string;
  /** Optional icon override (defaults to Sparkles for "card", Plus for "silent"). */
  icon?: React.ReactNode;
  /** Underlying ghosted UI */
  children: React.ReactNode;
  /**
   * Visual variant.
   *  - "card"   (default): full overlay with icon + label + CTA. Use when the
   *                       upsell is the primary content (e.g. Row 2 right card
   *                       fully blurred).
   *  - "silent":          minimal — blur only, with a small bottom-right "+"
   *                       affordance so the surface still reads as actionable
   *                       without competing for attention. Use when the
   *                       ghosted element sits next to live data (e.g. the
   *                       Run bar inside ConsistencyWidget when only the run
   *                       survey is missing).
   */
  variant?: 'card' | 'silent';
  className?: string;
}

export function GhostUpsell({
  onClick,
  label,
  ctaText = 'להתחיל →',
  icon,
  children,
  variant = 'card',
  className = '',
}: GhostUpsellProps) {
  if (variant === 'silent') {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`relative w-full text-right h-full ${className}`}
        aria-label={label}
        dir="rtl"
      >
        {/* Blurred ghost of the underlying bars/cards. */}
        <div className="filter blur-[3px] opacity-50 pointer-events-none select-none h-full">
          {children}
        </div>

        {/* Tiny corner affordance — no copy, no big overlay. */}
        <span className="absolute bottom-0 left-0 w-6 h-6 rounded-full bg-[#5BC2F2] text-white flex items-center justify-center shadow-md">
          {icon ?? <Plus size={14} strokeWidth={3} />}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-full text-right h-full ${className}`}
      dir="rtl"
    >
      <div className="filter blur-[6px] opacity-40 pointer-events-none select-none h-full">
        {children}
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/60 dark:bg-slate-800/60 backdrop-blur-[1px] rounded-xl px-3">
        <div className="w-10 h-10 rounded-full bg-[#5BC2F2]/10 flex items-center justify-center">
          {icon ?? <Sparkles size={20} className="text-[#5BC2F2]" />}
        </div>
        {label && (
          <p className="text-sm font-bold text-slate-800 dark:text-white text-center leading-snug">
            {label}
          </p>
        )}
        {ctaText && <span className="text-xs font-bold text-[#5BC2F2]">{ctaText}</span>}
      </div>
    </button>
  );
}

export default GhostUpsell;
