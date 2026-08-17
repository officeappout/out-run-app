'use client';

/**
 * RouteCardUnified — the shared TEXT-ONLY route card (hybrid-branch replica).
 *
 * Mirrors the component on the fix/route-card-park-style branch so all three
 * bottom carousels render a pixel-identical card:
 *   - RouteCarousel (aerobic) · BottomJourneyContainer (discover) · this slot card.
 *
 * Structure (aerobic-style, compact, no image):
 *   name → meta (distance+time for routes, subtitle for slots) → DifficultyBolts
 *   pill → CTA button.
 *
 * Width from the single ROUTE_CARD_WIDTH token; height is content-driven.
 * The CTA reuses the home strength-card style (rounded-full + cyan→turquoise
 * gradient, HeroWorkoutCard). Each caller keeps its own label + onClick.
 *
 * Slots carry no distance — they pass `subtitle` instead of distance/time; the
 * meta row adapts. Gated by UNIFIED_ROUTE_CARDS_ENABLED at the call site.
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
  /** Route surfaces: pre-formatted distance, e.g. "0.7 ק״מ". */
  distanceText?: string;
  /** Route surfaces: pre-formatted time, e.g. "~28 דק׳". */
  durationText?: string;
  /** Slot surfaces (no distance): descriptive line shown in place of dist+time. */
  subtitle?: string;
  /** Existing route/slot difficulty — 'easy' | 'medium' | 'hard' | 1 | 2 | 3. */
  difficulty: DifficultyValue;
  /**
   * "מומלץ" badge (bug fix, 08.08.2026): HybridSlotCarousel's OWN legacy (flag-off) card
   * already rendered this pill for `slot.recommended` — but the unified-card migration
   * (UNIFIED_ROUTE_CARDS_ENABLED, this component) never carried the prop over, so the
   * badge silently stopped rendering the moment the flag went live. Optional + defaults
   * false: RouteCarousel (aerobic) and BottomJourneyContainer (discover) — the other two
   * callers — never pass it, so they stay byte-identical.
   */
  recommended?: boolean;
  /** Optional extra content rendered between the subtitle and the difficulty pill (e.g. the
   *  route_stops duration chips). Additive — omitted by every OTHER caller (RouteCarousel,
   *  BottomJourneyContainer), so their rendering stays byte-identical. */
  extraContent?: React.ReactNode;
  /** Carousel-focus state → the cyan ring + scale, matching the aerobic card. */
  isActive?: boolean;
  /** Optional body tap. */
  onClick?: () => void;
  /** Positioning classes from the host carousel. */
  className?: string;
  /** CTA inner content (icon + label) — each surface keeps its own text. */
  ctaContent: React.ReactNode;
  /** CTA click — each surface keeps its own logic. */
  onCta: (e: React.MouseEvent) => void;
  /** Optional CTA pointerdown (the slot uses it for anti-ghost-click arming). */
  onCtaPointerDown?: () => void;
  /** Loading state → shows a neutral pill instead of the CTA. */
  ctaLoading?: boolean;
}

export default function RouteCardUnified({
  name,
  distanceText,
  durationText,
  subtitle,
  difficulty,
  extraContent,
  isActive = false,
  onClick,
  className = '',
  ctaContent,
  onCta,
  onCtaPointerDown,
  ctaLoading = false,
  recommended = false,
}: RouteCardUnifiedProps) {
  const hasStats = !!distanceText && !!durationText;
  return (
    <div
      dir="rtl"
      onClick={onClick}
      className={`${ROUTE_CARD_WIDTH} shrink-0 bg-white rounded-3xl p-5 transition-all duration-300 ${
        isActive
          ? 'shadow-[0_0_0_2.5px_rgba(0,229,255,0.85),0_14px_32px_rgba(0,0,0,0.18)] scale-[1.02]'
          : 'shadow-[0_10px_28px_rgba(0,0,0,0.14)] opacity-90 scale-[0.97]'
      } ${className}`}
    >
      {/* Name + "מומלץ" badge (same 11px/font-black/rounded-full/BRAND@18% language the
          legacy flag-off card used) */}
      <div className="flex items-center gap-2">
        <h3 className="text-[15px] font-black text-gray-900 truncate leading-tight">
          {name}
        </h3>
        {recommended && (
          <span
            className="text-[11px] font-black rounded-full shrink-0"
            style={{ color: BRAND, background: `${BRAND}18`, padding: '2px 8px' }}
          >
            מומלץ
          </span>
        )}
      </div>

      {/* Meta — distance + time on ONE inline row (· separated), or subtitle (slots) */}
      {hasStats ? (
        <div className="flex items-center gap-1.5 mt-1.5 mb-3 text-[13px] font-black text-gray-800" dir="ltr">
          <MapPin size={13} style={{ color: BRAND }} className="shrink-0" />
          <span>{distanceText}</span>
          <span className="mx-1 text-gray-300 font-normal">·</span>
          <Timer size={13} style={{ color: BRAND }} className="shrink-0" />
          <span>{durationText}</span>
        </div>
      ) : subtitle ? (
        <p className="text-[13px] font-semibold text-gray-500 mt-1.5 mb-3 leading-snug truncate">
          {subtitle}
        </p>
      ) : null}

      {/* Extra content (e.g. route_stops duration chips) — between subtitle and difficulty,
          with reasonable distance from the CTA below (the difficulty pill sits between them). */}
      {extraContent && <div className="mb-3">{extraContent}</div>}

      {/* DifficultyBolts pill — cosmetic-only rounded-full restyle (was rounded-lg + shadow) so
          it reads as the same "pill" visual language as the duration chips above. Purely a
          wrapper-style change: DifficultyBolts.tsx itself (and what difficulty it displays) is
          untouched. */}
      <div
        className="inline-flex items-center rounded-full mb-4"
        style={{ border: '0.5px solid #E0E9FF', padding: '4px 10px' }}
      >
        <DifficultyBolts difficulty={difficulty} size="sm" colorScheme="severity" />
      </div>

      {/* CTA — home strength-card style (rounded-full + cyan→turquoise gradient) */}
      {ctaLoading ? (
        <div className="w-full py-3 rounded-full bg-gray-100 flex items-center justify-center">
          <span className="text-xs text-gray-400 font-bold animate-pulse">טוען...</span>
        </div>
      ) : (
        <button
          type="button"
          onPointerDown={onCtaPointerDown}
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
