'use client';

/**
 * IntentRouteCarousel — the intent-first "3 distinct options" carousel.
 *
 * Fed by `buildIntentOptions` (curated official_routes, NOT the generator), it
 * shows one card per access-effort bucket:
 *   here  — "מכאן ועכשיו"  (recommended; loop if curated, else out-and-back)
 *   near  — "שדרוג קרוב"    (X דק' הליכה)
 *   drive — "שווה נסיעה"    (X דק' נסיעה)
 *
 * "החלף" cycles to the next candidate WITHIN the same bucket. Uses the shared
 * RouteCard (compact). Leaves the generator/commute RouteCarousel untouched.
 * Every read is field-guarded.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, ChevronRight, Navigation, MapPin, Car, Pencil, Crosshair } from 'lucide-react';
import type { Route, ActivityType } from '../types/route.types';
import { buildIntentOptions, type IntentBucket, type IntentOption } from '../services/intent-routes.service';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import LocationPickMap from '@/features/parks/client/components/LocationPickMap';
import RouteCard, { type RouteCardBadge } from './RouteCard';

const ACCENT = '#00ADEF';
const BUCKET_ORDER: IntentBucket[] = ['here', 'near', 'drive'];

const BUCKET_META: Record<IntentBucket, { badge: RouteCardBadge; recommended: boolean }> = {
  here: { badge: { label: 'מכאן ועכשיו', className: 'bg-cyan-100 text-cyan-700', Icon: Navigation }, recommended: true },
  near: { badge: { label: 'שדרוג קרוב', className: 'bg-emerald-100 text-emerald-700', Icon: MapPin }, recommended: false },
  drive: { badge: { label: 'שווה נסיעה', className: 'bg-violet-100 text-violet-700', Icon: Car }, recommended: false },
};

function accessLabelFor(bucket: IntentBucket, o: IntentOption): string | undefined {
  if (bucket === 'here') return o.shape === 'out_and_back' ? 'מהמיקום שלך' : undefined;
  if (!o.accessMinutes) return undefined;
  return bucket === 'drive' ? `${o.accessMinutes} דק׳ נסיעה` : `${o.accessMinutes} דק׳ הליכה`;
}

interface IntentRouteCarouselProps {
  userPosition: { lat: number; lng: number };
  activity: ActivityType;
  targetKm: number;
  authorityIds?: string[];
  focusedRouteId?: string | null;
  onFocusChange?: (route: Route) => void;
  onBack: () => void;
  onSelect: (route: Route) => void;
}

export default function IntentRouteCarousel({
  userPosition, activity, targetKm, authorityIds,
  onFocusChange, onBack, onSelect,
}: IntentRouteCarouselProps) {
  const [loading, setLoading] = useState(true);
  const [buckets, setBuckets] = useState<Record<IntentBucket, IntentOption[]>>({ here: [], near: [], drive: [] });
  // Per-bucket "החלף" cursor — which candidate of the bucket is currently shown.
  const [swapIdx, setSwapIdx] = useState<Record<IntentBucket, number>>({ here: 0, near: 0, drive: 0 });
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollIdle = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Origin is FROZEN at mount (default = current location). GPS drift must NOT
  // re-trigger buildIntentOptions (Firestore + Mapbox); only an explicit edit
  // via the start-point sheet changes it.
  const [origin, setOrigin] = useState<{ lat: number; lng: number }>(userPosition);
  const [originEdited, setOriginEdited] = useState(false);
  const [editingOrigin, setEditingOrigin] = useState(false);
  const [draftOrigin, setDraftOrigin] = useState<{ lat: number; lng: number }>(userPosition);

  // Build options whenever the intent inputs change. Guard against a stale
  // async resolve overwriting a newer one.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    buildIntentOptions({ origin, targetKm, activity, authorityIds })
      .then((res) => {
        if (!alive) return;
        setBuckets(res);
        setSwapIdx({ here: 0, near: 0, drive: 0 });
        setActiveIndex(0);
        setLoading(false);
      })
      .catch(() => { if (alive) { setBuckets({ here: [], near: [], drive: [] }); setLoading(false); } });
    return () => { alive = false; };
  }, [origin, targetKm, activity, authorityIds]);

  const openOriginEditor = useCallback(() => { setDraftOrigin(origin); setEditingOrigin(true); }, [origin]);
  const confirmOrigin = useCallback(() => {
    // "edited" only when meaningfully away from the live location (~>50m).
    const moved = Math.abs(draftOrigin.lat - userPosition.lat) > 5e-4 || Math.abs(draftOrigin.lng - userPosition.lng) > 5e-4;
    setOrigin(draftOrigin);
    setOriginEdited(moved);
    setEditingOrigin(false);
  }, [draftOrigin, userPosition]);

  // The visible cards: one per non-empty bucket, in access-effort order.
  const cards = BUCKET_ORDER
    .filter((b) => buckets[b].length > 0)
    .map((b) => {
      const list = buckets[b];
      const option = list[swapIdx[b] % list.length];
      return { bucket: b, option, count: list.length };
    });

  // Emit the centered card's route so the parent draws it on the map. Once the
  // options first load, focus the recommended (first) card.
  useEffect(() => {
    if (!loading && cards.length > 0) onFocusChange?.(cards[0].option.route);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const emitFocus = useCallback((idx: number) => {
    const c = cards[idx];
    if (c) onFocusChange?.(c.option.route);
  }, [cards, onFocusChange]);

  // Centered-card detection: nearest card center to the container center.
  const handleScroll = useCallback(() => {
    if (scrollIdle.current) clearTimeout(scrollIdle.current);
    scrollIdle.current = setTimeout(() => {
      const el = scrollRef.current;
      if (!el) return;
      const center = el.scrollLeft + el.clientWidth / 2;
      let best = 0, bestDist = Infinity;
      Array.from(el.children).forEach((child, i) => {
        const c = child as HTMLElement;
        const cc = c.offsetLeft + c.offsetWidth / 2;
        const d = Math.abs(cc - center);
        if (d < bestDist) { bestDist = d; best = i; }
      });
      if (best !== activeIndex) { setActiveIndex(best); emitFocus(best); }
    }, 150);
  }, [activeIndex, emitFocus]);

  const swap = useCallback((bucket: IntentBucket, cardIdx: number) => {
    setSwapIdx((prev) => {
      const next = { ...prev, [bucket]: (prev[bucket] + 1) };
      return next;
    });
    // Re-emit focus for the freshly swapped card if it's the active one.
    if (cardIdx === activeIndex) {
      const list = buckets[bucket];
      const nextOpt = list[(swapIdx[bucket] + 1) % list.length];
      if (nextOpt) onFocusChange?.(nextOpt.route);
    }
  }, [activeIndex, buckets, swapIdx, onFocusChange]);

  const start = useCallback((o: IntentOption) => {
    // Stage the ×N loop repeat (Phase 0) — cleared for non-loop / single options.
    useRunningPlayer.getState().setPendingLoopLaps(o.laps > 1 ? o.laps : null);
    onSelect(o.route);
  }, [onSelect]);

  return (
    // Same tier + placement as RouteCarousel (z-[60], bottom, safe-area aware)
    // so the one-card map law + z-index budget hold.
    <div className="fixed inset-0 z-[60] pointer-events-none" dir="rtl">
      <div
        className="absolute bottom-0 left-0 right-0 pointer-events-none"
        style={{ paddingBottom: 'calc(max(85px, env(safe-area-inset-bottom, 0px) + 75px))' }}
      >
      {/* Back / header */}
      <div className="px-4 pb-2 flex items-center justify-between pointer-events-auto">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 bg-white/90 backdrop-blur text-gray-700 text-[13px] font-bold px-3 py-1.5 rounded-full shadow-sm active:scale-95 transition-transform"
        >
          <ChevronRight size={15} /> חזרה
        </button>
        <div className="flex items-center gap-1.5">
          {/* Editable start point — default = current location, light secondary edit. */}
          <button
            type="button"
            onClick={openOriginEditor}
            className={`flex items-center gap-1 backdrop-blur text-[12px] font-bold px-3 py-1.5 rounded-full shadow-sm active:scale-95 transition-transform ${
              originEdited ? 'bg-cyan-100/90 text-cyan-700' : 'bg-white/90 text-gray-600'
            }`}
          >
            <MapPin size={12} />
            {originEdited ? 'מיקום מותאם' : 'מהמיקום שלי'}
            <Pencil size={11} />
          </button>
          <span className="bg-white/90 backdrop-blur text-gray-500 text-[12px] font-bold px-3 py-1.5 rounded-full shadow-sm">
            {targetKm.toFixed(1)} ק״מ{!loading && cards.length > 0 ? ` · ${cards.length} אפשרויות` : ''}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="mx-4 mb-4 bg-white rounded-3xl p-8 flex flex-col items-center gap-3 shadow-lg pointer-events-auto">
          <Loader2 className="w-7 h-7 animate-spin" style={{ color: ACCENT }} />
          <span className="text-sm text-gray-500 font-bold">בונה אפשרויות מסלול…</span>
        </div>
      ) : cards.length === 0 ? (
        <div className="mx-4 mb-4 bg-white rounded-3xl p-6 text-center shadow-lg pointer-events-auto">
          <p className="text-sm font-bold text-gray-700">לא נמצאו מסלולים מתאימים כאן</p>
          <p className="text-xs text-gray-400 mt-1">נסה מרחק אחר או נקודת התחלה אחרת</p>
        </div>
      ) : (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="w-full overflow-x-auto snap-x snap-mandatory flex flex-row-reverse gap-3 pb-3 pt-1 scrollbar-hide pointer-events-auto"
          style={{ paddingInlineStart: '16px', paddingInlineEnd: '40px', scrollBehavior: 'smooth' }}
        >
          {cards.map(({ bucket, option, count }, idx) => {
            const meta = BUCKET_META[bucket];
            return (
              <RouteCard
                key={`${bucket}-${option.route.id}`}
                variant="compact"
                route={option.route}
                activity={activity}
                isActive={idx === activeIndex}
                displayKm={option.effectiveKm}
                laps={option.laps}
                topBadge={meta.badge}
                shapeTag={option.shape}
                accessLabel={accessLabelFor(bucket, option)}
                recommended={meta.recommended}
                userLocation={origin}
                onStart={() => start(option)}
                onSwap={count > 1 ? () => swap(bucket, idx) : undefined}
              />
            );
          })}
        </div>
      )}
      </div>

      {/* Start-point editor — light bottom sheet reusing the shared LocationPickMap. */}
      {editingOrigin && (
        <div className="absolute inset-0 z-[100] pointer-events-auto flex flex-col justify-end" dir="rtl">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditingOrigin(false)} />
          <div className="relative bg-white rounded-t-3xl p-4 pb-6 shadow-2xl" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 12px))' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[15px] font-black text-gray-900">נקודת התחלה</h3>
              <button type="button" onClick={() => setDraftOrigin(userPosition)} className="flex items-center gap-1 text-[12px] font-bold text-cyan-600 active:scale-95 transition-transform">
                <Crosshair size={13} /> המיקום שלי
              </button>
            </div>
            <LocationPickMap value={draftOrigin} onPick={setDraftOrigin} heightClass="h-[220px]" emptyHint="לחצו על המפה לבחירת נקודת התחלה" />
            <div className="flex items-center gap-2 mt-4">
              <button type="button" onClick={confirmOrigin} className="flex-1 py-3 rounded-2xl text-white text-sm font-black active:scale-[0.98] transition-transform" style={{ backgroundColor: ACCENT }}>
                אישור
              </button>
              <button type="button" onClick={() => setEditingOrigin(false)} className="px-5 py-3 rounded-2xl text-sm font-bold bg-gray-100 text-gray-600 active:scale-95 transition-transform">
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
