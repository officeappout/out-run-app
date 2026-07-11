'use client';

/**
 * RouteCard — the single shared route card.
 *
 * variant="compact"  → carousel card (RouteCarousel; the intent-first 3-options).
 * variant="hero"     → full detail header (RouteDetailSheet) — Phase 4, not yet.
 *
 * Everything intent-specific (type tag מכאן/קרוב/נסיעה, shape tag לולאה/הלוך-חזור,
 * access label "X דק' הליכה", "מומלץ", "החלף") is OPTIONAL, so the existing
 * free-run/commute carousel renders unchanged when it doesn't pass them.
 *
 * Image slot: photo (route.images[0]) → route mini-map (SVG polyline from
 * route.path) → nothing (collapses; no empty grey box). Every read is
 * field-guarded per CLAUDE.md law 5.
 */
import React, { useMemo } from 'react';
import { Star, MapPin, Timer, Play, ChevronLeft, RefreshCw, ArrowLeftRight, MoveRight, type LucideIcon } from 'lucide-react';
import type { Route, ActivityType } from '../types/route.types';
import { haversineKm, distanceLabel } from '@/features/arena/utils/distance';

const ACCENT = '#00ADEF';

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
  /** Lap multiplier — renders a "×N" hint when > 1. */
  laps?: number;

  /** Top pill (commute variant, or intent type-tag מכאן/קרוב/נסיעה). */
  topBadge?: RouteCardBadge;
  /** Shape chip near the title (לולאה / הלוך-חזור). */
  shapeTag?: RouteCardShape;
  /** Access label e.g. "6 דק׳ הליכה" / "4 דק׳ נסיעה". */
  accessLabel?: string;
  /** Renders a "מומלץ" ribbon (option 1 "כאן ועכשיו"). */
  recommended?: boolean;
  /** Free-text highlight line (e.g. from routeHighlight). */
  highlight?: string;
  /** For the "מרחק ממך" tag — same primitive as the park card. */
  userLocation?: { lat: number; lng: number } | null;

  ctaLabel?: string; // default "התחל אימון"
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

function scoreToStars(score: number): number {
  const s = Number(score) || 0;
  return s >= 70 ? 3 : s >= 40 ? 2 : 1;
}

const activityEmoji = (a?: ActivityType) => (a === 'cycling' ? '🚴' : a === 'running' ? '🏃' : '🚶');

// ── Route mini-map (pure SVG polyline, no network) ───────────────────────────
function RoutePolyline({ path, stroke }: { path: [number, number][]; stroke: string }) {
  const pts = useMemo(() => {
    const clean = path.filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (clean.length < 2) return '';
    const xs = clean.map((p) => p[0]);
    const ys = clean.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const w = maxX - minX || 1e-6, h = maxY - minY || 1e-6;
    const VW = 100, VH = 56, pad = 6;
    const s = Math.min((VW - 2 * pad) / w, (VH - 2 * pad) / h);
    const ox = (VW - w * s) / 2, oy = (VH - h * s) / 2;
    return clean
      .map((p) => {
        const x = ox + (p[0] - minX) * s;
        const y = VH - (oy + (p[1] - minY) * s); // flip Y so north is up
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [path]);
  if (!pts) return null;
  return (
    <svg viewBox="0 0 100 56" className="w-full h-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** photo → mini-map → null (caller collapses the slot). */
function useThumbnail(route: Route): 'photo' | 'map' | null {
  const photo = route?.images?.find((u) => typeof u === 'string' && u.length > 0);
  if (photo) return 'photo';
  const path = route?.path;
  if (Array.isArray(path) && path.filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])).length >= 2) return 'map';
  return null;
}

export default function RouteCard(props: RouteCardProps) {
  const {
    variant = 'compact', route, activity, isActive = false,
    displayKm, laps = 1, topBadge, shapeTag, accessLabel, recommended,
    highlight, userLocation, ctaLabel = 'התחל אימון', onStart, onSwap, onOpenDetail,
  } = props;

  const stars = scoreToStars(route?.score);
  const displayName = route?.name?.trim() || 'מסלול';
  const km = typeof displayKm === 'number' && displayKm > 0 ? displayKm : (route?.distance ?? 0);
  const distanceText = `${km.toFixed(1)} ק״מ${laps > 1 ? ` · ×${laps}` : ''}`;
  const durationText = route?.duration ? `~${route.duration} דק׳` : '';
  const thumb = useThumbnail(route);
  const photo = route?.images?.find((u) => typeof u === 'string' && u.length > 0);
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

  return (
    <div
      dir="rtl"
      className={`w-[85vw] max-w-[340px] snap-center snap-always flex-shrink-0 bg-white rounded-3xl p-4 transition-all duration-300 ${
        isActive
          ? 'shadow-[0_0_0_2.5px_rgba(0,229,255,0.85),0_14px_32px_rgba(0,0,0,0.18)] scale-[1.02]'
          : 'shadow-[0_10px_28px_rgba(0,0,0,0.14)] opacity-90 scale-[0.97]'
      }`}
    >
      {/* Image slot: photo | route mini-map | (collapsed) */}
      {thumb && (
        <button
          type="button"
          onClick={onOpenDetail}
          className="relative block w-full h-20 rounded-2xl overflow-hidden mb-3 bg-cyan-50/60"
        >
          {thumb === 'photo' && photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className="w-full h-full object-cover" />
          ) : (
            <RoutePolyline path={route.path} stroke={ACCENT} />
          )}
          {recommended && (
            <span className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded-full text-[10px] font-black text-white shadow-sm" style={{ backgroundColor: ACCENT }}>
              מומלץ
            </span>
          )}
          {topBadge && (
            <span className={`absolute top-1.5 left-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black ${topBadge.className ?? 'bg-white/90 text-gray-700'}`}>
              {topBadge.Icon && <topBadge.Icon size={10} strokeWidth={3} />}
              {topBadge.label}
            </span>
          )}
        </button>
      )}

      {/* Top badge / recommended when there is NO thumbnail to host them */}
      {!thumb && (recommended || topBadge) && (
        <div className="flex items-center gap-1.5 mb-2">
          {recommended && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black text-white" style={{ backgroundColor: ACCENT }}>מומלץ</span>
          )}
          {topBadge && (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black ${topBadge.className ?? 'bg-gray-100 text-gray-700'}`}>
              {topBadge.Icon && <topBadge.Icon size={10} strokeWidth={3} />}
              {topBadge.label}
            </span>
          )}
        </div>
      )}

      {/* Title row */}
      <div className="flex items-start gap-2 mb-1">
        <span className="w-9 h-9 rounded-2xl flex items-center justify-center text-xl shrink-0" style={{ backgroundColor: `${ACCENT}1A` }} aria-hidden>
          {activityEmoji(activity)}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="text-[15px] font-black text-gray-900 truncate leading-tight flex-1 min-w-0">{displayName}</h3>
            {shape && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600 shrink-0">
                <shape.Icon size={10} strokeWidth={2.5} />
                {shape.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5 mt-0.5">
            {[1, 2, 3].map((i) => (
              <Star key={i} size={11} fill={i <= stars ? ACCENT : 'transparent'} className={i <= stars ? '' : 'text-gray-300'} style={i <= stars ? { color: ACCENT } : undefined} />
            ))}
          </div>
        </div>
      </div>

      {/* Access label + highlight + distance-from-you */}
      {(accessLabel || highlight || distFromYou) && (
        <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-2 mb-3">
          {accessLabel && <span className="text-[12px] font-bold" style={{ color: ACCENT }}>{accessLabel}</span>}
          {highlight && <span className="text-[12px] text-gray-600 leading-snug">{highlight}</span>}
          {distFromYou && <span className="text-[11px] text-gray-400 font-bold">{distFromYou} ממך</span>}
        </div>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-1.5">
          <MapPin size={13} style={{ color: ACCENT }} className="shrink-0" />
          <span className="text-[13px] font-black text-gray-800" dir="ltr">{distanceText}</span>
        </div>
        {durationText && (
          <div className="flex items-center gap-1.5">
            <Timer size={13} style={{ color: ACCENT }} className="shrink-0" />
            <span className="text-[13px] font-black text-gray-800" dir="ltr">{durationText}</span>
          </div>
        )}
      </div>

      {/* CTA row: start (+ optional swap "החלף") */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onStart}
          className="flex-1 text-center py-3 rounded-xl text-white text-sm font-black flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
          style={{ backgroundColor: ACCENT }}
        >
          <Play size={14} fill="currentColor" />
          {ctaLabel}
          <ChevronLeft size={14} strokeWidth={3} />
        </button>
        {onSwap && (
          <button
            type="button"
            onClick={onSwap}
            title="החלף"
            aria-label="החלף מסלול"
            className="w-12 h-11 rounded-xl flex items-center justify-center bg-white text-gray-600 shadow-sm active:scale-90 transition-transform shrink-0"
            style={{ border: '0.5px solid #E0E9FF' }}
          >
            <RefreshCw size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
