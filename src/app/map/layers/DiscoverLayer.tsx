'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useMapMode } from '@/features/parks/core/context/MapModeContext';
import BottomJourneyContainer from '@/features/parks/core/components/BottomJourneyContainer';
import NavigationHub from '@/features/parks/core/components/NavigationHub';
import FreeRunDrawer from '@/features/parks/core/components/FreeRunDrawer';
import HybridOverviewScreen from '@/features/parks/core/components/hybrid/HybridOverviewScreen';
import OverviewTitleBar from '@/features/parks/core/components/hybrid/OverviewTitleBar';
import ExerciseDetailDrawer from '@/features/workouts/components/workout-preview-drawer/components/ExerciseDetailDrawer';
import ExerciseReplacementModal from '@/features/workout-engine/players/strength/components/ExerciseReplacementModal';
import { useProgramMap } from '@/features/workouts/components/workout-preview-drawer/hooks/useProgramMap';
import type { ExecutionLocation } from '@/features/content/exercises';
import type { ComposedHybridSession, HybridRoutePreview } from '@/features/workout-engine/hybrid/start-hybrid-session';
import HybridSlotCarousel, { ENTRY_PHRASES } from '@/features/parks/core/components/hybrid/HybridSlotCarousel';
import ShimmerPhraseButton from '@/components/ui/ShimmerPhraseButton';
import type { HybridStartIntent } from '@/features/workout-engine/hybrid/build-hybrid-input';
import { resolveSlots, presetToIntent, type HybridSlot } from '@/features/workout-engine/hybrid/hybrid-slots';
import type { AerobicKind } from '@/features/workout-engine/hybrid/compose-hybrid-session.service';
import { HYBRID_SLOTS_ENABLED, HYBRID_SLOT_PREVIEW_ENABLED, MAP_OVERVIEW_CHROME_V1 } from '@/config/feature-flags';
import type { Route } from '@/features/parks/core/types/route.types';
import RouteCarousel from '@/features/parks/core/components/RouteCarousel';
import FloatingSearchBar from '@/features/parks/core/components/FloatingSearchBar';
import MapModeHeader, { MapMode } from '@/features/parks/core/components/MapModeHeader';
import RouteGenerationLoader from '@/features/parks/core/components/RouteGenerationLoader';
import { useMapLogic } from '@/features/parks';
import ContributionWizard from '@/features/parks/client/components/contribution-wizard';
import QuickReportSheet from '@/features/parks/client/components/contribution-wizard/QuickReportSheet';
import { ParkPreview } from '@/features/parks/client/components/park-preview';
import RouteDetailSheet from '@/features/parks/client/components/route-preview/RouteDetailSheet';
import { MapLayersControl } from '@/features/parks/core/components/MapLayersControl';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { useSharedSession } from '@/features/workout-engine/core/store/useSharedSession';
import { auth } from '@/lib/firebase';
import { usePartnerData } from '@/features/parks/core/hooks/usePartnerData';
import { useUserStore } from '@/features/user';
import { useUserCityName } from '@/features/parks/core/hooks/useUserCityName';
import SetSavedPlaceSheet from '@/features/user/places/components/SetSavedPlaceSheet';
import type { SavedPlaceKind } from '@/features/user/places/store/useSavedPlacesStore';
import { useRecentSearchesStore } from '@/features/parks/core/store/useRecentSearchesStore';
import type { ActivityType } from '@/features/parks/core/types/route.types';
import {
  PartnerBubbles,
  PartnerOverlay,
  RadarAnimation,
  usePartnerFilters,
  type LiveActivityFilter,
} from '@/features/partners';
import type { DevSimulationState } from '@/features/parks/core/hooks/useDevSimulation';
import MockLocationPanel from '@/features/dev/components/MockLocationPanel';
import { useCommunityEnrichment } from '@/features/parks/core/hooks/useCommunityEnrichment';
import {
  Navigation,
  Plus, X, Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ViewportBounds } from '@/features/parks/core/store/useMapStore';

type MapLogic = ReturnType<typeof useMapLogic>;

const BRAND_COLOR = '#00E5FF';
const GRAY_COLOR = '#6B7280';

function ActionSpeedDial({ onAdd, onReport }: { onAdd: () => void; onReport: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="relative flex flex-col items-center gap-2">
      {isOpen && (
        <>
          <button
            onClick={() => { onReport(); setIsOpen(false); }}
            className="w-11 h-11 rounded-full shadow-lg flex items-center justify-center bg-amber-500 text-white active:scale-95 transition-all animate-in fade-in slide-in-from-bottom-2 duration-200"
            title="דיווח מהיר"
          >
            <Zap size={16} />
          </button>
          <button
            onClick={() => { onAdd(); setIsOpen(false); }}
            className="w-11 h-11 rounded-full shadow-lg flex items-center justify-center bg-emerald-500 text-white active:scale-95 transition-all animate-in fade-in slide-in-from-bottom-2 duration-200"
            title="הוסף מיקום"
          >
            <Plus size={16} />
          </button>
        </>
      )}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 rounded-full shadow-xl flex items-center justify-center bg-[#00E5FF] text-white active:scale-95 transition-all"
      >
        {isOpen ? <X size={22} /> : <Plus size={22} />}
      </button>
    </div>
  );
}

// ── Module-level pre-warm store (survives DiscoverLayer remounts) ─────────────
// Was three per-component useRef Maps → wiped on every remount (incl. the Strict-
// Mode dev mount cycle), so the CTA recomposed from scratch. Module scope keeps a
// settled plan warm for the tab's lifetime. Key = uid | slotId | coarse lat,lng
// (~110m) | activity: a different user / slot / meaningful move / activity misses
// naturally; GPS jitter under ~110m does not. FIFO-capped so a long session can't
// grow the Maps unbounded.
const HYBRID_WARM_CAP = 24;
const hybridPlanCache = new Map<string, ComposedHybridSession>();
const hybridRoutePreviewCache = new Map<string, HybridRoutePreview>();
const hybridTrioInflight = new Map<string, Promise<ComposedHybridSession | null>>();

function capMapInsert<V>(map: Map<string, V>, key: string, val: V): void {
  if (!map.has(key) && map.size >= HYBRID_WARM_CAP) {
    const oldest: string | undefined = map.keys().next().value; // insertion order
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(key, val);
}

function hybridWarmKey(
  slotId: string,
  loc: { lat: number; lng: number } | null,
  activity: string,
): string {
  const uid = useUserStore.getState().profile?.id ?? 'anon';
  const r = (n: number) => Math.round(n * 1000) / 1000; // ~110m bucket
  const geo = loc ? `${r(loc.lat)},${r(loc.lng)}` : 'noloc';
  return `${uid}|${slotId}|${geo}|${activity}`;
}

interface DiscoverLayerProps {
  logic: MapLogic;
  flyoverComplete: boolean;
  devSim?: DevSimulationState;
  initialOpenRun?: string | null;
  /** Center the camera on the best-available fix (live GPS or fallback dot). */
  onRecenter?: () => void;
}

export default function DiscoverLayer({ logic, flyoverComplete, devSim, initialOpenRun, onRecenter }: DiscoverLayerProps) {
  const { setMode, embedPreset } = useMapMode();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [mapMode, setMapMode] = useState<MapMode>('idle');

  // ── Viewport-search ("חפש באזור זה") state ───────────────────────────────
  const viewportBounds = useMapStore((s) => s.viewportBounds);
  const viewportSearchActive = useMapStore((s) => s.viewportSearchActive);
  // Splash gate — the single flag every on-map control below reads so nothing
  // pokes through the MapLoadingSkeleton during load. Mirrors AppMap's
  // isVisuallyReady; reveals all controls together the moment the map paints.
  const isMapVisuallyReady = useMapStore((s) => s.isMapVisuallyReady);
  // Baseline bounds — set once viewportBounds first arrives (map loaded).
  // When the user taps "חפש באזור זה" this is reset to the current bounds so
  // the button only reappears after a subsequent pan.
  const refBoundsRef = useRef<ViewportBounds | null>(null);

  // Seed the baseline once (and only once) when map bounds first arrive.
  useEffect(() => {
    if (viewportBounds && !refBoundsRef.current) {
      refBoundsRef.current = viewportBounds;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportBounds !== null]);

  // "חפש באזור זה" is visible when:
  //   • map has loaded (refBoundsRef set)
  //   • not already in viewport-search mode
  //   • idle mode (button hidden in freeRun / commute / partners)
  //   • user has panned > 30% of the viewport width or height from baseline
  const showSearchAreaButton = (() => {
    if (!viewportBounds || !refBoundsRef.current) return false;
    if (viewportSearchActive) return false;
    if (mapMode !== 'idle') return false;
    const ref = refBoundsRef.current;
    const vw = Math.abs(viewportBounds.neLng - viewportBounds.swLng);
    const vh = Math.abs(viewportBounds.neLat - viewportBounds.swLat);
    const refCx = (ref.neLng + ref.swLng) / 2;
    const refCy = (ref.neLat + ref.swLat) / 2;
    const curCx = (viewportBounds.neLng + viewportBounds.swLng) / 2;
    const curCy = (viewportBounds.neLat + viewportBounds.swLat) / 2;
    return Math.abs(curCx - refCx) > vw * 0.3 || Math.abs(curCy - refCy) > vh * 0.3;
  })();

  // ── Free-run flow state machine ────────────────────────────────────────────
  // Once `mapMode === 'freeRun'`, the user passes through two stages:
  //   1. 'config' — FreeRunDrawer (activity chips + goal + start CTAs)
  //   2. 'route'  — floating RouteCarousel (3 generated route cards over the map)
  //                 only entered when the user taps "עם מסלול".
  //
  // Stage transitions:
  //   drawer "התחל חופשי"  → config → idle (workout starts)
  //   drawer "עם מסלול"    → config → route (with carousel-config payload)
  //   route carousel back  → route  → config
  //   route carousel start → route  → idle (workout starts)
  type FreeRunStep = 'config' | 'overview' | 'route' | 'slots';
  const [freeRunStep, setFreeRunStep] = useState<FreeRunStep>('config');
  // Hybrid overview (phase ב) — composed once, shown, then run (no re-compose).
  const [hybridComposed, setHybridComposed] = useState<ComposedHybridSession | null>(null);
  const [hybridComposing, setHybridComposing] = useState(false);
  // Where the overview's back button returns to: 'slots' (came from a slot) or
  // 'config' (came from the build-yourself drawer) — never re-opens the drawer
  // when the user arrived via a slot.
  const [overviewBackStep, setOverviewBackStep] = useState<FreeRunStep>('config');
  // Route-preview chrome (MAP_OVERVIEW_CHROME_V1): the workout name shown in the blue
  // OverviewTitleBar. Captured per entry point — slot title from the slot, or a
  // derived aerobic+כוח label from the build-yourself drawer. Default is the neutral
  // focusedRoute name.
  const [overviewTitle, setOverviewTitle] = useState<string>('אימון משולב');
  // Route-preview chrome active = the hybrid overview drawer is up AND the flag is on.
  // Gates the top chrome (search/pills/layers) off and the blue title bar on. Gated on
  // LOCAL freeRunStep (not the store flag) so the swap happens in the same render pass
  // as the drawer mount — no one-frame flash. False when the flag is off → all sites
  // that read it are byte-identical.
  const overviewChromeActive =
    MAP_OVERVIEW_CHROME_V1 && mapMode === 'freeRun' && freeRunStep === 'overview' && !!hybridComposed;
  // Hybrid station exercise detail (tap) + replacement (swap) — the REAL preview drawers.
  const [hybridDetailEx, setHybridDetailEx] = useState<any | null>(null);
  const [hybridSwap, setHybridSwap] = useState<{ segIndex: number; exIndex: number; exercise: any; level: number } | null>(null);
  const { programMap: hybridProgramMap } = useProgramMap();

  // Carousel-config payload — captured when the user taps "Generate" in the
  // drawer so the floating RouteCarousel knows what targetKm to feed into
  // `generateDynamicRoutes`. Stored in DiscoverLayer (not in the carousel
  // itself) so a back-and-forth via the back chip preserves the previous
  // generation context if the user re-enters route mode quickly.
  const [routeCarouselConfig, setRouteCarouselConfig] = useState<{
    targetKm: number;
    includeStrength: boolean;
    surface: 'road' | 'trail';
  } | null>(null);

  // ── Hybrid slot layer state ("מה עושים היום?") — Phase 1, flag-gated ───────
  // EXPLICIT state machine: `freeRunStep` is the single source of truth and is
  // set ONLY by entry handlers (never by an effect racing the mapMode change):
  //   chip / openRun deep-link → 'config' (drawer)
  //   slot entry button        → 'slots'  (passive carousel — NO compose)
  //   card CTA "צא לדרך"        → compose → 'overview'
  //   back / dismiss           → resetHybridFlow(...)
  // slotActivity drives the resolver + the in-layer activity toggle. The
  // resolver + handlers that need userLocation/userCityName are defined lower.
  const [slotActivity, setSlotActivity] = useState<AerobicKind>('walking');

  // ── Preview-on-settle (READ-ONLY) ──────────────────────────────────────────
  // When the slot carousel settles on a hybrid card, compose its plan and draw
  // the route on the map — the SAME read-only compose the CTA uses, minus any
  // save/run. Cached per slot so revisiting a card is instant and the CTA can
  // reuse the exact composed object (preview == overview == run).
  // CACHE-KEY: slot.id assumes a FIXED intent per slot (true in Phase 1). When
  // build-your-own / per-slot overrides land, the same slot.id can yield
  // different plans → expand the key to include the config/intent (e.g. a hash).
  // Pre-warm caches now live at MODULE scope (hybridPlanCache /
  // hybridRoutePreviewCache / hybridTrioInflight, top of file) so they survive a
  // DiscoverLayer remount — the component refs were wiped on every remount, so the
  // CTA recomposed from scratch. Keys are built via keyFor() below. The light
  // route-preview cache stays SEPARATE from the full-plan cache on purpose: the CTA
  // reuses the full plan verbatim (needs the bolts trio), so a route-only object
  // must never land in it — else the overview would open without options.
  // Race guard: a stale/late preview compose must not draw after the user has
  // already swiped to another card / left the layer (mirrors hybridFlowIdRef). This
  // stays a per-mount ref — it only guards draws within the live component.
  const hybridPreviewFlowIdRef = useRef(0);
  const [hybridPreviewComposing, setHybridPreviewComposing] = useState(false);

  // Activity toggle (walk↔run) changes the composed route while slot.id stays
  // constant. No manual cache clear is needed anymore: the module-cache key
  // (keyFor) already includes slotActivity, so a new activity misses naturally and
  // the next settle recomposes. We only bump the per-mount draw token so a late
  // compose bound to the OLD activity can't repaint the map.
  // (GPS drift is intentionally NOT invalidated — the key rounds to ~110m, so a
  // preview tolerates small jitter; recomposing on every location tick would thrash.)
  useEffect(() => {
    hybridPreviewFlowIdRef.current += 1;
  }, [slotActivity]);

  // Flow token — bumped on every reset so a stale/late composeHybridPlan (e.g.
  // the user dismissed while it was in flight) can't force the overview after a
  // re-entry. Reset drops the composed plan + focused route + step so the entry
  // button always opens a FRESH slot layer, never a leftover overview.
  const hybridFlowIdRef = useRef(0);
  const resetHybridFlow = useCallback((nextStep: FreeRunStep = 'config') => {
    hybridFlowIdRef.current += 1;
    hybridPreviewFlowIdRef.current += 1; // cancel any in-flight preview compose
    setHybridComposing(false);
    setHybridPreviewComposing(false);
    setHybridComposed(null);
    setFreeRunStep(nextStep);
    logic.setFocusedRoute(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logic]);

  // Only clears stale route-carousel config on (re-)entering free-run mode.
  // Does NOT touch freeRunStep — the entry handlers own that (explicit SM).
  useEffect(() => {
    if (mapMode === 'freeRun') setRouteCarouselConfig(null);
  }, [mapMode]);

  // ── Run-invite deep-link: open FreeRunDrawer pre-configured ───────────────
  // Triggered when the guest arrives via /map?openRun=running|walking after
  // tapping the share link. Also consumes pending_run_invite from localStorage
  // to restore partner session context if Zustand was reset (iOS hard-close).
  //
  // Graceful fallback: if localStorage is malformed or membership expired,
  // the drawer still opens — the user can run alone without partner visibility.
  const openRunConsumedRef = useRef(false);
  useEffect(() => {
    if (!initialOpenRun || openRunConsumedRef.current) return;
    openRunConsumedRef.current = true;

    // Pre-select host's activity type (default, not locked — user can change it)
    logic.handleActivityChange(initialOpenRun as ActivityType);
    setMapMode('freeRun');
    setFreeRunStep('config'); // deep-link → the drawer (explicit SM)

    // Consume pending_run_invite — restore partner context after Zustand reset (iOS hard-close).
    // Normal navigation path: Zustand already has groupId + membershipReady=true from the
    // session page; in that case we skip to avoid temporarily resetting membershipReady.
    const raw = typeof window !== 'undefined' ? localStorage.getItem('pending_run_invite') : null;
    if (!raw) return;
    localStorage.removeItem('pending_run_invite');
    try {
      const invite = JSON.parse(raw) as {
        groupId?: string;
        attendanceId?: string;
        activityType?: string;
        source?: string;
        token?: string;
      };
      if (invite.source !== 'run-invite' || !invite.groupId || !invite.attendanceId) return;

      const currentState = useSharedSession.getState();
      if (currentState.groupId === invite.groupId && currentState.membershipReady) {
        // Normal navigation — session context was set by the session page; skip.
        return;
      }

      // iOS hard-close restore: Zustand was reset. Restore session context first.
      useSharedSession.getState().joinViaDeepLink(invite.groupId, invite.attendanceId, [], {}, '');

      if (invite.token) {
        // Re-confirm user_memberships idempotently (joinEngine is set+merge+arrayUnion)
        // before opening the presence gate — prevents PERMISSION-DENIED if the write
        // was missed in the previous session lifecycle.
        (async () => {
          try {
            const idToken = await auth.currentUser?.getIdToken();
            if (idToken) {
              await fetch('/api/join/session-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({ token: invite.token, groupId: invite.groupId }),
              });
            }
          } catch {
            // Non-fatal: user_memberships was likely written in the previous session.
          } finally {
            useSharedSession.getState().setMembershipReady();
          }
        })();
      } else {
        // Legacy pending_run_invite (no token field): open gate — membership was written
        // by consumeSessionInvitation before pending_run_invite was created.
        useSharedSession.getState().setMembershipReady();
      }
    } catch {
      // Malformed JSON — FreeRunDrawer is already open, just no partner context
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpenRun]);

  // ── Commute (A-to-B) flow state ───────────────────────────────────────────
  // `commuteRouteConfig` mirrors `routeCarouselConfig` for the commute
  // branch — it captures the destination + label needed to mount
  // RouteCarousel in commute mode. Stored at the layer level (not in
  // useMapStore) so a back-out gesture can clear it locally without
  // racing against any other consumer.
  const [commuteRouteConfig, setCommuteRouteConfig] = useState<{
    destination: { lat: number; lng: number };
    label?: string;
  } | null>(null);

  // ── Commute transport mode (per-session, NOT persisted) ────────────────
  // Daily commutes are activity-agnostic — someone running for fitness
  // in the morning might walk to work in the afternoon. We deliberately
  // do NOT seed this from `useUserStore.preferences.activity` (the
  // free-run default). Instead the commute always boots in 'walking',
  // which is the safest assumption for a navigation flow, and the user
  // taps the inline picker in RouteCarousel to swap mid-search. State
  // lives at the layer level so an entity-card → commute handoff
  // (Park "Navigate" button) starts on the same default and the user
  // gets a consistent UX regardless of how the commute was entered.
  const [commuteActivity, setCommuteActivity] = useState<ActivityType>('walking');

  // Reset the picker to 'walking' whenever a fresh commute begins, so
  // the previous session's choice doesn't bleed into the next one.
  useEffect(() => {
    if (commuteRouteConfig) setCommuteActivity('walking');
  }, [commuteRouteConfig?.destination.lat, commuteRouteConfig?.destination.lng]);

  // SetSavedPlaceSheet host state — null = closed, kind = open for that slot.
  const [setPlaceSheetKind, setSetPlaceSheetKind] = useState<SavedPlaceKind | null>(null);

  // Mirror the commute destination into useMapStore so AppMap can render
  // the destination pin without prop-drilling. SET-ONLY here — the
  // active session needs the pin to remain visible after the user
  // taps a route (mapMode flips back to 'idle'), and the workout
  // engine owns the canonical clear via `finishWorkout`. Explicit
  // user-cancel paths (back button / setCommuteRouteConfig(null) on
  // exit) clear the pin directly via setCommuteDestination(null) so
  // the back-out feels instant.
  useEffect(() => {
    if (mapMode === 'commute' && commuteRouteConfig) {
      useMapStore.getState().setCommuteDestination({
        coords: [commuteRouteConfig.destination.lng, commuteRouteConfig.destination.lat],
        label: commuteRouteConfig.label,
      });
    }
  }, [mapMode, commuteRouteConfig]);

  // ── Tap-empty-map → exit commute ──────────────────────────────────────
  // Field-test feedback: once a destination was picked, the only way
  // back was the small chevron in the carousel header. Users
  // expected the universal Maps gesture — tap empty map to dismiss.
  // AppMap bumps `mapEmptyTapTick` whenever a click misses every
  // interactive feature; we subscribe here and treat the bump as
  // "user is done, drop the commute". Other modes ignore the signal
  // entirely (handled by the conditional inside the effect).
  //
  // Implementation note: we read the tick reactively (not via
  // getState) so React re-runs the effect on every increment; the
  // effect-internal mode check is the gate.
  const mapEmptyTapTick = useMapStore((s) => s.mapEmptyTapTick);
  const lastEmptyTapTickRef = useRef(mapEmptyTapTick);
  useEffect(() => {
    if (mapEmptyTapTick === lastEmptyTapTickRef.current) return;
    lastEmptyTapTickRef.current = mapEmptyTapTick;
    if (mapMode === 'commute') {
      // Same teardown as the carousel's onBack — keeps the two exit
      // paths bit-identical so the user never lands in a half-state.
      logic.setFocusedRoute(null);
      setCommuteRouteConfig(null);
      useMapStore.getState().setCommuteDestination(null);
      setMapMode('idle');
      return;
    }
    // Empty-map tap dismisses the discover route carousel → idle, so the
    // BottomJourneyContainer unmounts and the on-map entry button returns
    // (mirrors the slot-layer dismiss below).
    if (mapMode === 'discover') {
      logic.setFocusedRoute(null);
      setMapMode('idle');
      return;
    }
    // Tapping the map (outside a card) dismisses the hybrid slot layer and
    // resets the flow so re-entry always shows fresh slots (never a stale overview).
    if (mapMode === 'freeRun' && freeRunStep === 'slots') {
      resetHybridFlow();
      setMapMode('idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapEmptyTapTick, mapMode, freeRunStep]);

  // Pending-commute consumer. Entity cards (ParkPreview /
  // RouteDetailSheet) write to `useMapStore.pendingCommute` when the
  // user taps their Navigate button; we react here, kick off the
  // commute flow, and consume the slot in one go so it can't re-fire
  // on the next render. Same pattern as pendingPartnerOverlay /
  // pendingDeepLink.
  const pendingCommute = useMapStore((s) => s.pendingCommute);
  useEffect(() => {
    if (!pendingCommute) return;
    const target = useMapStore.getState().consumePendingCommute();
    if (!target) return;
    // Close any open entity card so the new commute carousel owns the
    // bottom of the screen (the carousel and entity card share the
    // mid-bottom area and would visually collide otherwise).
    useMapStore.getState().setSelectedPark(null);
    logic.setSelectedRoute(null);
    logic.setFocusedRoute(null);
    setCommuteRouteConfig({
      destination: { lat: target.coords[1], lng: target.coords[0] },
      label: target.label,
    });
    setMapMode('commute');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCommute]);

  // ── Partner Finder state machine ──────────────────────────────────────────
  // Three exclusive screens once mapMode === 'partners':
  //   bubbles → radar (transient) → overlay
  // `pendingTab` carries the user's tap intent across the radar interlude
  // so the overlay knows which tab to open with.
  const [partnerTab, setPartnerTab] = useState<'live' | 'scheduled' | null>(null);
  const [showRadar, setShowRadar] = useState(false);
  const [pendingTab, setPendingTab] = useState<'live' | 'scheduled' | null>(null);

  // ── Partner data — lifted here (single source of truth) so the same
  // listener set powers the bubble counts, the radar's `isCached` signal,
  // AND the overlay cards. PartnerOverlay no longer subscribes itself.
  //
  // `effectiveRadius` = user's requested distance from filters, then auto-
  // bumped to 15km when fewer than 3 results show up. The bump happens via
  // a state set inside the effect below, NOT inside `usePartnerData` itself,
  // so we get exactly one re-subscription cycle when expansion fires.
  const userLocation = (devSim?.effectiveLocation(logic.currentUserPos) ?? logic.currentUserPos) ?? null;
  const requestedDistanceKm = usePartnerFilters((s) => s.distanceKm);

  // Resolved city for the FreeRunDrawer route flow. Same hook that
  // useRouteGeneration consumes — keeps both code paths in sync. We pass
  // `userLocation` so the hook can fall back to a Mapbox reverse-geocode
  // when the user has neither a city affiliation nor an authorityId on
  // their profile (the most common gap for non-gateway entry points).
  const userCityName = useUserCityName(userLocation);

  // Stable module-cache key for a slot at the CURRENT location + activity. Every
  // get/set/has for a slot's pre-warm goes through this so settle and the CTA agree
  // on one key. Recreated when location/activity change (cheap).
  const keyFor = useCallback(
    (slotId: string) => hybridWarmKey(slotId, userLocation, slotActivity),
    [userLocation, slotActivity],
  );

  const { profile } = useUserStore();
  const myGroupIds = profile?.social?.groupIds ?? [];

  // ── Full-park gate signals (Phase 3.1c) ────────────────────────────────────
  // hasStrengthProgram: sync from the profile (any active program qualifies for MVP).
  const hasStrengthProgram = (profile?.progression?.activePrograms?.length ?? 0) > 0;
  // hasEquippedPark: resolved async from the CACHED all-parks set (same fetchRealParks
  // the map + composer use — stale-while-revalidate), via the pure nearestEquippedPark
  // (Phase 1.1). READ-ONLY; no new fetch cost beyond the shared cache.
  const [hasEquippedPark, setHasEquippedPark] = useState(false);
  useEffect(() => {
    const loc = userLocation;
    if (!loc) { setHasEquippedPark(false); return; }
    let cancelled = false;
    Promise.all([
      import('@/features/parks/core/services/parks.service'),
      import('@/features/workout-engine/hybrid/park-out-and-back'),
    ]).then(async ([{ fetchRealParks }, { nearestEquippedPark }]) => {
      try {
        const parks = await fetchRealParks();
        if (!cancelled) setHasEquippedPark(nearestEquippedPark(loc, parks as any) != null);
      } catch { if (!cancelled) setHasEquippedPark(false); }
    });
    return () => { cancelled = true; };
  }, [userLocation]);

  // ── Hybrid slot resolver + handlers (need userLocation/userCityName) ───────
  // nearbyParkCount stays optimistic (A3 surfaces at the overview via fallbackHint);
  // the full-park card has its OWN hard gate (hasEquippedPark + hasStrengthProgram).
  const slots = useMemo<HybridSlot[]>(
    () => resolveSlots({
      hasGps: !!userLocation, nearbyParkCount: 1, aerobicKind: slotActivity,
      hasEquippedPark, hasStrengthProgram,
    }),
    [userLocation, slotActivity, hasEquippedPark, hasStrengthProgram],
  );

  // Draw a composed hybrid loop on the LIVE map (READ-ONLY — no save, no run).
  // id MUST be 'hybrid-route': MapShell draws a standalone composed loop ONLY
  // for that id (else just the station marker shows, polyline missing — see
  // MapShell.tsx:350). Used by the settle-preview and the CTA cache-reuse; the
  // overview's own inline draw (composeAndShowOverview) is left byte-identical.
  const drawComposedRoute = useCallback((composed: ComposedHybridSession) => {
    logic.setFocusedRoute({
      id: 'hybrid-route', name: 'אימון משולב', path: composed.routePath,
      distance: composed.plan.totals.distanceKm,
      stationMarker: composed.station
        ? { lat: composed.station.lat, lng: composed.station.lng, name: composed.station.name, image: composed.station.image }
        : null,
    } as unknown as Route);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logic]);

  // Draw a LIGHT route-only preview (full-park settle-preview) — same map shape as
  // drawComposedRoute, but sourced from the route+station+distance preview instead
  // of a fully composed plan (which would require the heavy home-workout trio).
  const drawRoutePreview = useCallback((preview: HybridRoutePreview) => {
    logic.setFocusedRoute({
      id: 'hybrid-route', name: 'אימון משולב', path: preview.routePath,
      distance: preview.distanceKm,
      stationMarker: preview.station
        ? { lat: preview.station.lat, lng: preview.station.lng, name: preview.station.name, image: preview.station.image }
        : null,
    } as unknown as Route);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logic]);

  // Compose a hybrid plan → show the overview. Shared by the drawer's
  // "התחל משולב" and the recommended slot: composes ONCE, then runs the SAME
  // object (no re-compose). fallbackStep = where to return if no route builds.
  const composeAndShowOverview = useCallback((intent: HybridStartIntent, fallbackStep: FreeRunStep = 'config', existingCompose?: Promise<ComposedHybridSession | null>) => {
    // eslint-disable-next-line no-console
    console.log('[compose-trigger]', existingCompose ? 'await-inflight-compose' : 'composeAndShowOverview', 'from=', fallbackStep, 'kind=', intent.aerobicKind);
    const flowId = ++hybridFlowIdRef.current; // this compose owns the flow
    setHybridComposing(true);
    // AWAIT an already-running compose (settle-preview / background prewarm) when
    // one is handed in — never start a duplicate composeHybridPlan. Otherwise
    // start a fresh compose. `startRun` wires the real run at RUN time; it is
    // never baked into the returned session, so awaiting a read-only prewarm
    // (startRun: no-op) is byte-identical to the cache-hit path.
    const composeP: Promise<ComposedHybridSession | null> = existingCompose
      ?? import('@/features/workout-engine/hybrid/start-hybrid-session').then(({ composeHybridPlan }) =>
        composeHybridPlan(intent, {
          userPosition: userLocation,
          cityName: userCityName,
          startRun: logic.startActiveWorkout,
        }));
    composeP.then((composed) => {
      // Dismissed / superseded while composing → drop this result silently.
      if (hybridFlowIdRef.current !== flowId) return;
      setHybridComposing(false);
      if (!composed) { setFreeRunStep(fallbackStep); return; }
      // Show the generated route on the LIVE map behind the peekable overview;
      // carry the station location so MapShell drops a marker on it.
      logic.setFocusedRoute({
        id: 'hybrid-route', name: 'אימון משולב', path: composed.routePath,
        distance: composed.plan.totals.distanceKm,
        stationMarker: composed.station ? { lat: composed.station.lat, lng: composed.station.lng, name: composed.station.name, image: composed.station.image } : null,
      } as unknown as Route);
      console.log(
        `[hybrid:diag] route drawn → setFocusedRoute pts=${composed.routePath.length}` +
        ` station=${composed.station ? `${composed.station.lat.toFixed(5)},${composed.station.lng.toFixed(5)}` : 'none(A3)'}`,
      );
      setOverviewBackStep(fallbackStep);
      setHybridComposed(composed);
      setFreeRunStep('overview');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation, userCityName, logic]);

  // Compose a slot's FULL trio, de-duped by cache key: if a compose is already
  // in-flight for this key, return THAT promise instead of starting a second one.
  // Caches the result in hybridPlanCache (module scope) on success and clears the
  // in-flight entry when it settles. Read-only (startRun no-op) — both the settle
  // preview and the eager settle warm fill the SAME cache the CTA reuses.
  const composeTrioDeduped = useCallback((intent: HybridStartIntent, slotId: string): Promise<ComposedHybridSession | null> => {
    const key = keyFor(slotId);
    const existing = hybridTrioInflight.get(key);
    if (existing) return existing;
    const p = import('@/features/workout-engine/hybrid/start-hybrid-session').then(({ composeHybridPlan }) =>
      composeHybridPlan(intent, { userPosition: userLocation, cityName: userCityName, startRun: () => {} }));
    hybridTrioInflight.set(key, p);
    p.then((composed) => { if (composed) capMapInsert(hybridPlanCache, key, composed); })
      .catch(() => { /* callers treat as null */ })
      .finally(() => { if (hybridTrioInflight.get(key) === p) hybridTrioInflight.delete(key); });
    return p;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation, userCityName, keyFor]);

  // READ-ONLY preview: when the carousel SETTLES on a hybrid card, compose its
  // plan (cached per slot.id) and draw the route on the map — the SAME compose
  // the CTA runs, minus ANY save/run. This path NEVER calls runHybridPlan /
  // finishHybrid / saveWorkout — it only composeHybridPlan()s + draws. A
  // non-hybrid (aerobic_quick) card has no guided route → clear the map.
  const handleSettleSlot = useCallback((slot: HybridSlot) => {
    if (!HYBRID_SLOT_PREVIEW_ENABLED) return;
    // Every settle invalidates any in-flight preview compose (fast-swipe guard).
    const flowId = ++hybridPreviewFlowIdRef.current;
    if (slot.kind !== 'hybrid') {
      setHybridPreviewComposing(false);
      logic.setFocusedRoute(null);
      return;
    }
    // full_park_workout: draw the ROUTE ONLY on settle. Its full compose builds a
    // 3-workout home trio (generateHomeWorkoutTrio) that the map never needs to
    // draw — so the settle-preview runs only the fast half (route + station) via
    // composeFullParkRoutePreview, and the heavy trio is deferred to the CTA
    // (handleSelectSlot → overview). Uses the SEPARATE light cache so it never
    // poisons the full-compose cache the CTA reuses.
    if (slot.preset.mode === 'full_park_workout') {
      const intent = presetToIntent(slot.preset, slot.timeBudgetMin);
      // Route drawn → warm the FULL trio EAGERLY (was requestIdleCallback, which
      // starved under render churn so the trio wasn't ready at tap-time).
      // composeTrioDeduped is deduped + caches into hybridPlanCache, so an early
      // "צא לדרך" awaits THIS promise. The dynamic import() yields before any heavy
      // work, so the route paint above is not blocked.
      const warmTrio = () => composeTrioDeduped(intent, slot.id).then((composed) => {
        if (hybridPreviewFlowIdRef.current !== flowId || !composed) return;
        // eslint-disable-next-line no-console
        console.log('[compose-trigger]', 'prewarm-ready', slot.id);
      });
      const cachedRoute = hybridRoutePreviewCache.get(keyFor(slot.id));
      if (cachedRoute) {
        setHybridPreviewComposing(false);
        drawRoutePreview(cachedRoute);
        warmTrio();
        return;
      }
      setHybridPreviewComposing(true);
      import('@/features/workout-engine/hybrid/start-hybrid-session').then(async ({ composeFullParkRoutePreview }) => {
        const preview = await composeFullParkRoutePreview(intent, {
          userPosition: userLocation,
          cityName: userCityName,
          startRun: () => {}, // preview NEVER starts a session (read-only)
        });
        // Superseded (user swiped away / left the layer) → drop silently, no draw.
        if (hybridPreviewFlowIdRef.current !== flowId) return;
        setHybridPreviewComposing(false);
        if (!preview) return; // no equipped park / no position → leave map as-is
        capMapInsert(hybridRoutePreviewCache, keyFor(slot.id), preview);
        drawRoutePreview(preview);
        warmTrio();
      });
      return;
    }

    // Regular hybrid (walk+strength budget-split): full compose on settle — now
    // fast (maxRoutes:1, single loop, no 1.5s chain) — cached for CTA reuse.
    const cached = hybridPlanCache.get(keyFor(slot.id));
    if (cached) {
      setHybridPreviewComposing(false);
      drawComposedRoute(cached);
      return;
    }
    setHybridPreviewComposing(true);
    // Register the compose as in-flight (composeTrioDeduped) so an early "צא לדרך"
    // tap AWAITS it rather than starting a duplicate; it also caches on success.
    composeTrioDeduped(presetToIntent(slot.preset, slot.timeBudgetMin), slot.id).then((composed) => {
      // Superseded (user swiped away / left the layer) → drop silently, no draw.
      if (hybridPreviewFlowIdRef.current !== flowId) return;
      setHybridPreviewComposing(false);
      if (!composed) return; // compose failed → leave the map as-is (never crash)
      drawComposedRoute(composed);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation, userCityName, logic, drawComposedRoute, drawRoutePreview, composeTrioDeduped, keyFor]);

  // Slot selection: hybrid → compose→overview; aerobic_quick → start now (skip overview).
  const handleSelectSlot = useCallback((slot: HybridSlot) => {
    // eslint-disable-next-line no-console
    console.log('[compose-trigger]', 'handleSelectSlot', slot.kind, slot.id);
    if (slot.kind === 'hybrid') {
      // Route-preview title bar (MAP_OVERVIEW_CHROME_V1): show the slot's own name
      // (e.g. "ריצה + כוח" / "אימון מלא בפארק"). Harmless no-op when the flag is off.
      setOverviewTitle(slot.title);
      // CTA cache-reuse (ADDITIVE): if the settle-preview already composed this
      // slot, reuse that EXACT object → no re-compose, and overview/run show
      // precisely the previewed route (the generator randomises, so a second
      // compose would differ). Cancel any in-flight preview REDRAW so a late
      // result can't repaint the map. The no-cache path awaits the de-duped
      // compose (composeTrioDeduped) rather than starting a fresh one.
      hybridPreviewFlowIdRef.current += 1;
      // route_stops ONLY (targeted, not a hybridWarmKey change — no blast radius on any other
      // slot's cache reuse): the duration chips (15/30/45, HybridSlotCarousel) make
      // timeBudgetMin a LIVE per-tap value for this one slot, but hybridWarmKey (uid|slotId|
      // geo|activity) does NOT include it. The settle-preview (below, ~300ms after landing on
      // the card) composes+caches using the un-overridden slot.timeBudgetMin the MOMENT the
      // card appears — before any chip tap — so without this bypass, a chip-tap→CTA sequence
      // would silently reuse that stale cached compose and never re-run deriveAerobicTargetKm
      // with the chip's value (confirmed on-device: zero composeHybridPlan / chip-check log on
      // CTA press). Clearing both caches forces a fresh compose with the CURRENT chip value.
      if (slot.kind === 'hybrid' && slot.id === 'route_stops') {
        const rsKey = keyFor(slot.id);
        hybridPlanCache.delete(rsKey);
        hybridTrioInflight.delete(rsKey);
      }
      const cached = hybridPlanCache.get(keyFor(slot.id));
      if (cached) {
        setHybridPreviewComposing(false);
        drawComposedRoute(cached);
        setOverviewBackStep('slots');
        setHybridComposed(cached);
        setFreeRunStep('overview');
        return;
      }
      // Not cached yet → AWAIT the DE-DUPED compose. composeTrioDeduped returns
      // the settle-preview / prewarm compose if one is already in-flight, else it
      // starts one and REGISTERS it — so this covers both races: (a) tapping while
      // a prewarm runs, and (b) tapping in the idle gap before prewarm starts (the
      // CTA's own compose is now registered, so the later prewarm reuses it instead
      // of composing a second time). This is the fix for the double [compose-trigger].
      const trio = composeTrioDeduped(presetToIntent(slot.preset, slot.timeBudgetMin), slot.id);
      composeAndShowOverview(presetToIntent(slot.preset, slot.timeBudgetMin), 'slots', trio);
      return;
    }
    // Aerobic quick-start — the session mode is read synchronously from
    // useRunningPlayer.activityType in _doStartActiveWorkout, so set it on the
    // store BEFORE start. Clear any guided route, then launch immediately.
    useRunningPlayer.getState().setActivityType(slot.aerobicKind);
    logic.setFocusedRoute(null);
    logic.startActiveWorkout();
  }, [composeAndShowOverview, composeTrioDeduped, drawComposedRoute, logic, keyFor]);

  const [effectiveRadius, setEffectiveRadius] = useState(requestedDistanceKm);

  // Reset the effective radius whenever the user explicitly changes the
  // filter — otherwise an earlier auto-bump would stick around forever.
  useEffect(() => {
    setEffectiveRadius(requestedDistanceKm);
  }, [requestedDistanceKm]);

  const { live, scheduled, isLoading } = usePartnerData(userLocation, effectiveRadius, myGroupIds, !!embedPreset);

  useEffect(() => {
    const total = live.length + scheduled.length;
    const next = total < 3 && effectiveRadius < 15 ? 15 : effectiveRadius;
    if (next !== effectiveRadius) setEffectiveRadius(next);
  }, [live, scheduled, effectiveRadius]);

  // Reset partner sub-state whenever the user leaves the partners mode.
  useEffect(() => {
    if (mapMode !== 'partners') {
      setPartnerTab(null);
      setShowRadar(false);
      setPendingTab(null);
    }
  }, [mapMode]);

  const handleBubbleSelect = (tab: 'live' | 'scheduled') => {
    setPendingTab(tab);
    setShowRadar(true);
  };

  const handleRadarComplete = () => {
    setShowRadar(false);
    setPartnerTab(pendingTab);
    setPendingTab(null);
  };

  const handlePartnerOverlayClose = () => {
    setPartnerTab(null);
    setShowRadar(false);
    setPendingTab(null);
    setMapMode('idle');
  };

  // ── Continuous filter sync ──
  // Mirror `usePartnerFilters.liveActivity` → `useMapStore.partnerActivityFilter`
  // on every change so that map markers AND the heatmap re-filter in
  // real-time as the user taps pills inside PartnerOverlay or
  // PartnerFilterSheet. The previous mount-only `onFiltersChange` bridge
  // synced just once when the overlay opened, so subsequent pill taps
  // updated the partner-finder list but left the map in a stale state.
  // This effect subscribes to the store via React, so every `setLiveActivity`
  // call (from `PartnerFilterBar`, smart defaults, or anywhere else) reaches
  // the map store within the next render commit.
  const liveActivityFilter = usePartnerFilters((s) => s.liveActivity);
  useEffect(() => {
    useMapStore.getState().setPartnerActivityFilter(liveActivityFilter);
  }, [liveActivityFilter]);

  // Retained as a stable no-op identity so the existing `onFiltersChange`
  // prop signature on PartnerOverlay continues to compile. The continuous
  // sync above is now the source of truth — this callback is intentionally
  // empty and can be removed once the prop is dropped.
  const handlePartnerFiltersChange = useCallback((_filter: LiveActivityFilter) => {
    // no-op — see continuous sync effect above
  }, []);

  // ── ONE-TIME RESET — fires only on first session mount, not on every React
  // remount, so back-navigation and deep-link state are preserved across renders.
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    logic.setSelectedRoute(null);
    logic.setFocusedRoute(null);
    logic.setNavigationVariants({ recommended: null, scenic: null, facilityRich: null });
    logic.setNavState('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Cross-screen handoff — entry-points outside /map (e.g. WorkoutPreviewDrawer)
  // can request the partner overlay opens directly by setting an intent on
  // useMapStore right before navigating here. Consumed exactly once on mount.
  // We jump straight past the radar/bubbles transient — the user already
  // expressed clear intent on the previous screen.
  useEffect(() => {
    if (embedPreset) return; // partners is fully off in embed — never enter via deep-link either
    const intent = useMapStore.getState().consumePendingPartnerOverlay();
    if (!intent) return;
    setMapMode('partners');
    setPartnerTab(intent.tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── BODY OVERFLOW LOCK — prevent scroll-through when searching ──
  useEffect(() => {
    if (logic.navState === 'searching') {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [logic.navState]);

  // ── Bridge into commute mode ──────────────────────────────────────────
  // Funnel any "go to this destination" intent through a single helper so
  // the three entry points stay consistent:
  //   1. Generic Mapbox address picked from search.
  //   2. Saved Home/Work shortcut tapped (synthesised as a 'mapbox' source).
  //   3. (Phase 2) Park/Route entity card "Navigate" buttons.
  //
  // Always: clear the route selection slot, idle the search overlay,
  // capture the destination, flip mapMode='commute' so RouteCarousel
  // mounts. The carousel itself drives the rest.
  const startCommute = useCallback(
    (target: { coords: [number, number]; label?: string }) => {
      const [lng, lat] = target.coords;
      logic.setSelectedRoute(null);
      logic.setFocusedRoute(null);
      setCommuteRouteConfig({ destination: { lat, lng }, label: target.label });
      setMapMode('commute');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleAddressSelect = async (addr: any) => {
    // Run the legacy hook first — it handles park / route / mapbox
    // suggestion sources (clears search, opens entity cards, etc.).
    await logic.handleAddressSelect(addr);

    // ── Recent-searches sync ──────────────────────────────────────
    // Persist EVERY successful pick (park / route / mapbox) so the
    // search overlay's "חיפושים אחרונים" list reflects the user's real
    // history. The store dedups + caps internally so repeated taps on
    // the same entry are safe. Saved-place picks route through the
    // NavigationHub's own Quick Actions grid and are not double-listed
    // here to keep the recents list uncluttered.
    if (addr?._source !== 'savedPlace' && Array.isArray(addr?.coords) && addr?.text) {
      const sourceForRecent: 'park' | 'route' | 'mapbox' =
        addr._source === 'park' || addr._source === 'route' ? addr._source : 'mapbox';
      useRecentSearchesStore.getState().pushRecent({
        text: addr.text,
        coords: addr.coords as [number, number],
        source: sourceForRecent,
      });
    }

    // Generic-address & savedPlace suggestions are the commute trigger.
    // Park / route hits open their entity card via logic.handleAddressSelect
    // and we MUST NOT re-fire commute on top of that. `recent` is also
    // a commute trigger (replayed generic addresses).
    const isCommuteTrigger =
      addr?._source === 'mapbox' ||
      addr?._source === 'savedPlace' ||
      !addr?._source;
    if (isCommuteTrigger && Array.isArray(addr?.coords)) {
      startCommute({ coords: addr.coords as [number, number], label: addr.text });
    }
  };

  // NavigationHub props — only the search-overlay slice is needed now.
  // The legacy navigation-variant props (navigationVariants / selectedVariant
  // / etc.) were dropped from the required prop set when NavigationHub's
  // 'navigating' branch was removed. They're left out here on purpose.
  const navHubProps = {
    navState: logic.navState,
    onStateChange: logic.setNavState,
    searchQuery: logic.searchQuery,
    onSearchChange: logic.setSearchQuery,
    suggestions: logic.suggestions,
    onAddressSelect: handleAddressSelect,
    isSearching: logic.isSearching,
    inputRef: logic.searchInputRef,
    onSetSavedPlace: embedPreset ? undefined : (kind: SavedPlaceKind) => setSetPlaceSheetKind(kind),
  } as const;

  // ── Community enrichment — reactive via onSnapshot ──
  const rawDisplayRoutes = logic.routesToDisplay || [];
  const routeIds = useMemo(() => rawDisplayRoutes.map((r) => r.id), [rawDisplayRoutes]);
  // Empty array short-circuits the hook's own effect (routeIds.length === 0
  // clears state and returns before subscribing) — no separate embed gate needed.
  const { enrichRoutes } = useCommunityEnrichment(embedPreset ? [] : routeIds, rawDisplayRoutes);
  const allDisplayRoutes = useMemo(() => enrichRoutes(rawDisplayRoutes), [enrichRoutes, rawDisplayRoutes]);
  const hasNearbyRoutes = allDisplayRoutes.length > 0;

  // ── Initial discover fit + auto-focus ──
  // The first time the user lands in discover mode with routes loaded we
  // want the camera to fit ALL routes (not just the first one). The actual
  // fit-all is owned by `useCameraController` (it sees `mapMode === 'discover'`
  // and runs once); this layer is only responsible for picking the focused
  // route AFTER the initial fit completes so the carousel has an active card.
  //
  // The ref guards against re-firing the auto-focus on remounts/route refreshes
  // within the same discover session, and is reset on leaving discover so
  // re-entry behaves like a fresh session.
  const initialDiscoverFitRef = useRef(false);

  useEffect(() => {
    if (mapMode !== 'discover') {
      initialDiscoverFitRef.current = false;
    }
  }, [mapMode]);

  useEffect(() => {
    if (
      mapMode === 'discover' &&
      allDisplayRoutes.length > 0 &&
      !logic.focusedRoute &&
      !initialDiscoverFitRef.current
    ) {
      initialDiscoverFitRef.current = true;
      // The camera controller pre-marks this id as already-fitted (via its
      // hasDoneInitialDiscoverFit pass) so this setFocusedRoute call does NOT
      // trigger a second fitBounds on top of the fit-all.
      logic.setFocusedRoute(allDisplayRoutes[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapMode, allDisplayRoutes.length]);

  // ── Handle mode changes ──
  const handleMapModeChange = (mode: MapMode) => {
    // Any mode chip dismisses a selected park — otherwise selectedPark keeps the
    // Screen SM pinned to PARK_CARD and the chip's surface never appears.
    useMapStore.getState().setSelectedPark(null);
    setMapMode(mode);
    // Entering free-run via the mode chip → the drawer (explicit SM; the slot
    // entry button sets 'slots' itself).
    if (mode === 'freeRun') setFreeRunStep('config');
    if (mode !== 'discover') {
      logic.setFocusedRoute(null);
      logic.setSelectedRoute(null);
      // Clear viewport search so proximity filter resumes in any non-discover mode.
      useMapStore.getState().setViewportSearchActive(false);
    }
    // Skip PartnerBubbles entirely — go straight to radar on every entry.
    if (mode === 'partners') {
      setPendingTab('live');
      setShowRadar(true);
    }
  };

  // Tap "חפש באזור זה" → activate viewport search and switch to discover mode.
  const handleSearchArea = useCallback(() => {
    useMapStore.getState().setViewportSearchActive(true);
    // Suppress the auto-fit-all camera animation that fires on first discover
    // entry — the user already positioned the map where they want to search.
    initialDiscoverFitRef.current = true;
    // Reset baseline so button reappears only after the next pan.
    if (viewportBounds) refBoundsRef.current = viewportBounds;
    setMapMode('discover');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportBounds]);

  // ── THE LAW: SINGLE SCREEN STATE ──
  const selectedPark = useMapStore((s) => s.selectedPark);
  type Screen = 'SEARCH' | 'NAV' | 'ROUTE_CARD' | 'PARK_CARD' | 'COMMUTE' | 'DISCOVERY';
  const screen: Screen = (() => {
    if (logic.navState === 'searching') return 'SEARCH';
    // 'navigating' is now a no-op (NavigationHub returns null on this
    // state). Kept in the union for backwards compat — falls through.
    if (logic.navState === 'navigating') return 'NAV';
    if (logic.selectedRoute) {
      // A route card tap can arrive while a drawer mode (FreeRun /
      // Partners / Commute) is open. Clear the local drawer mode so its
      // overlay doesn't linger behind the sheet.
      if (mapMode !== 'idle' && mapMode !== 'discover') setMapMode('idle');
      return 'ROUTE_CARD';
    }
    // selectedPark is its own exclusive screen (mirrors ROUTE_CARD) so a park
    // card can NEVER co-exist with the entry button / slot carousel / free-run
    // surfaces (all under DISCOVERY). Selecting a park replaces them; closing it
    // (ParkPreview's × → setSelectedPark(null)) returns to DISCOVERY → the entry
    // button reappears. General fix — intentionally applies with the hybrid flag
    // OFF too (the park↔free-run mixing predates the flag).
    if (selectedPark) {
      if (mapMode !== 'idle' && mapMode !== 'discover') setMapMode('idle');
      return 'PARK_CARD';
    }
    if (mapMode === 'commute' && commuteRouteConfig) return 'COMMUTE';
    return 'DISCOVERY';
  })();

  // ── Shared top bar: glassmorphic search + saved-places quick row + mode pills ──
  function renderTopBar() {
    // Keep the search bar (z-[70]) + mode chips out of the loading splash —
    // they sit ABOVE the z-[50] skeleton, so without this they poke through.
    if (!isMapVisuallyReady) return null;
    return (
      <div
        className="absolute left-0 right-0 z-[70] px-4 pointer-events-none"
        style={{ top: 'calc(52px + env(safe-area-inset-top, 0px))', paddingTop: '0.75rem' }}
      >
        <div className="max-w-md mx-auto w-full space-y-2">
          {/* Premium glass search bar — focus opens NavigationHub overlay.
              Home / Work saved-place shortcuts are surfaced inside the
              NavigationHub full-screen overlay (Quick Actions grid) so
              the map canvas stays uncluttered. */}
          <FloatingSearchBar
            inputRef={logic.searchInputRef}
            searchQuery={logic.searchQuery}
            onSearchChange={logic.setSearchQuery}
            onFocus={() => logic.setNavState('searching')}
          />

          {/* "חפש באזור זה" pill — appears after panning > 30% viewport from
              the baseline position. Tapping activates viewport-search mode. */}
          <AnimatePresence>
            {showSearchAreaButton && (
              <motion.div
                key="search-area-btn"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="flex justify-center pointer-events-auto"
              >
                <button
                  onClick={handleSearchArea}
                  className="bg-white text-gray-800 text-sm font-semibold px-5 py-2 rounded-full shadow-md ring-1 ring-black/10 active:scale-95 transition-all"
                  dir="rtl"
                >
                  חפש באזור זה
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Mode header pills — also hidden in commute mode so the
              top surface stays focused on the active navigation flow. */}
          {mapMode !== 'commute' && (
            <div className="pointer-events-auto">
              <MapModeHeader
                activeMode={mapMode}
                onModeChange={handleMapModeChange}
                hasNearbyRoutes={hasNearbyRoutes}
                partnerCount={live.length}
                hiddenModes={embedPreset ? ['partners'] : undefined}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── SWITCH STATEMENT — only ONE branch renders, everything else is unmounted ──
  function renderScreen(): React.ReactNode {
    switch (screen) {
      case 'SEARCH':
        return <NavigationHub {...navHubProps} />;

      case 'NAV':
        return <NavigationHub {...navHubProps} />;

      case 'ROUTE_CARD': {
        const enrichedSelected = enrichRoutes([logic.selectedRoute!])[0];
        return (
          <>
            {/* route-preview: the top chrome must never show while the hybrid overview
                drawer is up, in ANY screen state (MAP_OVERVIEW_CHROME_V1). */}
            {!overviewChromeActive && renderTopBar()}

            <RouteDetailSheet
              isOpen
              route={enrichedSelected}
              userLocation={devSim?.effectiveLocation(logic.currentUserPos) ?? logic.currentUserPos ?? null}
              onClose={() => { logic.setSelectedRoute(null); logic.setFocusedRoute(null); }}
              onStartWorkout={(r) => {
                logic.setFocusedRoute(r);
                logic.startActiveWorkout();
              }}
              onNavigate={(r) => {
                // "Navigate to" on an entity card funnels into the
                // commute flow instead of re-opening the legacy
                // 3-variant drawer. We use the route's first path coord
                // as the destination — that's where the user wants to
                // arrive (the trailhead). The route card itself is
                // dismissed so the commute carousel can take the bottom.
                const startPoint = Array.isArray(r.path) && r.path.length > 0
                  ? r.path[0]
                  : null;
                if (!startPoint) return;
                logic.setSelectedRoute(null);
                logic.setFocusedRoute(null);
                startCommute({
                  coords: [startPoint[0], startPoint[1]],
                  label: r.name,
                });
              }}
              devSim={devSim}
            />
          </>
        );
      }

      case 'PARK_CARD':
        // Park card as an exclusive bottom surface — no entry button, no slot
        // carousel, no free-run drawer behind it. Top bar stays so the user can
        // still search / change mode. ParkPreview self-gates on selectedPark.
        return (
          <>
            {/* route-preview: the top chrome must never show while the hybrid overview
                drawer is up, in ANY screen state (MAP_OVERVIEW_CHROME_V1). */}
            {!overviewChromeActive && renderTopBar()}
            <ParkPreview userLocation={logic.currentUserPos ?? null} />
          </>
        );

      case 'COMMUTE': {
        // The unified RouteCarousel mounted in commute mode. Top bar
        // stays visible (just the floating search) so the user can
        // change their destination at any time.
        if (!userLocation || !commuteRouteConfig) return null;
        return (
          <>
            {/* route-preview: the top chrome must never show while the hybrid overview
                drawer is up, in ANY screen state (MAP_OVERVIEW_CHROME_V1). */}
            {!overviewChromeActive && renderTopBar()}

            <RouteCarousel
              userPosition={userLocation}
              // ── Commute activity is per-session, NOT inherited ──
              // We deliberately ignore `logic.preferences.activity`
              // here — see the `commuteActivity` jsdoc above for why.
              // The user picks via the inline picker chip group; the
              // value re-triggers route generation through the
              // RouteCarousel reset effect.
              activity={commuteActivity}
              onActivityChange={setCommuteActivity}
              mode="commute"
              destination={commuteRouteConfig.destination}
              destinationLabel={commuteRouteConfig.label}
              focusedRouteId={logic.focusedRoute?.id ?? null}
              onFocusChange={(route) => logic.setFocusedRoute(route)}
              onBack={() => {
                // Drop the commute flow and clear the destination pin.
                // The map returns to its default discover surface.
                // setCommuteDestination(null) is called explicitly here
                // because the mirror effect is set-only — see its
                // jsdoc above for why.
                logic.setFocusedRoute(null);
                setCommuteRouteConfig(null);
                useMapStore.getState().setCommuteDestination(null);
                setMapMode('idle');
              }}
              onSelect={(route) => {
                // Stage the commute intent on useRunningPlayer BEFORE
                // startActiveWorkout fires. The pre-flight chain
                // (clearRunningData → initializeRunningData) does not
                // touch sessionMode / commuteContext, so the staged
                // values survive into the active session and the HUD
                // boots in commute flavour on first paint (no flash
                // from the workout HUD to the commute HUD). See
                // useRunningPlayer.SessionMode jsdoc for the contract.
                useRunningPlayer.getState().setCommuteContext({
                  destination: commuteRouteConfig.destination,
                  label: commuteRouteConfig.label,
                });
                // Mirror the commute-picker activity into the user
                // preferences right before starting so downstream
                // running-player logic (UI accents, calorie formula)
                // operates with the activity the user actually chose
                // for this commute, not the stale "last free-run"
                // activity. This is a write-only mirror; it stays
                // local to this session start and isn't persisted.
                logic.handleActivityChange(commuteActivity);
                // Also mirror into the running player itself so the unified
                // session mode + the saved doc file a walking commute as
                // walking (cycling falls back to 'running' — no pipeline yet).
                useRunningPlayer.getState().setActivityType(
                  commuteActivity === 'walking' ? 'walking' : 'running',
                );
                logic.setFocusedRoute(route);
                setMapMode('idle');
                setCommuteRouteConfig(null);
                logic.startActiveWorkout();
              }}
            />
          </>
        );
      }

      case 'DISCOVERY':
        return (
          <>
            {/* Top bar (search + mode pills) is unmounted while the partner
                overlay is open — same pattern as SEARCH / NAV cases above,
                which simply don't render `renderTopBar()`. Keeps the map
                surface clean so the partner overlay owns the top of the
                screen. */}
            {partnerTab === null && !overviewChromeActive && renderTopBar()}

            {/* Layers button — top-right, below header (search bar 48px + gap 8px + mode pills 48px + 12px margin = 116px).
                Hidden while the partner overlay is open so the layers icon
                doesn't visually attach itself to the partners pill area —
                the overlay owns the top-right slot in that mode. */}
            {partnerTab === null && isMapVisuallyReady && !overviewChromeActive && (
              <div className="absolute right-4 z-[50] pointer-events-none" style={{ top: 'calc(52px + env(safe-area-inset-top, 0px) + 116px)' }}>
                <MapLayersControl liveCount={live.length} />
              </div>
            )}

            {/* HUD — z-[40]. Bottom offset accounts for carousel height + safe-area.
                Splash-gated so the FAB (+) and recenter button reveal with the
                rest, rather than sitting hidden behind the skeleton during load. */}
            {isMapVisuallyReady && (
            <div className="absolute right-4 z-[40] flex flex-col gap-3" style={{ bottom: 'calc(max(340px, env(safe-area-inset-bottom, 0px) + 310px))' }}>
              {!embedPreset && (
                <ActionSpeedDial
                  onAdd={() => setWizardOpen(true)}
                  onReport={() => setReportOpen(true)}
                />
              )}
              <button
                onClick={() => {
                  // Also exits viewport-search mode and resets the pan baseline
                  // so the button only reappears after the next deliberate pan.
                  useMapStore.getState().setViewportSearchActive(false);
                  if (viewportBounds) refBoundsRef.current = viewportBounds;
                  logic.handleLocationClick(); // GPS refresh + permission prompt when no fix
                  onRecenter?.();                // center the camera on the best-available fix
                }}
                className="w-12 h-12 rounded-full shadow-xl flex items-center justify-center bg-white pointer-events-auto active:scale-95 transition-all"
              >
                <Navigation size={20} fill={logic.isFollowing ? BRAND_COLOR : 'none'} color={logic.isFollowing ? BRAND_COLOR : GRAY_COLOR} />
              </button>
            </div>
            )}

            {/* ── Bottom content: single premium carousel for ALL route types ── */}
            {mapMode === 'discover' && allDisplayRoutes.length > 0 && (
              <BottomJourneyContainer
                routes={allDisplayRoutes}
                onRouteFocus={(r) => {
                  logic.setFocusedRoute(r);
                }}
                focusedRouteId={logic.focusedRoute?.id || null}
                loadingRouteIds={logic.loadingRouteIds}
                onShowDetails={() => logic.setShowDetailsDrawer(true)}
                onStartWorkout={logic.startActiveWorkout}
                onShowRouteDetail={(r) => {
                  logic.setSelectedRoute(r);
                  logic.setFocusedRoute(r);
                }}
              />
            )}

            {/* ── On-map hybrid entry ("מה עושים היום?") — idle only, flag-gated.
                Opens the slot layer (resetHybridFlow('slots') — passive, no compose). */}
            {HYBRID_SLOTS_ENABLED && !embedPreset && mapMode === 'idle' && isMapVisuallyReady && (
              <div
                className="absolute left-0 right-0 z-[100] pointer-events-none"
                style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)' }}
              >
                <ShimmerPhraseButton
                  messages={ENTRY_PHRASES}
                  onTap={() => {
                    // Passive entry: open the slot carousel only. resetHybridFlow
                    // sets freeRunStep='slots' explicitly (no effect race, no
                    // 'config' flash) and clears any prior composed plan. NO
                    // compose here — that happens only on a card's "צא לדרך" CTA.
                    // eslint-disable-next-line no-console
                    console.log('[compose-trigger]', 'entry-open (passive, no compose)');
                    resetHybridFlow('slots');
                    setMapMode('freeRun');
                  }}
                  className="px-6 pointer-events-auto"
                />
              </div>
            )}

            {/* ── Free-run flow — two stages, mutually exclusive ─────────
                Stage 1: FreeRunDrawer (activity chips + goal + start CTAs).
                Stage 2: RouteCarousel (floating route cards over the map) —
                         only entered when the user taps "עם מסלול".
                Both guarded by `mapMode === 'freeRun'`. */}
            {mapMode === 'freeRun' && freeRunStep === 'config' && (
              <FreeRunDrawer
                currentActivity={logic.preferences.activity}
                onActivityChange={(activity) => logic.handleActivityChange(activity)}
                onStartWorkout={logic.startActiveWorkout}
                onClose={() => setMapMode('idle')}
                userPosition={userLocation}
                cityName={userCityName}
                onRequestRouteGeneration={({ targetKm, includeStrength, surface }) => {
                  setRouteCarouselConfig({ targetKm, includeStrength, surface });
                  setFreeRunStep('route');
                }}
                onStartHybrid={HYBRID_SLOTS_ENABLED && !embedPreset ? (intent) => {
                  // Route-preview title bar (MAP_OVERVIEW_CHROME_V1): the drawer has no
                  // slot title, so derive an aerobic+כוח label. No-op when flag is off.
                  setOverviewTitle(intent.aerobicKind === 'running' ? 'ריצה + כוח' : 'הליכה + כוח');
                  composeAndShowOverview(intent, 'config');
                } : undefined}
              />
            )}

            {/* ── Hybrid slot layer (Phase 1) — "מה עושים היום?" floating carousel.
                Shares the z-[100] free-run overlay tier with HybridOverviewScreen
                (mutually exclusive freeRunStep). Flag-gated → byte-identical when off. */}
            {HYBRID_SLOTS_ENABLED && mapMode === 'freeRun' && freeRunStep === 'slots' && (
              <HybridSlotCarousel
                slots={slots}
                loading={hybridComposing}
                aerobicKind={slotActivity}
                onActivityChange={setSlotActivity}
                onSelectSlot={handleSelectSlot}
                onSettleSlot={handleSettleSlot}
                computingPreview={hybridPreviewComposing}
                onBuildYourself={() => resetHybridFlow('config')}
                onClose={() => { resetHybridFlow(); setMapMode('idle'); }}
              />
            )}

            {/* Hybrid overview (phase ב) — bottom sheet over the map; route shown behind. */}
            {mapMode === 'freeRun' && freeRunStep === 'overview' && hybridComposed && (
              <HybridOverviewScreen
                composed={hybridComposed}
                cityName={userCityName}
                onExerciseTap={(we) => setHybridDetailEx(we)}
                onSwapExercise={(segIndex, exIndex, we) =>
                  setHybridSwap({ segIndex, exIndex, exercise: we?.exercise, level: we?.programLevel ?? we?.exercise?.level ?? 1 })
                }
                onBack={() => { setFreeRunStep(overviewBackStep); logic.setFocusedRoute(null); }}
                onStart={() => {
                  const c = hybridComposed;
                  import('@/features/workout-engine/hybrid/start-hybrid-session').then(({ runHybridPlan }) => {
                    runHybridPlan(c, logic.startActiveWorkout);
                  });
                }}
              />
            )}

            {/* Route-preview title bar — replaces the folded top chrome while the
                overview drawer is up (MAP_OVERVIEW_CHROME_V1). Same back closure as
                the drawer's onBack. Slides down on open, up on close. The outer flag
                guard keeps the tree byte-identical when the feature is off. */}
            {MAP_OVERVIEW_CHROME_V1 && (
              <AnimatePresence>
                {overviewChromeActive && (
                  <motion.div
                    key="overview-title-bar"
                    className="absolute inset-x-0 top-0 z-[70] pointer-events-none"
                    initial={{ y: -160, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -160, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                  >
                    <OverviewTitleBar
                      title={overviewTitle}
                      onBack={() => { setFreeRunStep(overviewBackStep); logic.setFocusedRoute(null); }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            )}

            {/* Real preview detail drawer (tap) — same component the workout preview uses. */}
            {mapMode === 'freeRun' && freeRunStep === 'overview' && (
              <ExerciseDetailDrawer
                detailExercise={hybridDetailEx}
                programMap={hybridProgramMap}
                onDismiss={() => setHybridDetailEx(null)}
              />
            )}

            {/* Real replacement modal (swap) — choose an alternative → mutate the plan. */}
            {mapMode === 'freeRun' && freeRunStep === 'overview' && hybridSwap && profile && (
              <ExerciseReplacementModal
                isOpen
                onClose={() => setHybridSwap(null)}
                currentExercise={hybridSwap.exercise}
                currentLevel={hybridSwap.level}
                location={'park' as ExecutionLocation}
                park={null}
                userProfile={profile as any}
                onReplace={(newExercise, executionMethod) => {
                  // Stability: mutate hybridComposed at [segIndex][exIndex], keeping the
                  // prescription (sets/reps/rest). runHybridPlan runs the swapped plan.
                  const { segIndex, exIndex } = hybridSwap;
                  setHybridComposed((prev) => {
                    if (!prev) return prev;
                    const seg: any = prev.plan.segments[segIndex];
                    if (!seg || seg.kind !== 'strength' || !seg.content) return prev;
                    const exercises: any[] = [...(seg.content.exercises ?? [])];
                    const current = exercises[exIndex];
                    if (!current) return prev;
                    exercises[exIndex] = { ...current, exercise: newExercise, method: executionMethod, wasSwapped: true };
                    const newSeg = { ...seg, content: { ...seg.content, exercises } };
                    const segments = prev.plan.segments.map((s, i) => (i === segIndex ? newSeg : s));
                    return { ...prev, plan: { ...prev.plan, segments } };
                  });
                  setHybridSwap(null);
                }}
              />
            )}

            {mapMode === 'freeRun' && hybridComposing && (
              <div className="absolute inset-0 z-[101] flex items-center justify-center bg-black/20 pointer-events-auto">
                <div className="bg-white rounded-2xl px-5 py-3 text-[14px] font-black text-gray-800 shadow-xl">מכין אימון משולב…</div>
              </div>
            )}

            {mapMode === 'freeRun' &&
              freeRunStep === 'route' &&
              userLocation &&
              routeCarouselConfig && (
                <RouteCarousel
                  userPosition={userLocation}
                  activity={logic.preferences.activity}
                  targetKm={routeCarouselConfig.targetKm}
                  includeStrength={routeCarouselConfig.includeStrength}
                  surface={routeCarouselConfig.surface}
                  cityName={userCityName}
                  // Bidirectional sync: when the user taps a route line on
                  // the map, the parent's focusedRoute updates and the
                  // carousel scrolls to the matching card. The carousel
                  // filters self-emitted ids via its own ref so this
                  // doesn't create an echo loop with onFocusChange below.
                  focusedRouteId={logic.focusedRoute?.id ?? null}
                  onFocusChange={(route) => {
                    // Sync the centered card to `focusedRoute` so the
                    // camera fitBounds-debounce in useCameraController
                    // reframes the map. Debounced inside the carousel so
                    // a fast multi-card flick fires this exactly once at
                    // the destination — not N times during the swipe.
                    logic.setFocusedRoute(route);
                  }}
                  onBack={() => {
                    // Drop the carousel and return to the config drawer.
                    // Clearing `focusedRoute` keeps the map in its
                    // pre-route state so the user doesn't see a stray
                    // highlight on the empty map.
                    logic.setFocusedRoute(null);
                    setFreeRunStep('config');
                  }}
                  onSelect={(route) => {
                    // Pin the chosen route as the focus so the active-workout
                    // overlay opens with it pre-selected, then exit free-run
                    // mode and kick off the same start path as discover.
                    logic.setFocusedRoute(route);
                    setMapMode('idle');
                    logic.startActiveWorkout();
                  }}
                />
              )}

            {/* ── Partner Finder flow ─────────────────────────────────
                State machine: radar (transient) → overlay.
                PartnerBubbles is kept but no longer rendered — the mode
                button tap goes straight to radar with default tab='live'.
                AnimatePresence honours per-component exit animations. */}
            <AnimatePresence>
              {mapMode === 'partners' && showRadar && pendingTab && (
                <RadarAnimation
                  key="partner-radar"
                  tab={pendingTab}
                  isCached={!isLoading}
                  onComplete={handleRadarComplete}
                  // Partner search uses the slower 3 s tempo — feels
                  // like a more thorough scan for the right people.
                  mode="partners"
                />
              )}
            </AnimatePresence>

            <AnimatePresence>
              {mapMode === 'partners' && partnerTab !== null && (
                <PartnerOverlay
                  key="partner-overlay"
                  initialTab={partnerTab}
                  userLocation={userLocation}
                  live={live}
                  scheduled={scheduled}
                  isLoading={isLoading}
                  onClose={handlePartnerOverlayClose}
                  onFiltersChange={handlePartnerFiltersChange}
                />
              )}
            </AnimatePresence>
          </>
        );
    }
  }

  return (
    <>
      {renderScreen()}

      {/* ═══ Global overlays — always available, never conflict ═══ */}
      {logic.isGenerating && <RouteGenerationLoader />}

      {process.env.NODE_ENV !== 'production' && !embedPreset && devSim && <MockLocationPanel devSim={devSim} />}

      <ContributionWizard
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        initialLocation={logic.currentUserPos}
      />
      <QuickReportSheet
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        userLocation={logic.currentUserPos ?? null}
      />

      {/* Saved-places editor — opened from the Quick Row tap-to-set
          flow OR from the NavigationHub overlay's smart Home/Work
          tile when the slot is empty. Self-closes on save / cancel. */}
      <SetSavedPlaceSheet
        openKind={setPlaceSheetKind}
        onClose={() => setSetPlaceSheetKind(null)}
      />
    </>
  );
}
