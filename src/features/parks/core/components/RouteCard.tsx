'use client';

/**
 * RouteCard — the single shared route card.
 *
 * variant="compact"  → carousel card (intent-first 3-options; RouteCarousel).
 * variant="hero"     → full detail header (RouteDetailSheet) — Phase 4, not yet.
 *
 * Design language matches the park-page card (park-preview): white rounded-2xl,
 * hero photo with a fade-to-white gradient + title pulled up over it, tight
 * gray meta line, rounded chips, cyan CTA, no emoji. Intent affordances
 * (type-tag, shape-tag, access label, "מומלץ", "החלף") are OPTIONAL props so the
 * free-run/commute carousel renders unchanged when they're absent.
 *
 * Image slot: photo → shown; no photo → clean collapsed white card (no route
 * line). Every read is field-guarded per CLAUDE.md law 5.
 */
import React, { useMemo } from 'react';
import { Play, ChevronLeft, RefreshCw, ArrowLeftRight, MoveRight, type LucideIcon } from 'lucide-react';
import type { Route, ActivityType } from '../types/route.types';
import { haversineKm, distanceLabel } from '@/features/arena/utils/distance';
import { bunnyImg } from '@/lib/bunny-image';

export type RouteCardVariant = 'compact' | 'hero';
export type RouteCardShape = 'loop' | 'out_and_back' | 'point_to_point';

/** A generic pill shown at the top of the card (commute variant OR intent type-tag). */
export interface RouteCardBadge {
  label: string;
  Icon?: LucideIcon;
  /** Tailwind classes for bg+text (e.g. 'bg-cyan-100 text-cyan-700'). */
  className?: string;
}

export interface RouteCardProps {
  variant?: RouteCardVariant; // default 'compact'
  route: Route;
  activity?: ActivityType;
  isActive?: boolean; // carousel focus styling

  /** Distance to show (km) — e.g. effectiveKm for a ×N loop. Falls back to route.distance. */
  displayKm?: number;
  /** Lap multiplier (metadata only; the shown km already reflects it). */
  laps?: number;

  /** Top pill (commute variant, or intent type-tag מכאן/קרוב/נסיעה). */
  topBadge?: RouteCardBadge;
  /** Shape chip in the meta line (לולאה / הלוך-חזור). */
  shapeTag?: RouteCardShape;
  /** Access label e.g. "6 דק׳ הליכה" / "4 דק׳ נסיעה" / "מהמיקום שלך". */
  accessLabel?: string;
  /** Renders a "מומלץ" pill (option 1 "כאן ועכשיו"). */
  recommended?: boolean;
  /** For the "מרחק ממך" tag — same primitive as the park card. */
  userLocation?: { lat: number; lng: number } | null;

  ctaLabel?: string; // default "התחל"
  onStart?: () => void;
  /** "החלף" — bring another candidate of the SAME bucket. Hidden when absent. */
  onSwap?: () => void;
  onOpenDetail?: () => void;
}

const SHAPE_META: Record<RouteCardShape, { label: string; Icon: LucideIcon }> = {
  loop: { label: 'לולאה', Icon: RefreshCw },
  out_and_back: { label: 'הלוך-חזור', Icon: ArrowLeftRight },
  point_to_point: { label: 'מקצה לקצה', Icon: MoveRight },
};

export default function RouteCard(props: RouteCardProps) {
  const {
    variant = 'compact', route, isActive = false,
    displayKm, topBadge, shapeTag, accessLabel, recommended,
    userLocation, ctaLabel = 'התחל', onStart, onSwap, onOpenDetail,
  } = props;

  const displayName = route?.name?.trim() || 'מסלול';
  const km = typeof displayKm === 'number' && displayKm > 0 ? displayKm : (route?.distance ?? 0);
  const durationText = route?.duration ? `~${route.duration} דק׳` : '';
  const photo = bunnyImg(route?.images?.find((u) => typeof u === 'string' && u.length > 0) || null, 400);
  const shape = shapeTag ? SHAPE_META[shapeTag] : null;

  // "מרחק ממך" — same primitive as the park card; hidden when trivial (<50m) or unknown.
  const distFromYou = useMemo(() => {
    const start = route?.path?.[0];
    if (!userLocation || !Array.isArray(start) || !Number.isFinite(start[0]) || !Number.isFinite(start[1])) return null;
    const d = haversineKm(userLocation.lat, userLocation.lng, start[1], start[0]);
    if (!Number.isFinite(d) || d < 0.05) return null;
    return distanceLabel(d);
  }, [userLocation, route?.path]);

  // Hero variant lands in Phase 4 — compact is the only implemented layout today.
  if (variant === 'hero') return null;

  const TopBadges = ({ overlay }: { overlay: boolean }) => (
    <>
      {recommended && (
        <span className={overlay ? 'absolute top-1.5 right-1.5 px-2 py-0.5 rounded-full text-[10px] font-black text-white bg-cyan-500 shadow-sm' : 'px-2 py-0.5 rounded-full text-[10px] font-black text-white bg-cyan-500'}>
          מומלץ
        </span>
      )}
      {topBadge && (
        <span className={`${overlay ? 'absolute top-1.5 left-1.5 ' : ''}inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black ${topBadge.className ?? (overlay ? 'bg-white/90 text-gray-700' : 'bg-gray-100 text-gray-700')}`}>
          {topBadge.Icon && <topBadge.Icon size={10} strokeWidth={3} />}
          {topBadge.label}
        </span>
      )}
    </>
  );

  return (
    <div
      dir="rtl"
      role={onOpenDetail ? 'button' : undefined}
      onClick={onOpenDetail}
      className={`w-[74vw] max-w-[290px] snap-center snap-always flex-shrink-0 bg-white rounded-2xl overflow-hidden border border-gray-100 transition-all duration-300 ${onOpenDetail ? 'cursor-pointer' : ''} ${
        isActive ? 'shadow-2xl ring-2 ring-cyan-400/70 scale-[1.01]' : 'shadow-lg opacity-95 scale-[0.98]'
      }`}
    >
      {/* Hero — photo only. No photo → collapse to a clean white card. Tapping
          anywhere on the card body opens detail (outer onClick); the CTA/swap
          buttons stopPropagation so they don't trigger it. */}
      {photo && (
        <div className="relative block w-full h-[88px] bg-gradient-to-br from-cyan-100 to-slate-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
          <TopBadges overlay />
          {/* Fade into the card body — park-card signature */}
          <div className="absolute bottom-0 inset-x-0 h-10 bg-gradient-to-b from-transparent to-white pointer-events-none" />
        </div>
      )}

      <div className={`px-3 ${photo ? '-mt-3' : 'pt-3'} pb-3 relative`}>
        {/* Badges row when there's no hero to host them */}
        {!photo && (recommended || topBadge) && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <TopBadges overlay={false} />
          </div>
        )}

        <h3 className="text-[15px] font-semibold text-gray-900 leading-snug truncate">{displayName}</h3>

        {/* Tight meta line: km · time · access · shape */}
        <div className="flex items-center gap-1 mt-0.5 text-[12px] text-gray-500 flex-wrap">
          <span dir="ltr" className="font-bold text-gray-700">{km.toFixed(1)} ק״מ</span>
          {durationText && (<><span>·</span><span dir="ltr">{durationText}</span></>)}
          {accessLabel
            ? (<><span>·</span><span className="text-cyan-600 font-bold">{accessLabel}</span></>)
            : (distFromYou && (<><span>·</span><span>{distFromYou} ממך</span></>))}
          {shape && (
            <span className="inline-flex items-center gap-0.5 mr-0.5 bg-gray-100 border border-gray-200/60 rounded-full px-1.5 py-[1px] text-[10px] text-gray-500">
              <shape.Icon size={9} strokeWidth={2.5} />
              {shape.label}
            </span>
          )}
        </div>

        {/* CTA row: start (+ optional swap "החלף") */}
        <div className="flex items-center gap-2 mt-2.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onStart?.(); }}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-cyan-500 text-white text-[14px] font-bold active:bg-cyan-600 transition-colors"
            style={{ height: 38 }}
          >
            <Play size={13} fill="currentColor" />
            {ctaLabel}
            <ChevronLeft size={13} strokeWidth={3} />
          </button>
          {onSwap && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSwap(); }}
              title="החלף"
              aria-label="החלף מסלול"
              className="w-10 rounded-xl flex items-center justify-center bg-gray-100 text-gray-500 active:bg-gray-200 transition-colors shrink-0"
              style={{ height: 38 }}
            >
              <RefreshCw size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
