'use client';

/**
 * RouteCardUnified — the shared TEXT-ONLY route card.
 *
 * One presentational shell used by every bottom route carousel so all three
 * surfaces are pixel-identical:
 *   - RouteCarousel        (aerobic / generated loops + commutes)
 *   - BottomJourneyContainer (discover / curated "גלה מסלולים" routes)
 *   - HybridSlotCarousel   (hybrid slots — replicated on the hybrid branch)
 *
 * Structure (aerobic-style, compact, no image):
 *   name → distance + time → DifficultyBolts pill → CTA button.
 *
 * Width comes from the single ROUTE_CARD_WIDTH token; height is content-driven
 * (no fixed image slot).
 *
 * The CTA reuses the home strength-card button STYLE (rounded-full +
 * cyan→turquoise gradient, HeroWorkoutCard.tsx) so every route CTA matches the
 * home surface. Each caller keeps its own label + onClick + loading state via
 * props — only the button style is unified.
 *
 * Gated by UNIFIED_ROUTE_CARDS_ENABLED at the call site — while the flag is
 * off, callers render their existing production card instead of this one.
 */

import React from 'react';
import { MapPin, Timer } from 'lucide-react';
import DifficultyBolts, { type DifficultyValue } from '@/features/workout-engine/components/DifficultyBolts';
import { ROUTE_CARD_WIDTH } from '../constants/routeCardSize';

// Aerobic-card accent — the single stat-icon colour shared by all three cards.
const BRAND = '#00ADEF';
// Home strength-card CTA gradient (HeroWorkoutCard.tsx:716) — reused verbatim.
const HOME_CTA_GRADIENT = 'linear-gradient(135deg, #00BAF7 0%, #0CF2E3 100%)';

interface RouteCardUnifiedProps {
  name: string;
  /** Pre-formatted, e.g. "0.7 ק״מ" — each surface formats its own value. */
  distanceText: string;
  /** Pre-formatted, e.g. "7 דק׳" / "~28 דק׳". */
  durationText: string;
  /** Existing route/slot difficulty — 'easy' | 'medium' | 'hard' | 1 | 2 | 3. */
  difficulty: DifficultyValue;
  /** Carousel-focus state → the cyan ring + scale, matching the aerobic card. */
  isActive?: boolean;
  /** Optional body tap (discover uses it for focus → detail). */
  onClick?: () => void;
  /** Positioning classes from the host carousel (e.g. snap utilities). */
  className?: string;
  /** CTA inner content (icon + label) — each surface keeps its own text. */
  ctaContent: React.ReactNode;
  /** CTA click — each surface keeps its own logic. */
  onCta: (e: React.MouseEvent) => void;
  /** Discover-style loading state → shows a neutral pill instead of the CTA. */
  ctaLoading?: boolean;
}

export default function RouteCardUnified({
  name,
  distanceText,
  durationText,
  difficulty,
  isActive = false,
  onClick,
  className = '',
  ctaContent,
  onCta,
  ctaLoading = false,
}: RouteCardUnifiedProps) {
  return (
    <div
      dir="rtl"
      onClick={onClick}
      className={`${ROUTE_CARD_WIDTH} bg-white rounded-3xl p-5 transition-all duration-300 ${
        isActive
          ? 'shadow-[0_0_0_2.5px_rgba(0,229,255,0.85),0_14px_32px_rgba(0,0,0,0.18)] scale-[1.02]'
          : 'shadow-[0_10px_28px_rgba(0,0,0,0.14)] opacity-90 scale-[0.97]'
      } ${className}`}
    >
      {/* Name */}
      <h3 className="text-[15px] font-black text-gray-900 truncate leading-tight">
        {name}
      </h3>

      {/* Distance + time */}
      <div className="flex items-center gap-4 mt-2 mb-3">
        <div className="flex items-center gap-1.5">
          <MapPin size={13} style={{ color: BRAND }} className="shrink-0" />
          <span className="text-[13px] font-black text-gray-800" dir="ltr">{distanceText}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Timer size={13} style={{ color: BRAND }} className="shrink-0" />
          <span className="text-[13px] font-black text-gray-800" dir="ltr">{durationText}</span>
        </div>
      </div>

      {/* DifficultyBolts pill — same treatment as the slot card */}
      <div
        className="inline-flex items-center rounded-lg mb-4"
        style={{ border: '0.5px solid #E0E9FF', boxShadow: '0 2px 12px rgba(0,0,0,.05)', padding: '4px 10px' }}
      >
        <DifficultyBolts difficulty={difficulty} size="sm" />
      </div>

      {/* CTA — home strength-card style (rounded-full + cyan→turquoise gradient);
          label/onClick supplied by the host surface. */}
      {ctaLoading ? (
        <div className="w-full py-3 rounded-full bg-gray-100 flex items-center justify-center">
          <span className="text-xs text-gray-400 font-bold animate-pulse">טוען...</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={onCta}
          className="w-full py-3 rounded-full text-black font-semibold text-sm shadow-md shadow-cyan-400/25 flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
          style={{ background: HOME_CTA_GRADIENT }}
        >
          {ctaContent}
        </button>
      )}
    </div>
  );
}
