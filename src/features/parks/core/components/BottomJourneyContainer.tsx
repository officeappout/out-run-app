"use client";

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { Play, Timer, Car, MapPin, ChevronLeft, Zap, Bike, Dumbbell, Navigation, Users } from 'lucide-react';
import { Route, ActivityType } from '../types/route.types';
import { useMapStore } from '../store/useMapStore';
import Image from 'next/image';
import RouteCardUnified from './RouteCardUnified';
import RouteQualityBadges from './RouteQualityBadges';
import { UNIFIED_ROUTE_CARDS_ENABLED } from '@/config/feature-flags';
import { bunnyImg } from '@/lib/bunny-image';
import { computeStartExperienceState, estimateWalkMinutesFromKm } from '../services/start-experience-state';
import { useToast } from '@/components/ui/Toast';
import { clampedScrollTarget, registerCorrection, type CorrectionPair } from './carousel-scroll-sync.util';

// How many cards on either side of the centered one get a real cover photo
// mounted (SPEC-05 image-memory #2). This carousel is an unvirtualized
// horizontal scroller — every route in the list gets a DOM node regardless
// of scroll position, and native `loading="lazy"` doesn't reliably defer
// images clipped by a scrollable ANCESTOR's overflow (it's tuned for
// vertical page scroll, not a horizontally-clipped strip), so a long route
// list would otherwise mount a full-resolution photo per card, all at once.
// Cards outside the window fall back to the existing activity-icon
// placeholder — the same UI already shown for a route with no cover photo
// at all — until they scroll back into it.
const COVER_PHOTO_WINDOW = 2;

function formatSessionTime(isoString: string): string {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return 'מועד קרוב';
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (isToday) return `היום ${time}`;
  if (isTomorrow) return `מחר ${time}`;
  return `${date.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })} ${time}`;
}

function ParticipantAvatars({ avatars }: { avatars: { uid: string; name: string; photoURL?: string }[] }) {
  if (avatars.length === 0) return null;
  return (
    <div className="flex -space-x-2 rtl:space-x-reverse">
      {avatars.slice(0, 3).map((a) => (
        <div
          key={a.uid}
          className="w-5 h-5 rounded-full border-2 border-white bg-cyan-100 flex items-center justify-center text-[8px] font-black text-cyan-700 overflow-hidden"
          title={a.name}
        >
          {a.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.photoURL} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
          ) : (
            a.name.charAt(0)
          )}
        </div>
      ))}
    </div>
  );
}

// ── Activity icon for the no-image placeholder ──────────────────────
function ActivityIcon({ type, size = 32 }: { type?: ActivityType | string; size?: number }) {
  switch (type) {
    case 'running':  return <Zap size={size} className="text-[#00E5FF]" />;
    case 'cycling':  return <Bike size={size} className="text-[#00E5FF]" />;
    case 'workout':  return <Dumbbell size={size} className="text-[#00E5FF]" />;
    case 'walking':
    default:         return <Navigation size={size} className="text-[#00E5FF]" />;
  }
}

interface BottomJourneyContainerProps {
  routes: Route[];
  onRouteFocus?: (route: Route) => void;
  focusedRouteId?: string | null;
  onStartWorkout?: () => void;
  onShowDetails?: () => void;
  /** Opens the full RouteDetailSheet for a route */
  onShowRouteDetail?: (route: Route) => void;
  loadingRouteIds?: Set<string>;
  /**
   * Start-experience state map (11.10.2026): live GPS position, used to
   * classify each card as at-start/on-route/off-route-walkable/off-route-
   * too-far. Optional — omitted (or null), every card falls back to
   * 'on_route' (no gate), the SAME byte-identical "just start" behavior as
   * before this prop existed. Never a reason a working start gets blocked.
   */
  userPosition?: { lat: number; lng: number } | null;
}

export default function BottomJourneyContainer({
  routes,
  onRouteFocus,
  focusedRouteId,
  onStartWorkout,
  onShowDetails,
  onShowRouteDetail,
  loadingRouteIds,
  userPosition = null,
}: BottomJourneyContainerProps) {
  const [activeRouteIndex, setActiveRouteIndex] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  // Walk-time from useWalkToRoute (synced via useMapStore — no prop drilling needed).
  // Real for the currently-focused route only — see estimateWalkMinutesFromKm's
  // own doc comment for the non-focused-card fallback.
  const walkToRouteMinutes = useMapStore((s) => s.walkToRouteMinutes);

  // ── Scroll-engine refs (mirrors RouteCarousel "no-jitter" contract) ──────
  // last route id we emitted to the parent — prevents echo loops when the
  // parent re-passes the same id back via `focusedRouteId`.
  const lastEmittedRouteIdRef = useRef<string | null>(null);
  // True while a programmatic smooth-scroll is in flight; suppresses
  // the debounced onRouteFocus emit so a map-tap doesn't echo back.
  const isProgrammaticScrollRef = useRef(false);
  // Debounce timer for the scroll-idle focus emit.
  const scrollIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // rAF handle for the scroll-settle poll (see waitForScrollSettle below).
  const scrollSettleRafRef = useRef<number | null>(null);

  // ── Helper: which card is currently centred? ─────────────────────────────
  // Reads each card's actual offsetLeft from the DOM rather than a derived
  // containerWidth × 0.85 formula. This is correct even when max-w-[340px]
  // clips the card width on tablet-sized viewports — the derived formula
  // was the root cause of "snap drifts off the second card" on wide screens.
  // In flex-row-reverse with dir="ltr": DOM child 0 = routes[0] = rightmost.
  // The routes array index equals the DOM child index directly.
  //
  // Compares the CLAMPED per-card target (clampedScrollTarget — same
  // formula scrollCardToCentre uses) against the real scrollLeft, not a raw
  // geometric "card center vs viewport center" — for an interior card this
  // is algebraically identical to the old formula (the clamp is a no-op),
  // but for an EDGE card whose ideal center is unreachable, both functions
  // now agree that "scrolled all the way to the edge" IS that edge card
  // being centered, instead of one side wanting the true center and the
  // other reading back whatever the clamped scrollLeft actually produced.
  const findCenteredIndex = useCallback((): number => {
    const container = carouselRef.current;
    if (!container) return -1;
    const cards = Array.from(container.children) as HTMLElement[];
    if (cards.length === 0) return -1;
    const scrollLeft = container.scrollLeft;
    let closestIdx = 0;
    let minDist = Infinity;
    cards.forEach((card, i) => {
      const target = clampedScrollTarget(container, card);
      const dist = Math.abs(target - scrollLeft);
      if (dist < minDist) { minDist = dist; closestIdx = i; }
    });
    return closestIdx;
  }, []);

  // ── Helper: wait for a scroll to actually settle (not a fixed timer) ─────
  // rAF-polls scrollLeft until it hasn't moved for STABLE_FRAMES_NEEDED
  // consecutive frames, then fires onSettled. Covers the case a fixed
  // timer can't: if the target was unreachable (clamped), scrollLeft never
  // moves at all and this resolves almost immediately; if the animation
  // genuinely takes longer than expected, this waits for the REAL end
  // instead of guessing a duration. MAX_WAIT_MS is a safety backstop so a
  // pathological case (something external keeps nudging scrollLeft) can
  // never suppress handleScroll's read-back forever.
  const waitForScrollSettle = useCallback((onSettled: () => void) => {
    const container = carouselRef.current;
    if (!container) { onSettled(); return; }
    const STABLE_FRAMES_NEEDED = 3;
    const MAX_WAIT_MS = 2000;
    const startTime = Date.now();
    let lastLeft = container.scrollLeft;
    let stableFrames = 0;
    const tick = () => {
      const c = carouselRef.current;
      if (!c) { onSettled(); return; }
      if (Date.now() - startTime > MAX_WAIT_MS) { onSettled(); return; }
      if (c.scrollLeft === lastLeft) {
        stableFrames += 1;
        if (stableFrames >= STABLE_FRAMES_NEEDED) { onSettled(); return; }
      } else {
        stableFrames = 0;
        lastLeft = c.scrollLeft;
      }
      scrollSettleRafRef.current = requestAnimationFrame(tick);
    };
    scrollSettleRafRef.current = requestAnimationFrame(tick);
  }, []);

  // ── Helper: scroll a card to centre programmatically ─────────────────────
  // Clamps to the container's REAL scrollable range (clampedScrollTarget)
  // instead of asking for a geometric center that may be unreachable, and
  // keeps isProgrammaticScrollRef true until the scroll genuinely settles
  // (waitForScrollSettle) rather than a fixed 600ms guess — so an explicit
  // external focus (e.g. a map-marker tap) is never overridden by
  // handleScroll's read-back before the programmatic scroll has actually
  // finished (or, for an edge card, never started moving at all).
  const scrollCardToCentre = useCallback((domIdx: number) => {
    const container = carouselRef.current;
    if (!container) return;
    const card = container.children[domIdx] as HTMLElement | undefined;
    if (!card) return;
    if (scrollSettleRafRef.current != null) {
      cancelAnimationFrame(scrollSettleRafRef.current);
      scrollSettleRafRef.current = null;
    }
    isProgrammaticScrollRef.current = true;
    container.scrollTo({ left: clampedScrollTarget(container, card), behavior: 'smooth' });
    waitForScrollSettle(() => { isProgrammaticScrollRef.current = false; });
  }, [waitForScrollSettle]);

  // ── Backstop: bounded correction-retry guard (MANDATORY) ─────────────────
  // Last line of defense against React's "Maximum update depth exceeded"
  // (error #185) — confirmed live, 12.10.2026: a route-marker tap could
  // trip the map error boundary via an unbounded external-focus ↔
  // read-back-refocus cycle between the SAME two routes. Fixes 1+2 above
  // target the actual geometric mismatch that cycle depends on, but this
  // guard GUARANTEES the limit can never be hit again even if some other,
  // not-yet-seen mismatch produces the same shape of cycle: once the SAME
  // unordered pair of route ids has corrected back and forth more than
  // MAX_CORRECTIONS_PER_PAIR times in a row, stop re-emitting and warn
  // instead of continuing. Resets whenever a genuinely different pair is
  // involved, or on real user interaction (handleManualInteractionStart).
  // The pure counting logic lives in carousel-scroll-sync.util.ts
  // (registerCorrection) so it's directly unit-testable; this callback only
  // threads the ref state through it and owns the one side effect (the
  // warning log).
  const MAX_CORRECTIONS_PER_PAIR = 3;
  const correctionPairRef = useRef<CorrectionPair | null>(null);
  const checkCorrectionAllowed = useCallback((fromId: string | null, toId: string): boolean => {
    const { allowed, pair } = registerCorrection(correctionPairRef.current, fromId, toId, MAX_CORRECTIONS_PER_PAIR);
    correctionPairRef.current = pair;
    if (!allowed) {
      console.warn(
        `[BottomJourneyContainer] Bounded-retry guard: stopped after ${MAX_CORRECTIONS_PER_PAIR} corrections between routes "${pair?.a}" <-> "${pair?.b}" — likely an edge-card scroll mismatch. Not re-emitting further.`,
      );
    }
    return allowed;
  }, []);

  // ── External focus → scroll the matching card into centre ────────────────
  // Fires when the parent pushes a new focusedRouteId (e.g. a map-tap on a
  // route polyline). Echo-guard prevents a loop: if the id matches what we
  // last emitted, the parent is just reflecting our own value back.
  useEffect(() => {
    if (!focusedRouteId || routes.length === 0) return;
    if (focusedRouteId === lastEmittedRouteIdRef.current) return;
    const index = routes.findIndex(r => r.id === focusedRouteId);
    if (index === -1) return;
    lastEmittedRouteIdRef.current = focusedRouteId;
    if (index !== activeRouteIndex) setActiveRouteIndex(index);
    scrollCardToCentre(index);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedRouteId, routes]);

  // ── Scroll handler — debounced 150 ms after the last scroll event ────────
  // Same timing as RouteCarousel (Spotify/Instagram scroll-end pattern):
  // emit fires once at the destination, not N times during a fast flick.
  const handleScroll = useCallback(() => {
    const idx = findCenteredIndex();
    if (idx < 0) return;
    if (idx !== activeRouteIndex) setActiveRouteIndex(idx);

    if (scrollIdleTimerRef.current) clearTimeout(scrollIdleTimerRef.current);
    scrollIdleTimerRef.current = setTimeout(() => {
      scrollIdleTimerRef.current = null;
      if (isProgrammaticScrollRef.current) return; // triggered by map-tap, not user
      const route = routes[idx];
      if (!route) return;
      if (route.id === lastEmittedRouteIdRef.current) return; // no echo
      if (!checkCorrectionAllowed(lastEmittedRouteIdRef.current, route.id)) return; // bounded-retry backstop
      lastEmittedRouteIdRef.current = route.id;
      if (onRouteFocus) onRouteFocus(route);
    }, 150);
  }, [activeRouteIndex, findCenteredIndex, routes, onRouteFocus, checkCorrectionAllowed]);

  // Drop the programmatic-scroll lockout the instant the user touches the
  // carousel so a swipe that interrupts an in-flight smooth-scroll wins —
  // and cancel any pending settle-poll + reset the correction backstop,
  // since a real user gesture is always trusted over either mechanism.
  const handleManualInteractionStart = useCallback(() => {
    isProgrammaticScrollRef.current = false;
    if (scrollSettleRafRef.current != null) {
      cancelAnimationFrame(scrollSettleRafRef.current);
      scrollSettleRafRef.current = null;
    }
    correctionPairRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (scrollIdleTimerRef.current) clearTimeout(scrollIdleTimerRef.current);
      if (scrollSettleRafRef.current != null) cancelAnimationFrame(scrollSettleRafRef.current);
    };
  }, []);

  // ── Initial scroll — show routes[0] on the RIGHT (RTL UX) ───────────────
  // DOM child 0 = routes[0] = rightmost card in flex-row-reverse.
  // We read its actual offsetLeft so the jump is pixel-perfect regardless
  // of max-w-[340px] clipping on tablet/desktop viewports.
  useLayoutEffect(() => {
    const container = carouselRef.current;
    if (!container || routes.length === 0) return;
    const firstCard = container.children[0] as HTMLElement | undefined;
    if (!firstCard) return;
    if (Math.abs(container.scrollLeft) < 10) {
      container.scrollLeft =
        firstCard.offsetLeft + firstCard.offsetWidth / 2 - container.offsetWidth / 2;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes.length]);

  // Inject scrollbar-hide style once
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `.scrollbar-hide::-webkit-scrollbar{display:none}.scrollbar-hide{-ms-overflow-style:none;scrollbar-width:none}`;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  if (routes.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none">
      <div className="pointer-events-auto" style={{ paddingBottom: 'calc(max(85px, env(safe-area-inset-bottom, 0px) + 75px))' }}>
        <div
          ref={carouselRef}
          dir="ltr"
          onScroll={handleScroll}
          onTouchStart={handleManualInteractionStart}
          onPointerDown={handleManualInteractionStart}
          onWheel={handleManualInteractionStart}
          className="w-full overflow-x-auto snap-x snap-mandatory flex flex-row-reverse gap-3 pb-2 scrollbar-hide"
          style={{ paddingInlineStart: '16px', paddingInlineEnd: '40px', scrollBehavior: 'smooth' }}
        >
          {routes.map((route, index) => {
            const isActive = index === activeRouteIndex;
            const distFromUser   = route.distanceFromUser ?? 0;
            const isReachable    = route.isReachableWithoutCar ?? true;
            // Show the full projected trip (walk-to-start + route + walk-home) when available;
            // fall back to the stored route distance for AI-generated and nav routes.
            const totalDistKm    = route.projectedDistance ?? route.distance ?? 0;
            const isGenerated    = route.id?.startsWith('gen-') || route.id?.startsWith('generated');
            const isLoading      = loadingRouteIds?.has(route.id);
            const durationMin    = Math.round(route.duration || 0);
            // Windowed (see COVER_PHOTO_WINDOW above) — only the cards near
            // the centered one get the real photo; the rest render the
            // existing activity-icon fallback until scrolled into range.
            // bunnyImg is a no-op passthrough for non-Bunny (legacy
            // Firebase Storage) urls — this file's `unoptimized` removal
            // below is what actually resizes those via Next's own
            // optimizer (both hostnames are already in next.config.mjs's
            // remotePatterns).
            const rawCoverImage  = route.images?.[0] || null;
            const coverImage     =
              rawCoverImage && Math.abs(index - activeRouteIndex) <= COVER_PHOTO_WINDOW
                ? bunnyImg(rawCoverImage, 400)
                : null;
            const activityType   = route.activityType || route.type;
            const sourceName     = route.source?.name || (isGenerated ? 'מותאם אישית' : 'מסלול רשמי');

            const isFocused = focusedRouteId === route.id;
            // Start-experience state map (11.10.2026): real Mapbox-fetched
            // walk-minutes for the focused card (useWalkToRoute only computes
            // one route at a time); a distance-based estimate for every other
            // visible card — see estimateWalkMinutesFromKm's own doc comment.
            // isReachableWithoutCar (the OLD gate this replaces) stays
            // UNTOUCHED as a field — route-candidate filtering elsewhere
            // still reads it; only THIS card's CTA decision stops using it.
            const cardWalkMinutes = isFocused && walkToRouteMinutes != null
              ? walkToRouteMinutes
              : estimateWalkMinutesFromKm(distFromUser);
            const startState = computeStartExperienceState(userPosition, route.path, cardWalkMinutes);
            const isTooFar = startState === 'off_route_too_far';
            const blockedReason = isTooFar
              ? `התקרבו למסלול — נותרו עוד כ-${cardWalkMinutes} דק' הליכה`
              : null;
            // Unified text-only card (flag-gated). The CTA + all handlers are
            // passed through unchanged; only the shell/layout is unified.
            if (UNIFIED_ROUTE_CARDS_ENABLED) {
              return (
                <RouteCardUnified
                  key={route.id}
                  name={route.name}
                  distanceText={`${totalDistKm.toFixed(1)} ק״מ`}
                  durationText={`${durationMin} דק׳`}
                  variant="slim"
                  difficulty={route.difficulty}
                  isActive={isActive || isFocused}
                  onClick={() => {
                    if (isFocused) {
                      if (onShowRouteDetail) onShowRouteDetail(route);
                    } else if (onRouteFocus) {
                      onRouteFocus(route);
                    }
                  }}
                  className="snap-center snap-always"
                  ctaLoading={isLoading}
                  extraContent={<RouteQualityBadges qualitySignals={route.qualitySignals} />}
                  ctaBlockedReason={blockedReason}
                  onCtaBlocked={(reason) => showToast('error', reason)}
                  onCta={(e) => {
                    e.stopPropagation();
                    if (onRouteFocus) onRouteFocus(route);
                    // "On route, not at start" -> start from current point,
                    // no navigate-to-official-start prompt (the old !isReachable
                    // branch used to open Waze here instead of starting).
                    // "Off route, walkable" -> also starts directly; the
                    // already-existing useWalkToRoute dotted-guide persists
                    // through the walk once the session is active.
                    if (isGenerated && onShowDetails) {
                      onShowDetails();
                    } else if (onStartWorkout) {
                      onStartWorkout();
                    }
                  }}
                  ctaContent={
                    <>
                      <Play size={14} fill="currentColor" />
                      {isTooFar ? `עוד כ-${cardWalkMinutes} דק' הליכה` : 'צא לדרך'}
                      <ChevronLeft size={14} />
                    </>
                  }
                />
              );
            }

            return (
              <div
                key={route.id}
                onClick={() => {
                  // Two-step: 1st tap on a non-focused card → just focus.
                  // 2nd tap on the already-focused card → open detail sheet.
                  if (isFocused) {
                    if (onShowRouteDetail) onShowRouteDetail(route);
                  } else if (onRouteFocus) {
                    onRouteFocus(route);
                  }
                }}
                className={`w-[200px] snap-center snap-always flex-shrink-0 bg-white rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 border-[0.5px] border-[#E0E9FF] ${
                  isFocused
                    ? 'shadow-[0_0_0_2.5px_rgba(0,229,255,0.85),0_10px_28px_rgba(0,0,0,0.16)] scale-[1.02]'
                    : isActive
                      ? 'shadow-[0_0_0_2px_rgba(0,229,255,0.65),0_8px_24px_rgba(0,0,0,0.14)]'
                      : 'shadow-sm opacity-88 scale-[0.97]'
                }`}
              >
                {/* ── Cover image on top, fading into the card body (park-card style) ── */}
                <div className="relative w-full h-[120px] overflow-hidden bg-cyan-50">
                  {coverImage ? (
                    <Image
                      src={coverImage}
                      alt={route.name || 'מסלול'}
                      fill
                      className="object-cover"
                      sizes="200px"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                      <ActivityIcon type={activityType} size={30} />
                      <span className="text-[10px] font-bold text-cyan-400 text-center leading-tight px-1">
                        {activityType === 'running' ? 'ריצה'
                          : activityType === 'cycling' ? 'רכיבה'
                          : activityType === 'workout' ? 'כושר'
                          : 'הליכה'}
                      </span>
                    </div>
                  )}

                  {/* Fade into card body — reused verbatim from the park card (ParkCardImage) */}
                  <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent pointer-events-none" />

                  {/* Reachability badge pinned top-left of the image */}
                  {!isReachable && (
                    <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm text-gray-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shadow-sm">
                      <Car size={8} />
                      נסיעה
                    </div>
                  )}
                </div>

                {/* ── Text content below the image ── */}
                <div className="px-4 pt-2 pb-2 flex flex-col gap-1.5 min-w-0" dir="rtl">
                  {/* Source pill */}
                  <span className="text-[10px] font-bold text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded-full self-start leading-tight">
                    {sourceName}
                  </span>

                  {/* Community session badge */}
                  {route.linkedSessions?.nextStartTime && (
                    <div className="flex items-center gap-1.5 self-start">
                      <div className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        <Users size={10} className="text-emerald-600" />
                        <span className="text-[10px] font-bold text-emerald-700 leading-tight">
                          {formatSessionTime(route.linkedSessions.nextStartTime)}
                        </span>
                        {route.linkedSessions.spotsLeft != null && (
                          <span className="text-[9px] font-bold text-emerald-500">
                            · {route.linkedSessions.spotsLeft > 0 ? `${route.linkedSessions.spotsLeft} מקומות` : 'מלא'}
                          </span>
                        )}
                      </div>
                      {route.linkedSessions.avatars && route.linkedSessions.avatars.length > 0 && (
                        <ParticipantAvatars avatars={route.linkedSessions.avatars} />
                      )}
                    </div>
                  )}

                  {/* Route name */}
                  <h3 className="text-sm font-black text-gray-900 leading-tight line-clamp-2">
                    {route.name}
                  </h3>

                  {/* Stats + walk-to-route on a single line — keeps the card compact (park-card height) */}
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex items-center gap-1 shrink-0">
                      <MapPin size={11} className="text-[#00E5FF] shrink-0" />
                      <span className="text-xs font-bold text-gray-700">{totalDistKm.toFixed(1)}</span>
                      <span className="text-[10px] text-gray-400">{"ק״מ"}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Timer size={11} className="text-[#00E5FF] shrink-0" />
                      <span className="text-xs font-bold text-gray-700">{durationMin}</span>
                      <span className="text-[10px] text-gray-400">{"דק׳"}</span>
                    </div>
                    {/* Walk-to-route — inline, shown only on the focused card */}
                    {isFocused && walkToRouteMinutes != null && (
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-[10px] text-gray-400 shrink-0">🚶</span>
                        <span className="text-[10px] font-bold text-gray-500 truncate">
                          {walkToRouteMinutes} דק׳ הליכה למסלול
                        </span>
                      </div>
                    )}
                    {distFromUser > 0.1 && isReachable && (
                      <span className="text-[10px] text-gray-400 shrink-0 mr-auto">
                        {distFromUser.toFixed(1)} ממך
                      </span>
                    )}
                  </div>
                </div>

                {/* ── CTA button ── */}
                <div className="px-3 pb-3 pt-0">
                  {isLoading ? (
                    <div className="w-full py-2.5 rounded-xl bg-gray-100 flex items-center justify-center">
                      <span className="text-xs text-gray-400 font-bold animate-pulse">טוען...</span>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onRouteFocus) onRouteFocus(route);
                        if (!isReachable) {
                          const [startLng, startLat] = route.path[0];
                          window.open(`https://waze.com/ul?ll=${startLat},${startLng}&navigate=yes`, '_blank');
                        } else if (isGenerated && onShowDetails) {
                          onShowDetails();
                        } else if (onStartWorkout) {
                          onStartWorkout();
                        }
                      }}
                      className="w-full py-2.5 rounded-xl font-black text-sm text-[#0f172a] active:scale-[0.97] transition-all flex items-center justify-center gap-2 shadow-md shadow-cyan-400/20"
                      style={{ background: 'linear-gradient(135deg, #00E5FF 0%, #0891b2 100%)' }}
                    >
                      <Play size={14} fill="currentColor" />
                      {isReachable ? 'צא לדרך' : 'נווט להתחלה'}
                      <ChevronLeft size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
