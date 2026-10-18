"use client";

/**
 * SearchPickCards — what the v2 map search shows AFTER a pick
 * (enable_home_v2 only; DiscoverLayer mounts these, flag off never does).
 *
 *   • SearchDestinationCard — an address / street / place pick. Bottom sheet
 *     in the FreeRunDrawer v2 look: title, place + straight-line distance,
 *     rough ETA chips, action tiles (ריצה לכאן / הליכה לכאן / שמור מקום),
 *     official routes passing nearby, and the one CTA "נווט לכאן".
 *   • SearchRouteCard — an official-route pick: stats, actions (נווט להתחלה /
 *     פרטים) and the CTA "התחל … במסלול".
 *
 * Both are presentational: every action is a callback the host wires to an
 * EXISTING flow (commute A→B cards, free-run drawer with a destination, the
 * route workout start, RouteDetailSheet). The only write is "שמור מקום",
 * which goes through useSavedPlacesStore.setPlace — the same local Home/Work
 * slot SetSavedPlaceSheet writes.
 */

import React, { useEffect, useState } from 'react';
import { motion, useDragControls } from 'framer-motion';
import {
  X,
  Navigation,
  Bookmark,
  Check,
  Home,
  Briefcase,
  ChevronLeft,
  Play,
  Info,
  Star,
  Route as RouteIcon,
  Footprints,
} from 'lucide-react';
import type { Route } from '../types/route.types';
import type { GeoPlaceType } from '../services/geocode-place-type';
import { PLACE_TYPE_LABEL, splitGeoLabel } from '../services/geocode-place-type';
import {
  distanceKmTo,
  formatDistanceKm,
  estimateMinutes,
  formatEta,
  stripCountry,
} from '../services/search-groups';
import { findOfficialRoutesNear } from '../hooks/useSearchNavigation';
import { suggestionIcon, SEARCH_TONE_CLASS } from './SearchOverlayV2';
import {
  useSavedPlacesStore,
  SAVED_PLACE_KIND_LABEL,
  type SavedPlaceKind,
} from '@/features/user/places/store/useSavedPlacesStore';

const SHEET = 'bg-white rounded-t-[28px] shadow-v2-sheet';
const HANDLE = 'h-1.5 w-10 rounded-full bg-v2-pill-border';
const CLOSE =
  'grid h-9 w-9 shrink-0 place-items-center rounded-full bg-v2-surface ring-1 ring-inset ring-v2-hairline active:scale-[0.97] transition-transform duration-150 ease-v2';
const CTA =
  'w-full h-12 flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-v2-cta text-[16px] font-extrabold text-v2-on-cta shadow-v2-cta active:scale-[0.97] transition-transform duration-150 ease-v2';
const PRESS = 'active:scale-[0.97] transition-transform duration-150 ease-v2';

/** Running-shoe / walking icons in the activity colours (cardio / walk). */
const RUN_TONE = 'bg-[#eef7df] text-[#65a30d]';
const WALK_TONE = 'bg-[#fff4e0] text-[#b45309]';

function RunIcon({ size = 18 }: { size?: number }) {
  // lucide has no runner glyph in this version — same path as the mockup.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="14" cy="4" r="2" />
      <path d="m6 21 3-5 3 2 1-6 3 3h3" />
      <path d="M9 11 10.5 7.5 15 8l-2 4" />
      <path d="M6 12l2-3" />
    </svg>
  );
}

function PickSheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const dragControls = useDragControls();
  return (
    <motion.div
      drag="y"
      dragControls={dragControls}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={0.25}
      onDragEnd={(_, info) => {
        if (info.offset.y > 80 || info.velocity.y > 300) onClose();
      }}
      initial={{ y: 400 }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 300 }}
      className="fixed bottom-0 left-0 right-0 z-[100]"
    >
      <div
        className={`${SHEET} mx-auto max-h-[85dvh] max-w-md overflow-y-auto overscroll-contain px-5`}
        dir="rtl"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
      >
        <div
          className="flex cursor-grab justify-center pb-2 pt-3 active:cursor-grabbing"
          onPointerDown={(e) => dragControls.start(e)}
          style={{ touchAction: 'none' }}
        >
          <div className={HANDLE} />
        </div>
        {children}
      </div>
    </motion.div>
  );
}

function ActionTile({
  icon,
  tone,
  label,
  onClick,
  active = false,
}: {
  icon: React.ReactNode;
  tone: string;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-[18px] px-1 py-2.5 ${PRESS} ${
        active ? 'bg-white shadow-v2-card ring-2 ring-v2-accent' : 'bg-white shadow-v2-ring'
      }`}
    >
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-[12px] ${tone}`}>{icon}</span>
      <span className="whitespace-nowrap text-[12px] font-extrabold text-v2-ink">{label}</span>
    </button>
  );
}

// ── Destination (address / street / place) ───────────────────────────────────

export interface SearchDestinationPick {
  text: string;
  coords: [number, number];
  placeType?: GeoPlaceType;
}

export function SearchDestinationCard({
  place,
  userPos,
  onClose,
  onNavigate,
  onStartActivity,
  onOpenRoute,
}: {
  place: SearchDestinationPick;
  userPos?: { lat: number; lng: number } | null;
  onClose: () => void;
  /** CTA → today's A→B route cards (commute). */
  onNavigate: () => void;
  /** Tile → the free-run drawer with this place as its destination. */
  onStartActivity: (mode: 'running' | 'walking') => void;
  onOpenRoute: (route: Route) => void;
}) {
  const { primary, rest } = splitGeoLabel(place.text);
  const city = stripCountry(rest);
  const km = distanceKmTo(userPos, place.coords);
  const { Icon } = suggestionIcon({ _source: 'mapbox', placeType: place.placeType });
  const typeLabel = place.placeType ? PLACE_TYPE_LABEL[place.placeType] : 'מיקום';
  const sub = [city, km != null ? `${formatDistanceKm(km)} ממך` : ''].filter(Boolean).join(' · ');

  // Official routes passing near the place (read-only, cached list).
  const [nearRoutes, setNearRoutes] = useState<Route[]>([]);
  const [lng, lat] = place.coords;
  useEffect(() => {
    let cancelled = false;
    setNearRoutes([]);
    findOfficialRoutesNear(lat, lng, 1)
      .then((r) => { if (!cancelled) setNearRoutes(r); })
      .catch(() => { /* row just stays hidden */ });
    return () => { cancelled = true; };
  }, [lat, lng]);

  // Save → pick a slot (Home / Work), written to the same local store
  // SetSavedPlaceSheet uses.
  const places = useSavedPlacesStore((s) => s.places);
  const setPlace = useSavedPlacesStore((s) => s.setPlace);
  const [saveOpen, setSaveOpen] = useState(false);
  const [savedAs, setSavedAs] = useState<SavedPlaceKind | null>(null);
  const isSlot = (k: SavedPlaceKind) => {
    const p = places[k];
    return !!p && p.coords[0] === place.coords[0] && p.coords[1] === place.coords[1];
  };
  const alreadySaved: SavedPlaceKind | null = savedAs ?? (isSlot('home') ? 'home' : isSlot('work') ? 'work' : null);
  const saveAs = (kind: SavedPlaceKind) => {
    setPlace({
      kind,
      label: SAVED_PLACE_KIND_LABEL[kind],
      coords: place.coords,
      address: place.text,
      updatedAt: Date.now(),
    });
    setSavedAs(kind);
    setSaveOpen(false);
  };

  return (
    <PickSheet onClose={onClose}>
      <div className="flex items-start gap-3">
        <span className={`grid h-[46px] w-[46px] shrink-0 place-items-center rounded-[16px] ${SEARCH_TONE_CLASS.geo}`}>
          <Icon size={22} strokeWidth={2.3} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="whitespace-nowrap text-[12.5px] font-extrabold text-v2-deep">{typeLabel}</div>
          <div className="truncate whitespace-nowrap text-[22px] font-black !tracking-[-0.02em] text-v2-ink">{primary}</div>
          {sub && <div className="truncate whitespace-nowrap text-[12.5px] font-bold text-v2-muted">{sub}</div>}
        </div>
        <button type="button" onClick={onClose} aria-label="סגור" className={CLOSE}>
          <X size={16} strokeWidth={2.4} className="text-v2-ink-2" />
        </button>
      </div>

      {km != null && (
        <div className="mt-3 flex gap-2">
          <span className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12px] font-extrabold ${RUN_TONE}`}>
            <RunIcon size={13} /> ריצה {formatEta(estimateMinutes(km, 'running'))}
          </span>
          <span className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12px] font-extrabold ${WALK_TONE}`}>
            <Footprints size={13} strokeWidth={2.5} /> הליכה {formatEta(estimateMinutes(km, 'walking'))}
          </span>
        </div>
      )}

      <div className="mt-3.5 flex gap-2">
        <ActionTile icon={<RunIcon />} tone={RUN_TONE} label="ריצה לכאן" onClick={() => onStartActivity('running')} />
        <ActionTile icon={<Footprints size={18} strokeWidth={2.3} />} tone={WALK_TONE} label="הליכה לכאן" onClick={() => onStartActivity('walking')} />
        <ActionTile
          icon={alreadySaved ? <Check size={18} strokeWidth={2.6} /> : <Bookmark size={18} strokeWidth={2.3} />}
          tone="bg-v2-tint text-v2-deep"
          label={alreadySaved ? `נשמר כ${SAVED_PLACE_KIND_LABEL[alreadySaved]}` : 'שמור מקום'}
          active={saveOpen}
          onClick={() => setSaveOpen((o) => !o)}
        />
      </div>

      {saveOpen && (
        <div className="mt-2.5 flex gap-2">
          {(['home', 'work'] as const).map((kind) => {
            const KindIcon = kind === 'home' ? Home : Briefcase;
            const replacing = !!places[kind] && !isSlot(kind);
            return (
              <button
                key={kind}
                type="button"
                onClick={() => saveAs(kind)}
                className={`flex h-11 min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-white text-[14px] font-extrabold text-v2-ink shadow-v2-ring ${PRESS}`}
              >
                <KindIcon size={16} strokeWidth={2.4} className="text-v2-deep" />
                {replacing ? `החלף ${SAVED_PLACE_KIND_LABEL[kind]}` : `שמור כ${SAVED_PLACE_KIND_LABEL[kind]}`}
              </button>
            );
          })}
        </div>
      )}

      {nearRoutes.length > 0 && (
        <button
          type="button"
          onClick={() => onOpenRoute(nearRoutes[0])}
          className={`mt-3 flex w-full items-center gap-2.5 rounded-[18px] bg-v2-surface px-3 py-2.5 text-start ring-1 ring-inset ring-v2-hairline ${PRESS}`}
        >
          <span className={`grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[12px] ${SEARCH_TONE_CLASS.route}`}>
            <RouteIcon size={17} strokeWidth={2.3} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block whitespace-nowrap text-[13.5px] font-black text-v2-ink">
              {nearRoutes.length === 1 ? 'מסלול עובר ליד' : `${nearRoutes.length} מסלולים עוברים ליד`}
            </span>
            <span className="block truncate whitespace-nowrap text-[12px] font-bold text-v2-muted">
              {nearRoutes.map((r) => r.name).join(' · ')}
            </span>
          </span>
          <ChevronLeft size={16} strokeWidth={2.4} className="shrink-0 text-v2-muted" />
        </button>
      )}

      <div className="mt-3.5">
        <button type="button" onClick={onNavigate} className={CTA}>
          <Navigation size={17} strokeWidth={2.6} /> נווט לכאן
        </button>
      </div>
    </PickSheet>
  );
}

// ── Official route ───────────────────────────────────────────────────────────

const ACTIVITY_WORD: Record<string, { label: string; cta: string }> = {
  walking: { label: 'הליכה', cta: 'התחל הליכה במסלול' },
  cycling: { label: 'רכיבה', cta: 'התחל רכיבה במסלול' },
  running: { label: 'ריצה', cta: 'התחל ריצה במסלול' },
};

export function SearchRouteCard({
  route,
  userPos,
  onClose,
  onStart,
  onNavigateToStart,
  onDetails,
}: {
  route: Route;
  userPos?: { lat: number; lng: number } | null;
  onClose: () => void;
  /** CTA → the existing route workout start (RouteDetailSheet's onStartWorkout). */
  onStart: () => void;
  /** → today's A→B route cards to the route's first point. */
  onNavigateToStart: () => void;
  /** → the full RouteDetailSheet. */
  onDetails: () => void;
}) {
  const act = ACTIVITY_WORD[route.activityType ?? route.type] ?? ACTIVITY_WORD.running;
  const start = Array.isArray(route.path) && route.path.length > 0 ? (route.path[0] as [number, number]) : null;
  const startKm = start ? distanceKmTo(userPos, start) : null;
  const rating = typeof route.rating === 'number' && route.rating > 0 ? route.rating : null;
  const stats: Array<{ value: string; label: string }> = [];
  if (route.distance > 0) stats.push({ value: `${(Math.round(route.distance * 10) / 10).toFixed(1)} ק״מ`, label: 'אורך' });
  if (route.duration > 0) stats.push({ value: `~${Math.round(route.duration)} דק׳`, label: `ב${act.label}` });
  if (typeof route.elevationGain === 'number' && route.elevationGain > 0) stats.push({ value: `+${Math.round(route.elevationGain)} מ׳`, label: 'עלייה' });

  return (
    <PickSheet onClose={onClose}>
      <div className="flex items-start gap-3">
        <span className={`grid h-[46px] w-[46px] shrink-0 place-items-center rounded-[16px] ${SEARCH_TONE_CLASS.route}`}>
          <RouteIcon size={22} strokeWidth={2.3} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="whitespace-nowrap text-[12.5px] font-extrabold text-[#ea580c]">מסלול · {act.label}</div>
          <div className="truncate whitespace-nowrap text-[22px] font-black !tracking-[-0.02em] text-v2-ink">{route.name}</div>
          {(rating != null || startKm != null) && (
            <div className="flex items-center gap-1 whitespace-nowrap text-[12.5px] font-bold text-v2-muted">
              {rating != null && <><Star size={12} strokeWidth={2.2} className="text-v2-amber" /> {rating.toFixed(1)}</>}
              {rating != null && startKm != null && <span>·</span>}
              {startKm != null && <span>ההתחלה {formatDistanceKm(startKm)} ממך</span>}
            </div>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="סגור" className={CLOSE}>
          <X size={16} strokeWidth={2.4} className="text-v2-ink-2" />
        </button>
      </div>

      {stats.length > 0 && (
        <div className="mt-3 flex gap-2">
          {stats.map((s) => (
            <div key={s.label} className="min-w-0 flex-1 rounded-[16px] bg-v2-surface px-2.5 py-2 ring-1 ring-inset ring-v2-hairline">
              <div className="whitespace-nowrap text-[16px] font-black text-v2-ink">{s.value}</div>
              <div className="whitespace-nowrap text-[11px] font-bold text-v2-muted">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3.5 flex gap-2">
        {start && (
          <ActionTile icon={<Navigation size={18} strokeWidth={2.3} />} tone="bg-v2-tint text-v2-deep" label="נווט להתחלה" onClick={onNavigateToStart} />
        )}
        <ActionTile icon={<Info size={18} strokeWidth={2.3} />} tone="bg-v2-tint text-v2-deep" label="פרטי המסלול" onClick={onDetails} />
      </div>

      <div className="mt-3.5">
        <button type="button" onClick={onStart} className={CTA}>
          <Play size={16} strokeWidth={2.6} fill="currentColor" /> {act.cta}
        </button>
      </div>
    </PickSheet>
  );
}
