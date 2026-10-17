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
import { hapticLight, hapticMedium } from '@/lib/haptics';
import { ActivityGlyph } from './hybrid/activity-icons';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';

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
  /**
   * Start-experience state map (11.10.2026): when set, the CTA renders in a
   * greyed/muted style and tapping it calls `onCtaBlocked` INSTEAD of
   * `onCta` — deliberately NOT a literal HTML `disabled` attribute (which
   * would swallow the tap event entirely and give no feedback). Mirrors the
   * existing "locked card, tap explains why" idiom elsewhere in this
   * codebase (HybridJourneyAxis.tsx's locked station card; WorkoutBuilderSheet.tsx's
   * gated program pill) rather than inventing a new pattern. Omitted by
   * every existing caller → byte-identical to before this prop existed.
   */
  ctaBlockedReason?: string | null;
  /** Called instead of `onCta` when `ctaBlockedReason` is set. */
  onCtaBlocked?: (reason: string) => void;
  /**
   * 'slim' — scoped to the discover "focused suggestions" carousel only (HybridSlotCarousel):
   * tighter padding/gaps and the difficulty bolts share ONE row with `extraContent` (the time
   * pill). Default keeps the shared spacing byte-identical for BottomJourneyContainer + RouteCarousel.
   */
  variant?: 'default' | 'slim';
  /**
   * When set, the duration shows this activity's glyph (🚶/🏃) instead of the clock — so the number reads as
   * "this route takes N min (walking/running)", not an unlabeled time. Curated cards only.
   */
  durationActivity?: 'walking' | 'running';
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
  ctaBlockedReason = null,
  onCtaBlocked,
  variant = 'default',
  durationActivity,
}: RouteCardUnifiedProps) {
  // Home v2 (enable_home_v2): the design-lab card — white v2 card, 17px black title,
  // 13px muted meta, tinted badge and the single v2 gradient CTA. Flag off = today's card.
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const v2 = useFeatureFlags(isSuperAdmin).flags.enableHomeV2;
  const slim = variant === 'slim';
  const hasStats = !!distanceText && !!durationText;
  // G1.4 (Sderot pilot): the curated discover card (slim + stats — BottomJourneyContainer is the only
  // caller with that combination) read as too thick on the map. Visual-only tightening, scoped to it;
  // the slot card (slim, no stats) and the default variant keep their spacing byte-identical.
  const compact = slim && hasStats;
  const handleClick = onClick
    ? () => {
        hapticLight();
        onClick();
      }
    : undefined;
  const handleCta = (e: React.MouseEvent) => {
    if (ctaBlockedReason) {
      hapticLight();
      onCtaBlocked?.(ctaBlockedReason);
      return;
    }
    hapticMedium();
    onCta(e);
  };
  return (
    <div
      dir="rtl"
      onClick={handleClick}
      className={`${ROUTE_CARD_WIDTH} shrink-0 bg-white ${v2 ? 'rounded-v2-card' : 'rounded-3xl'} ${compact ? 'px-4 pt-2.5 pb-2.5' : slim ? 'px-4 py-3' : 'p-5'} transition-all duration-300 ${v2 ? 'ease-v2 ' : ''}${
        v2
          ? isActive
            ? 'shadow-v2-float ring-2 ring-v2-accent scale-[1.02]'
            : 'shadow-v2-card opacity-90 scale-[0.97]'
          : isActive
          ? 'shadow-[0_0_0_2.5px_rgba(0,229,255,0.85),0_14px_32px_rgba(0,0,0,0.18)] scale-[1.02]'
          : 'shadow-[0_10px_28px_rgba(0,0,0,0.14)] opacity-90 scale-[0.97]'
      } ${className}`}
    >
      {/* Name + "מומלץ" badge (same 11px/font-black/rounded-full/BRAND@18% language the
          legacy flag-off card used) */}
      <div className="flex items-center gap-2">
        <h3 className={v2 ? 'min-w-0 truncate text-[17px] font-black leading-tight !tracking-[-0.02em] text-v2-ink' : 'text-[15px] font-black text-gray-900 truncate leading-tight'}>
          {name}
        </h3>
        {recommended && (
          <span
            className={v2 ? 'shrink-0 whitespace-nowrap rounded-full bg-v2-tint px-2 py-0.5 text-[11px] font-extrabold text-v2-deep ring-1 ring-inset ring-v2-accent/40' : 'text-[11px] font-black rounded-full shrink-0'}
            style={v2 ? undefined : { color: BRAND, background: `${BRAND}18`, padding: '2px 8px' }}
          >
            מומלץ
          </span>
        )}
      </div>

      {/* Meta — distance + time on ONE inline row (· separated), or subtitle (slots) */}
      {hasStats ? (
        <div className={`flex items-center gap-1.5 ${compact ? 'mt-1 mb-1.5' : slim ? 'mt-1.5 mb-2' : 'mt-1.5 mb-3'} text-[13px] ${v2 ? 'font-bold text-v2-muted whitespace-nowrap' : 'font-black text-gray-800'}`} dir="ltr">
          <MapPin size={13} style={{ color: v2 ? undefined : BRAND }} className={v2 ? 'shrink-0 text-v2-deep' : 'shrink-0'} />
          <span>{distanceText}</span>
          <span className={v2 ? 'mx-1 font-normal text-v2-pill-border' : 'mx-1 text-gray-300 font-normal'}>·</span>
          {durationActivity ? (
            <span className={v2 ? 'inline-flex shrink-0 text-v2-deep' : 'inline-flex shrink-0'} style={v2 ? undefined : { color: BRAND }}>
              <ActivityGlyph kind="aerobic" subtype={durationActivity} className="w-[15px] h-[15px]" />
            </span>
          ) : (
            <Timer size={13} style={{ color: v2 ? undefined : BRAND }} className={v2 ? 'shrink-0 text-v2-deep' : 'shrink-0'} />
          )}
          <span>{durationText}</span>
          {/* SLIM + stats (curated cards): the bolts sit beside distance·time, so the quality tags
              (up to 3 pills) get their own row below instead of crowding a shared one. */}
          {slim && (
            <span
              className={v2 ? 'ml-auto inline-flex shrink-0 items-center rounded-full bg-v2-surface ring-1 ring-inset ring-v2-hairline' : 'ml-auto inline-flex items-center rounded-full shrink-0'}
              style={v2 ? { padding: '3px 9px' } : { border: '0.5px solid #E0E9FF', padding: '3px 9px' }}
            >
              <DifficultyBolts difficulty={difficulty} size="sm" />
            </span>
          )}
        </div>
      ) : subtitle ? (
        <p className={`text-[13px] ${v2 ? 'font-bold text-v2-muted' : 'font-semibold text-gray-500'} ${slim ? 'mt-0.5 mb-2' : 'mt-1.5 mb-3'} leading-snug truncate`}>
          {subtitle}
        </p>
      ) : null}

      {/* Extra content (e.g. route_stops duration chips) — between subtitle and difficulty,
          with reasonable distance from the CTA below (the difficulty pill sits between them). */}
      {slim && hasStats ? (
        // SLIM + stats: bolts already rendered beside distance·time above; tags (if any) on their own row.
        extraContent ? <div className="mb-2">{extraContent}</div> : <div className="mb-0.5" />
      ) : slim ? (
        // SLIM (slots): the time pill (extraContent) and the difficulty bolts share ONE row.
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="min-w-0">{extraContent}</div>
          <div
            className={v2 ? 'inline-flex shrink-0 items-center rounded-full bg-v2-surface ring-1 ring-inset ring-v2-hairline' : 'inline-flex items-center rounded-full shrink-0'}
            style={v2 ? { padding: '3px 9px' } : { border: '0.5px solid #E0E9FF', padding: '3px 9px' }}
          >
            <DifficultyBolts difficulty={difficulty} size="sm" />
          </div>
        </div>
      ) : (<>
      {extraContent && <div className="mb-3">{extraContent}</div>}

      {/* DifficultyBolts pill — cosmetic-only rounded-full restyle (was rounded-lg + shadow) so
          it reads as the same "pill" visual language as the duration chips above. Purely a
          wrapper-style change: DifficultyBolts.tsx itself (and what difficulty it displays) is
          untouched. */}
      <div
        className={v2 ? 'mb-4 inline-flex items-center rounded-full bg-v2-surface ring-1 ring-inset ring-v2-hairline' : 'inline-flex items-center rounded-full mb-4'}
        style={v2 ? { padding: '4px 10px' } : { border: '0.5px solid #E0E9FF', padding: '4px 10px' }}
      >
        {/* colorScheme="severity" (Stage 5 QW3) deliberately held back for
            the dormant merge (18.08.2026) — DifficultyBolts' new prop is
            additive/opt-in, but wiring it HERE changes real route-card
            bolt colors for every end user immediately on deploy, which is
            a live user-facing change, not dormant. Re-add once approved —
            see the route-enrichment plan's final activation checklist. */}
        <DifficultyBolts difficulty={difficulty} size="sm" />
      </div>
      </>)}

      {/* CTA — home strength-card style (rounded-full + cyan→turquoise gradient) */}
      {ctaLoading ? (
        <div className={v2 ? `flex w-full items-center justify-center rounded-full bg-v2-surface ring-1 ring-inset ring-v2-hairline ${slim ? 'h-10' : 'h-12'}` : 'w-full py-3 rounded-full bg-gray-100 flex items-center justify-center'}>
          <span className={v2 ? 'animate-pulse text-[13px] font-bold text-v2-muted' : 'text-xs text-gray-400 font-bold animate-pulse'}>טוען...</span>
        </div>
      ) : (
        <button
          type="button"
          onPointerDown={onCtaPointerDown}
          onClick={handleCta}
          aria-disabled={!!ctaBlockedReason}
          className={v2
            ? `flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-extrabold transition-transform duration-150 ease-v2 active:scale-[0.97] ${slim ? 'h-10 text-[14.5px]' : 'h-12 text-[16px]'} ${
                ctaBlockedReason ? 'bg-v2-surface text-v2-muted ring-1 ring-inset ring-v2-hairline' : 'bg-v2-cta text-v2-on-cta shadow-v2-cta'
              }`
            : `w-full ${slim ? 'py-2.5' : 'py-3'} rounded-full font-semibold text-sm flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform ${
            ctaBlockedReason ? 'text-gray-500' : 'text-black shadow-md shadow-cyan-400/25'
          }`}
          style={v2 ? undefined : ctaBlockedReason ? { background: '#E5E7EB' } : { background: HOME_CTA_GRADIENT }}
        >
          {ctaContent}
        </button>
      )}
    </div>
  );
}
