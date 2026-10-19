'use client';

/**
 * HybridOverviewScreen — the pre-run "מבט-על" for a composed hybrid session
 * (Phase ב). A DRAGGABLE bottom sheet over the LIVE map (the map behind shows the
 * generated route + station marker). Reuses the shared snap machinery
 * (useSheetDrag) with three detents — peek ~20% · half ~55% · full ~90%. Dragging
 * down to peek reveals the map + route behind (Moovit/Google pattern). STABILITY:
 * renders the SAME composed plan that will run — no re-compose.
 *
 * (Phase ד: "full → 3 route options" is not built yet — for now full just shows the
 * whole plan; peek only reveals the map.)
 */

import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { Ruler, MapPin, Play, ArrowRight, Info, ChevronLeft, ChevronDown } from 'lucide-react';
import { motion, useDragControls, useMotionValue, useTransform, animate } from 'framer-motion';
import DifficultyBolts from '@/features/workout-engine/components/DifficultyBolts';
import CaloriesChip from '@/components/ui/CaloriesChip';
import WeightInlineRow from '@/components/ui/WeightInlineRow';
import HybridJourneyAxis from './HybridJourneyAxis';
import { useSheetDrag, type SheetAnchor, type SheetMeasurements } from '@/features/workout-engine/shared/hooks/useSheetDrag';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import { MAP_OVERVIEW_CHROME_V1 } from '@/config/feature-flags';
import { HYBRID_AER as AER, HYBRID_WALK as WALK_LEG_COLOR } from './hybrid-colors'; // single source (point 15)
import { ActivityGlyph } from './activity-icons'; // single source for both axes (points 13/17)
import type { ComposedHybridSession } from '@/features/workout-engine/hybrid/start-hybrid-session';
import { ROUTE_STOPS_ROUND_TRIP_KEY, readRoundTripPref, displayTotalMin, buildWalkLegsGeoJSON } from '@/features/workout-engine/hybrid/round-trip';
import { setOnboardingPref } from '@/lib/onboardingPrefs';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';
import { HomeV2Context } from '@/features/home/context/HomeV2Context';
import { JourneyStrip, WorkoutOverviewHeader, type JourneyStripItem } from '@/components/ui/v2';

const ACCENT = '#00ADEF';
const STR_TINT = '#ECFEFF', STR_TEXT = '#0E7490'; // cyan tint/text from color-system.md (no new hex)

// Three detents as a fraction of the viewport that stays VISIBLE above the map.
// half/full are fractions of the viewport; peek is a FIXED px height (point 9).
// A fraction collapses the peek content on short screens (iPhone SE) — a fixed px
// (MetricsDrawer's PEEK_CARD_H pattern) keeps grabber + summary + the enlarged
// strip + CTA visible at peek on every device.
const DETENT_FRAC = { half: 0.55, full: 0.90 } as const;
const PEEK_PX = 220; // grabber(~17) + summary(~40) + enlarged strip(~55) + CTA(~62) + pad(~46)
type DetentId = 'peek' | 'half' | 'full';
const DETENT_ORDER: DetentId[] = ['peek', 'half', 'full']; // ascending size / descending Y

/** Visible card height (px) at a detent — the single source for all detent geometry. */
function detentHeightPx(id: DetentId, vh: number): number {
  if (id === 'peek') return Math.min(PEEK_PX, Math.round(vh * 0.5)); // never exceed half the screen on tiny devices
  return Math.round(vh * DETENT_FRAC[id]);
}
/** Card top Y (from screen top) = vh − visible height. */
function detentTopY(id: DetentId, vh: number): number {
  return vh - detentHeightPx(id, vh);
}

function buildAnchors(m: SheetMeasurements): SheetAnchor[] {
  return DETENT_ORDER.map((id) => ({
    id,
    yPx: detentTopY(id, m.vh),
    heightPx: detentHeightPx(id, m.vh),
  }));
}

function Chip({ icon, children, tint, v2 = false }: { icon: React.ReactNode; children: React.ReactNode; tint?: string; v2?: boolean }) {
  if (v2) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-[13px] font-bold text-v2-ink-2 shadow-v2-ring">
        <span style={{ color: tint ?? ACCENT }}>{icon}</span>{children}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 bg-white rounded-lg text-[12.5px] font-bold"
      style={{ border: '0.5px solid #E0E9FF', boxShadow: '0 2px 12px rgba(0,0,0,.05)', padding: '6px 11px', color: '#374151' }}>
      <span style={{ color: tint ?? ACCENT }}>{icon}</span>{children}
    </span>
  );
}

interface Props {
  composed: ComposedHybridSession;
  cityName?: string;
  onStart: () => void;
  onBack: () => void;
  /** Tap an exercise → the real preview detail drawer (owned by DiscoverLayer). */
  onExerciseTap?: (we: any) => void;
  /** Swap at [segIndex][exIndex] → the real replacement modal (owned by DiscoverLayer). */
  onSwapExercise?: (segIndex: number, exIndex: number, we: any) => void;
  /**
   * needs-assessment link follow-up: present ONLY when `composed.assessmentDomains`
   * is set (the fallback banner is the needsAssessment message, never a real rest
   * day) — renders the A3 banner below as a real link to the mini-questionnaire
   * (owned by DiscoverLayer, via startMiniDomainAssessment) instead of a dead end.
   */
  /**
   * Domain-assessment gate (David, 23-24.09.2026): now also invoked PER SEGMENT
   * from a locked station card (HybridJourneyAxis), passing that segment's own
   * assessmentDomains. Called with no args (or an empty array) for the
   * session-level banner below — the owner (DiscoverLayer) falls back to
   * `composed.assessmentDomains` in that case, unchanged from before.
   */
  onAssessmentLink?: (domains?: string[]) => void;
}

export default function HybridOverviewScreen({ composed, cityName, onStart, onBack, onExerciseTap, onSwapExercise, onAssessmentLink }: Props) {
  const { fallbackHint, aerobicKind } = composed;
  // Home v2 (enable_home_v2): the design-lab drawer — v2 surface sheet, white cards,
  // tinted segmented difficulty, round white icon button, the single gradient CTA.
  // Flag off = today's drawer, byte-for-byte.
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const v2 = useFeatureFlags(isSuperAdmin).flags.enableHomeV2;
  // Difficulty carousel (full-park only): 3 pre-composed bolt plans, swap by index —
  // NO re-compose. `plan` = the active bolt; budget-split cards have no `bolts` and
  // keep their single `composed.plan` unchanged.
  const [boltIndex, setBoltIndex] = useState(composed.bolts?.selectedIndex ?? 1);
  const plan = composed.bolts ? composed.bolts.plans[boltIndex] : composed.plan;
  const selectBolt = (i: number) => {
    setBoltIndex(i);
    if (composed.bolts) {
      // Keep the shared composed object in sync so the SAME object shown in the
      // overview is the one that runs at start (compose-once; see runHybridPlan).
      composed.bolts.selectedIndex = i;
      composed.plan = composed.bolts.plans[i];
    }
  };
  const t = plan.totals;
  // Round-trip (Phase 2, route_stops + published-route backbone only): walk-there + walk-back
  // are ADDED ON TOP of the workout minutes, for display. Default ON; durable pref.
  const roundTripLegs = composed.roundTrip ?? null;
  const [roundTripOn, setRoundTripOn] = useState<boolean>(readRoundTripPref);
  const toggleRoundTrip = () => {
    const next = !roundTripOn;
    setRoundTripOn(next);
    setOnboardingPref(ROUTE_STOPS_ROUND_TRIP_KEY, next ? '1' : '0');
  };
  const workoutMin = Math.round((t.aerobicMin ?? 0) + (t.strengthMin ?? 0));
  const totalMin = displayTotalMin(workoutMin, roundTripLegs, roundTripOn);

  // Route description (point 11). ⚠️ TEMPORARY placeholder copy, generated from the
  // composed plan. The real per-route descriptions will come from the ADMIN PANEL —
  // do NOT invest in this wording; replace the whole string when the panel source
  // lands. Neutral "מסלול" on purpose — this comment predates the full-park/route-stops
  // split and used to say "not a loop" because the ONLY shape back then was out-and-back
  // (composeFullParkWorkout). That's no longer true: composeHybridPlan's default branch
  // is an anchor-biased LOOP and composeRouteStopsWorkout's backbone is literally named
  // 'generated_loop' (verified 07-08.08.2026) — "מסלול" stays neutral now because this
  // screen renders all 3 route shapes, not because the route is never a loop.
  const stationCount = plan.segments.filter((s) => s.kind === 'strength').length;
  const stationsLabel = stationCount === 1 ? 'תחנת כוח אחת' : `${stationCount} תחנות כוח`;
  const routeDesc = `מסלול של ${t.distanceKm != null ? t.distanceKm.toFixed(1) : '—'} ק״מ עם ${stationsLabel} בדרך${cityName ? `, ב${cityName}` : ''}.`;

  // Point 15: strength-station positions as fractions (0..1) along the WALKING route
  // (cumulative aerobic km / total aerobic km). Fed to the map so it can paint the
  // green→blue→green line-gradient at each station — same source as the axis colors.
  const routeStationFracs = useMemo(() => {
    const total = plan.segments.filter((s) => s.kind === 'aerobic').reduce((a, s) => a + (s.distanceKm ?? 0), 0);
    if (total <= 0) return [];
    const fracs: number[] = [];
    let km = 0;
    for (const s of plan.segments) {
      if (s.kind === 'aerobic') km += s.distanceKm ?? 0;
      else if (s.kind === 'strength') fracs.push(Math.min(0.999, Math.max(0.001, km / total)));
    }
    return fracs;
  }, [plan]);
  const [showWeightNudge, setShowWeightNudge] = useState(false);
  // "פירוט" progressive-disclosure section (full-park only), collapsed by default.
  const [detailOpen, setDetailOpen] = useState(false);

  // Warmup skip/expand (full-park). Mirrors WorkoutPreviewDrawer's local state; the skip
  // is carried onto the SHARED composed object so the RUN strips the warmup (useHybridRun),
  // not just the display. Undefined composed.isWarmupActive = active (warmup runs).
  const [isWarmupActive, setIsWarmupActive] = useState(composed.isWarmupActive ?? true);
  const [isWarmupExpanded, setIsWarmupExpanded] = useState(true);
  const toggleWarmupActive = () =>
    setIsWarmupActive((v) => {
      const next = !v;
      composed.isWarmupActive = next;
      if (!next) setIsWarmupExpanded(false); // skip auto-collapses (matches the drawer)
      return next;
    });
  const toggleWarmupExpanded = () => setIsWarmupExpanded((v) => !v);

  // Estimated finish = now + total workout minutes → "HH:MM" (24h, zero-padded —
  // mirrors the run commute's formatArrivalClock convention). Estimate → "~" prefix.
  const finishAt = new Date(Date.now() + totalMin * 60_000);
  const finishClock = `${finishAt.getHours().toString().padStart(2, '0')}:${finishAt.getMinutes().toString().padStart(2, '0')}`;

  // Header title. route_stops ALSO carries `bolts` (a trio, like full_park) — `bolts`
  // truthiness alone can't tell the two apart. `fullParkRun===false` is the definitive
  // route_stops signal (composeRouteStopsWorkout sets it explicitly; full_park never
  // does, so it falls through to the existing bolts branch). David, 23.09.2026 — bug #2.
  // Domain-assessment gate (David, 23-24.09.2026): zero real stations resolved on this
  // route + unassessed → fallbackHint is set alongside a REAL (non-stub) plan here —
  // "don't call it a stations workout when there are no stations." Plain aerobic-kind
  // title instead; the nudge itself renders via the existing A3 fallback banner below.
  const overviewTitle = composed.fullParkRun === false
    // sessionTitle: enable_hybrid_cards_v2's smart walk ("הליכה + כוח"); absent → unchanged.
    ? (fallbackHint ? (aerobicKind === 'running' ? 'ריצה' : 'הליכה') : (composed.sessionTitle ?? 'מסלול + עצירות'))
    : composed.bolts
    ? (MAP_OVERVIEW_CHROME_V1 ? `אימון מלא בפארק · ${aerobicKind === 'running' ? 'ריצה' : 'הליכה'} + תחנת כוח` : 'אימון משולב')
    : 'אימון משולב';

  // Moovit-style at-a-glance sequence (RTL): walk-leg (mins) › station (program icon
  // + "כוח") › walk-leg … Built from the SAME composed segments the axis renders, and
  // both icons come from the shared program-icon map — no new icon logic.
  // Items for the shared JourneyStrip primitive (src/components/ui/v2/JourneyStrip,
  // extracted from this screen 19.10.2026 — same markup in both flag states).
  const journeyItems: JourneyStripItem[] = [];
  const showWalkLegs = roundTripOn && roundTripLegs != null;
  if (showWalkLegs && roundTripLegs!.walkThereMin > 0) journeyItems.push({ key: 'walk-there', kind: 'transport', seconds: roundTripLegs!.walkThereMin * 60 });
  plan.segments.forEach((seg, i) => {
    if (seg.kind === 'aerobic') {
      // 'walking' → WalkingIcon · 'running' → RunIcon
      journeyItems.push({ key: `leg${i}`, kind: 'aerobic', subtype: seg.aerobicType ?? aerobicKind, seconds: seg.durationSec });
    } else {
      // Strength icon varies by domainFocus (push→muscle · pull→target · legs→leg) —
      // the SAME mapping the vertical axis now uses (activity-icons, point 17).
      journeyItems.push({ key: `stn${i}`, kind: 'strength', subtype: seg.domainFocus, seconds: seg.durationSec });
    }
  });
  if (showWalkLegs && roundTripLegs!.walkBackMin > 0) journeyItems.push({ key: 'walk-back', kind: 'transport', seconds: roundTripLegs!.walkBackMin * 60 });

  const dragControls = useDragControls();
  const { cardRef, currentAnchor, controls, setAnchor, dragConstraints, viewportH } =
    useSheetDrag(buildAnchors, 'half', { velocityThreshold: 250 });
  // Card height = the current detent's visible height, so its top sits at the
  // anchor Y and its bottom stays flush with the screen bottom (CTA always visible).
  // Card height tracks the LIVE drag position, not the settled detent. The sheet
  // is `absolute top-0` inside a wrapper translated by `y`, so its visible height
  // must be (viewportH − y) for the bottom (CTA) to stay pinned to the screen
  // bottom throughout the gesture. useSheetDrag drives `y` via `controls`; we
  // mirror that into a MotionValue (`sheetY`) on the wrapper's style and derive
  // the height from it. Fixes the "card frozen at the start-detent height while
  // dragging" break (point-3 follow-up). useSheetDrag itself is untouched.
  const sheetY = useMotionValue(detentTopY('half', viewportH));
  const cardHeight = useTransform(sheetY, (v) => Math.max(0, Math.round(viewportH - v)));

  // ── Point 14: directional-step snap (variant B) ───────────────────────────
  // The shared useSheetDrag snaps by driving `controls`, but our visible position
  // is `sheetY` (style.y) and framer's `controls` do NOT drive an explicit style
  // MotionValue — so controls.start() never moved the sheet; only the drag CLAMP
  // held it, which is why only the two EXTREME detents (= the clamp bounds) locked
  // and the middle never did. So we drive `sheetY` ourselves with a spring and pick
  // the target by DIRECTION: a short pull steps ONE detent toward the drag
  // direction (half is always reachable, and it always locks); a strong flick may
  // jump straight to the far detent; a tiny nudge snaps back. useSheetDrag is
  // untouched — we still use setAnchor/currentAnchor (strip-collapse) + its
  // constraints. Live card height (point 3) is preserved: height derives from
  // sheetY, which the spring drives to the detent.
  const detentY = (id: DetentId) => detentTopY(id, viewportH);
  const STRONG_FLICK = 900; // px/s — above this, a flick may skip straight to the far detent
  const MOVE_MIN = 24; // px — below this net travel, treat as a nudge → snap back
  const springRef = useRef<{ stop: () => void } | null>(null);
  const springTo = (id: DetentId) => {
    springRef.current?.stop();
    springRef.current = animate(sheetY, detentY(id), { type: 'spring', stiffness: 320, damping: 30 });
  };
  const onDragEndSnap = (_e: unknown, info: { velocity: { y: number }; offset: { y: number } }) => {
    const found = DETENT_ORDER.indexOf(currentAnchor as DetentId);
    const cur = found >= 0 ? found : 1; // default to 'half'
    const vy = info.velocity.y, oy = info.offset.y;
    let idx = cur;
    if (vy < -STRONG_FLICK) idx = DETENT_ORDER.length - 1;               // strong up → full
    else if (vy > STRONG_FLICK) idx = 0;                                 // strong down → peek
    else if (oy < -MOVE_MIN) idx = Math.min(cur + 1, DETENT_ORDER.length - 1); // pull up → +1
    else if (oy > MOVE_MIN) idx = Math.max(cur - 1, 0);                  // pull down → -1
    // else: nudge → stay (idx = cur) → springs back to where it was
    const targetId = DETENT_ORDER[idx];
    if (targetId !== currentAnchor) setAnchor(targetId); // keep useSheetDrag anchor in sync
    springTo(targetId);                                  // move the visible sheet (always locks)
  };
  // Re-align sheetY to the current detent on viewport change (resize/rotate). Not
  // keyed on currentAnchor — those transitions are animated by springTo/drag.
  const currentAnchorRef = useRef(currentAnchor);
  currentAnchorRef.current = currentAnchor;
  useEffect(() => {
    sheetY.set(detentY((currentAnchorRef.current as DetentId) ?? 'half'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportH]);

  // ── Point 1: map↔drawer sync channel ──────────────────────────────────────
  // Report the settled visible height to the store on every detent LOCK
  // (currentAnchor changes only on lock — never per drag-frame), so
  // useCameraController can reframe the route in the free area above the drawer.
  // Value = detentHeightPx = exactly the height sheetY settles to (same source,
  // NOT recomputed geometry). Cleared on unmount so non-hybrid previews fall back.
  const setOverviewSheetHeightPx = useMapStore((s) => s.setOverviewSheetHeightPx);
  useEffect(() => {
    const id = (DETENT_ORDER.includes(currentAnchor as DetentId) ? currentAnchor : 'half') as DetentId;
    setOverviewSheetHeightPx(detentHeightPx(id, viewportH));
  }, [currentAnchor, viewportH, setOverviewSheetHeightPx]);
  useEffect(() => () => setOverviewSheetHeightPx(null), [setOverviewSheetHeightPx]);

  // Route-preview chrome (MAP_OVERVIEW_CHROME_V1): publish overview-active while this
  // drawer is mounted, so MapShell folds the AppHeader nav-bar and DiscoverLayer folds
  // search/pills/layers + shows the blue title bar. useLayoutEffect (not useEffect) so
  // the flag flips BEFORE paint — no one-frame flash of the full chrome on mount. The
  // gate readers no-op when the flag is OFF, so this stays inert until the flag is on.
  const setIsOverviewActive = useMapStore((s) => s.setIsOverviewActive);
  useLayoutEffect(() => {
    if (!MAP_OVERVIEW_CHROME_V1) return; // truly inert when off — field never changes, no extra re-renders
    setIsOverviewActive(true);
    return () => setIsOverviewActive(false);
  }, [setIsOverviewActive]);

  // Point 15: publish the station fractions for the map route gradient (cleared on
  // unmount so non-hybrid routes render with their normal flat color).
  const setHybridRouteStations = useMapStore((s) => s.setHybridRouteStations);
  useEffect(() => {
    setHybridRouteStations(routeStationFracs);
  }, [routeStationFracs, setHybridRouteStations]);
  useEffect(() => () => setHybridRouteStations(null), [setHybridRouteStations]);

  // Round-trip walk legs → dashed map overlay (null when the toggle is off / nothing drawable).
  const setHybridWalkLegs = useMapStore((s) => s.setHybridWalkLegs);
  useEffect(() => {
    setHybridWalkLegs(buildWalkLegsGeoJSON(roundTripLegs, roundTripOn));
  }, [roundTripLegs, roundTripOn, setHybridWalkLegs]);
  useEffect(() => () => setHybridWalkLegs(null), [setHybridWalkLegs]);

  // ── Point 2: content-scroll ↔ sheet-drag arbitration ──────────────────────
  // DELIBERATE local implementation — the shared useSheetScrollChain hook can't
  // drive this sheet (it wants a `y` MotionValue + onClose/dismiss; we have a
  // 3-detent sheet whose position IS a MotionValue, `sheetY`). So we reproduce its
  // PROVEN technique here: a NON-PASSIVE touchmove on the scroll body that claims
  // the gesture (preventDefault + drive `sheetY`). The rule (point 16, corrected):
  // while the sheet is NOT at full the content does NOT scroll at all — EVERY
  // vertical gesture, from anywhere in the body, moves the sheet (up → expand,
  // down → collapse). Only at the full detent does the content scroll normally;
  // there the sole sheet gesture is a pull-DOWN at scrollTop 0 → collapse (point 2).
  // Otherwise the touch scrolls the content untouched. Release routes through the
  // SAME onDragEndSnap as the grabber/summary (point 14): ONE snap path, not two.
  const scrollBodyRef = useRef<HTMLDivElement>(null);
  const onDragEndSnapRef = useRef(onDragEndSnap);
  onDragEndSnapRef.current = onDragEndSnap;
  useEffect(() => {
    const el = scrollBodyRef.current;
    if (!el) return;
    const minY = detentY('full'); // most expanded (smallest y)
    const maxY = detentY('peek'); // most docked (largest y)
    let chaining = false;
    let baseSheetY = 0, baseY = 0;
    let lastY = 0, lastT = 0, prevY = 0, prevT = 0;

    const onTouchStart = (e: TouchEvent) => {
      chaining = false;
      baseY = e.touches[0].clientY;
      lastY = prevY = baseY;
      lastT = prevT = performance.now();
    };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0].clientY;
      if (!chaining) {
        const dy = y - baseY;
        const atFull = currentAnchorRef.current === 'full';
        const atTop = el.scrollTop <= 0;
        // Not full → claim ANY vertical move (the content never scrolls here).
        // At full → claim only a pull-DOWN at the top → collapse; else scroll.
        const claim = atFull ? (dy > 0 && atTop) : (dy !== 0);
        if (claim) {
          chaining = true;
          baseY = y;                 // re-baseline so the sheet doesn't jump
          baseSheetY = sheetY.get();
          springRef.current?.stop();
        } else {
          return;                    // at full, off-top → let the content scroll
        }
      }
      e.preventDefault();            // non-passive → stops native scroll while chaining
      sheetY.set(Math.min(maxY, Math.max(minY, baseSheetY + (y - baseY))));
      prevY = lastY; prevT = lastT;
      lastY = y; lastT = performance.now();
    };
    const onTouchEnd = () => {
      if (!chaining) return;
      chaining = false;
      const dt = Math.max(1, lastT - prevT);
      const info = {
        velocity: { y: (lastY - prevY) / (dt / 1000) }, // px/s, same units as framer
        offset: { y: lastY - baseY },                   // downward positive
      };
      onDragEndSnapRef.current(null, info); // SAME directional-step snap as the grabber
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false }); // MUST be non-passive
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportH]);

  return (
    <div className="absolute inset-0 z-[100] pointer-events-none" dir="rtl">
      <motion.div
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={dragConstraints}
        dragElastic={0}
        dragMomentum={false}
        onDragStart={() => springRef.current?.stop()}
        onDragEnd={onDragEndSnap}
        animate={controls}
        className="absolute top-0 left-0 right-0 bottom-0 pointer-events-none"
        // Route-preview (MAP_OVERVIEW_CHROME_V1): this drag layer's `touch-action:none`
        // (ancestor of the scroll body) killed the native scroll that the EXISTING #16
        // detent handler's "at full → let content scroll" path relies on — so scroll at
        // full never worked with long full-park content. FIX mirrors the proven reference
        // WorkoutPreviewDrawer (workout-preview-drawer/WorkoutPreviewDrawer.tsx:354-396):
        // keep `touch-action:none` ONLY on the drag handle (grabber/header below), NOT on
        // this wrapper. `dragListener={false}` → framer drags only via the handle, so the
        // wrapper needs no touch-action. Leaving it unset (auto) lets the scroll body
        // scroll natively AND preserves the Moovit strip's `touch-action:pan-x` (a `pan-y`
        // here would have killed that horizontal scroll). Flag OFF = `none` (byte-identical).
        style={{ y: sheetY, touchAction: MAP_OVERVIEW_CHROME_V1 ? undefined : 'none' }}
      >
        <motion.div
          ref={cardRef}
          className={v2
            ? 'absolute top-0 left-0 right-0 bg-v2-surface rounded-t-[28px] shadow-v2-sheet pointer-events-auto flex flex-col overflow-hidden'
            : 'absolute top-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl pointer-events-auto flex flex-col overflow-hidden'}
          style={{
            height: cardHeight,
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
          }}
          data-anchor={currentAnchor}
        >
          {/* grabber = the drag handle (+ back button) */}
          <div className="relative pt-3 px-4 flex-shrink-0" onPointerDown={(e) => dragControls.start(e)}
            style={{ touchAction: 'none', cursor: 'grab' }}>
            {v2
              ? <div className="mx-auto h-1.5 w-10 rounded-full bg-v2-pill-border" />
              : <div className="mx-auto rounded-full" style={{ width: 36, height: 5, background: '#E2E8F0' }} />}
            <button type="button" onClick={onBack} aria-label="חזור"
              onPointerDown={(e) => e.stopPropagation()}
              className={v2
                ? 'absolute top-3 left-4 grid h-10 w-10 place-items-center rounded-full bg-white shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]'
                : 'absolute top-3 left-4 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform'}>
              <ArrowRight size={v2 ? 18 : 16} className={v2 ? 'text-v2-ink' : 'text-gray-600'} />
            </button>
          </div>

          {/* ── Sticky summary header (point 3) — stays fixed while the body scrolls.
              Doubles as a drag zone via the SAME proven pattern as the grabber
              (onPointerDown → dragControls.start + touch-action:none). Moovit pins
              the ROUTE summary (duration · finish), not a station name. ── */}
          <div
            className={v2 ? 'px-4 pt-1 pb-2.5 pl-16 flex-shrink-0' : 'px-4 pt-0.5 pb-2 flex-shrink-0'}
            onPointerDown={(e) => dragControls.start(e)}
            style={{ touchAction: 'none', cursor: 'grab' }}
          >
            {/* design-unification (05.08.2026): ONE row for every hybrid card — title ·
                duration · finish. Was full-park-only; budget-split ("הליכה+כוח") used to
                render a two-line layout here. Title TEXT is unchanged either way — only
                the layout unifies. */}
            <WorkoutOverviewHeader
              v2={v2}
              title={overviewTitle}
              meta={[
                { key: 'time', text: `${totalMin} דק׳`, tone: 'primary' },
                { key: 'finish', text: `מסיים ~${finishClock}`, tone: 'secondary' },
              ]}
            />
            {roundTripLegs && (
              <button
                type="button"
                dir="rtl"
                onClick={toggleRoundTrip}
                aria-pressed={roundTripOn}
                className={v2
                  ? `mt-2 inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-extrabold transition-transform duration-150 ease-v2 active:scale-[0.97] ${
                      roundTripOn ? 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40' : 'bg-white text-v2-ink-2 shadow-v2-ring'
                    }`
                  : 'mt-1.5 inline-flex items-center gap-1.5 rounded-full text-[11.5px] font-bold active:scale-[0.97] transition-transform'}
                style={v2 ? undefined : {
                  padding: '4px 10px',
                  background: roundTripOn ? `${ACCENT}14` : '#F3F4F6',
                  border: `1px solid ${roundTripOn ? ACCENT : 'transparent'}`,
                  color: roundTripOn ? '#0E7490' : '#6B7280',
                }}
              >
                {v2
                  ? <span aria-hidden className="inline-flex shrink-0" style={{ color: WALK_LEG_COLOR }}><ActivityGlyph kind="aerobic" subtype="walking" className="w-[15px] h-[15px]" /></span>
                  : <span aria-hidden>🚶</span>}
                {(() => {
                  const label = roundTripOn
                    ? `הלוך וחזור · כולל ${roundTripLegs.walkThereMin + roundTripLegs.walkBackMin} דק׳ הליכה אל המסלול וממנו`
                    : 'הוסף הליכה הלוך וחזור';
                  // v2: the pill is whitespace-nowrap + max-w-full, and the "on" label
                  // (~45 chars) is wider than the header's text column on a phone
                  // (pl-16 reserves the back button) — it ran out of the pill and was
                  // cut by the card's overflow-hidden. Truncate inside the pill.
                  return v2 ? <span className="min-w-0 truncate">{label}</span> : label;
                })()}
              </button>
            )}
          </div>

          {/* Moovit strip — the enlarged primary nav element (point 10). Shown at
              EVERY detent incl. peek (point 9/10 decision): it's the route summary,
              no sense hiding it exactly when the map is visible. peek is a fixed px
              height sized to include it. touch-action:pan-x keeps horizontal scroll;
              vertical gestures are handled by the grabber/summary drag zone above. */}
          <div className="px-4 pb-2.5 flex-shrink-0">
            <JourneyStrip items={journeyItems} v2={v2} />
          </div>

          {/* scroll body — overflow-x-hidden pins the content horizontally.
              overflow-y:auto alone makes the computed overflow-x:auto (CSS spec),
              so any sub-pixel-wide child let a horizontal drag rubber-band the
              whole body sideways. (The Moovit strip moved to the sticky header
              in point 3, so it no longer scrolls here — its horizontal scroll
              lives in the header with touch-action:pan-x.) */}
          <div
            ref={scrollBodyRef}
            className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pt-2"
            // #16 detent lock (MAP_OVERVIEW_CHROME_V1): a single static touch-action can't
            // both lock-at-half and scroll-at-full. Track the SETTLED detent — native
            // content scroll is allowed ONLY at `full` (pan-y); at peek/half `none` blocks
            // native scroll so every vertical gesture drives the sheet (the #16 expand),
            // while the non-passive scroll-body handler still runs. The wrapper stays `auto`
            // so the Moovit strip's pan-x survives in both states. Flag OFF = unset.
            style={MAP_OVERVIEW_CHROME_V1 ? { touchAction: currentAnchor === 'full' ? 'pan-y' : 'none' } : undefined}
          >
            {/* A3 fallback banner — needs-assessment link follow-up: when
                composed.assessmentDomains is set (needsAssessment, never a real
                rest day), the SAME approved copy (buildNeedsAssessmentResult)
                becomes a real tappable link to the mini-questionnaire instead of
                a dead end — matches the existing nudge-alongside-real-content
                pattern in ProgramsSection.tsx (dashed-border "טרם הוערך" cards)
                and StatsOverview.tsx (chip row, StatsOverview.tsx:1169-1193).
                Comment corrected (09.08.2026): this does NOT match
                WorkoutBuilderSheet, whose unassessed/unenrolled-domain path is a
                hard-blocking showUnlockModal, not a passive nudge beside real
                content — verified directly, not the same pattern. */}
            {fallbackHint && onAssessmentLink && composed.assessmentDomains?.length ? (
              <button
                type="button"
                onClick={() => onAssessmentLink()}
                className="w-full flex items-center gap-2 mt-3 rounded-xl text-[12px] font-bold text-start active:scale-[0.98] transition-transform"
                style={{ background: '#FFFBEB', border: '0.5px solid #FDE68A', color: '#B45309', padding: '9px 12px' }}
              >
                <Info size={15} className="flex-shrink-0" />
                <span className="flex-1 underline underline-offset-2">{fallbackHint}</span>
                <ChevronLeft size={15} className="flex-shrink-0" />
              </button>
            ) : fallbackHint && (
              <div className="flex items-center gap-2 mt-3 rounded-xl text-[12px] font-bold" style={{ background: '#FFFBEB', border: '0.5px solid #FDE68A', color: '#B45309', padding: '9px 12px' }}>
                <Info size={15} /> {fallbackHint}
              </div>
            )}
            {/* Budget light mode (enable_budget_light_mode): why this session is lighter. Flag off →
                composed.budgetLightNote is never set, nothing renders. */}
            {!fallbackHint && composed.budgetLightNote && (
              <div className="flex items-center gap-2 mt-3 rounded-xl text-[12px] font-bold" style={{ background: '#EFF9FE', border: '0.5px solid #BAE6FD', color: '#0369A1', padding: '9px 12px' }}>
                <Info size={15} className="flex-shrink-0" /> <span className="flex-1">{composed.budgetLightNote}</span>
              </div>
            )}

            {/* design-unification (05.08.2026): "פירוט" collapsible (defaultOpen=false) for
                EVERY hybrid card — was full-park-only; budget-split ("הליכה+כוח") used to
                render an always-visible chip row instead. routeDesc/t/showWeightNudge are
                all already computed generically above (not full-park-specific). */}
            <div className="mt-3">
              <button type="button" onClick={() => setDetailOpen((o) => !o)} aria-expanded={detailOpen}
                className={v2 ? 'flex items-center gap-1 whitespace-nowrap text-[13px] font-extrabold text-v2-deep transition-transform duration-150 ease-v2 active:scale-[0.97]' : 'flex items-center gap-1 text-[12px] font-black active:scale-[0.98] transition-transform'} style={v2 ? undefined : { color: '#6B7280', letterSpacing: '.03em' }}>
                <ChevronDown size={15} style={{ transform: detailOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} /> פירוט
              </button>
              {detailOpen && (
                <div className="mt-2">
                  {/* Route description in prose (point 11) — replaces the old location row */}
                  <div className={v2 ? 'flex items-start gap-1.5 text-[14px] leading-relaxed mb-2.5 text-v2-ink-2' : 'flex items-start gap-1.5 text-[12.5px] leading-relaxed mb-2.5'} style={v2 ? undefined : { color: '#4B5563' }}>
                    <MapPin size={14} style={{ color: v2 ? '#64748b' : '#9CA3AF', flexShrink: 0, marginTop: v2 ? 4 : 2 }} /> {routeDesc}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Chip icon={<Ruler size={15} />} tint={AER} v2={v2}>{t.distanceKm?.toFixed(1)} ק״מ</Chip>
                    <CaloriesChip calories={t.estCalories ?? 0} weightDependent onEditWeight={() => setShowWeightNudge(true)} />
                  </div>
                  {showWeightNudge && <WeightInlineRow onSaved={() => setShowWeightNudge(false)} />}
                </div>
              )}
            </div>

            {/* meta row — difficulty carousel (full-park, קל/בינוני/קשה with emergent
                minutes) or, for budget-split cards, the original static bolts pill */}
            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
              {composed.bolts ? (
                <div className={v2 ? 'flex w-full items-stretch bg-white rounded-full shadow-v2-ring' : 'flex w-full items-stretch bg-white rounded-full'} role="group" aria-label="בחירת עצימות"
                  style={v2 ? { padding: 4, gap: 4 } : { border: '0.5px solid #E0E9FF', boxShadow: '0 2px 12px rgba(0,0,0,.05)', padding: 3, gap: 3 }}>
                  {composed.bolts.labels.map((label, i) => {
                    const bt = composed.bolts!.plans[i].totals;
                    const bmin = Math.round((bt.aerobicMin ?? 0) + (bt.strengthMin ?? 0));
                    const active = i === boltIndex;
                    return (
                      <button key={label} type="button" onClick={() => selectBolt(i)} aria-pressed={active}
                        className={v2
                          ? `flex-1 flex flex-col items-center justify-center gap-0.5 rounded-full transition-all duration-150 ease-v2 active:scale-[0.97] ${active ? 'bg-v2-tint ring-1 ring-inset ring-v2-accent/40' : 'bg-transparent'}`
                          : 'flex-1 flex flex-col items-center justify-center gap-0.5 rounded-full active:scale-[0.98] transition-all duration-200'}
                        style={v2 ? { padding: '7px 6px' } : { padding: '7px 6px', background: active ? STR_TINT : 'transparent' }}>
                        {/* graduated bolts via the shared DifficultyBolts (reuse, not modified): קליל 1 / מאוזן 2 / עוצמתי 3 */}
                        <DifficultyBolts difficulty={(i + 1) as 1 | 2 | 3} size="sm" />
                        <span className={v2 ? `text-[12.5px] font-extrabold whitespace-nowrap ${active ? 'text-v2-deep' : 'text-v2-ink-2'}` : 'text-[11px] font-bold whitespace-nowrap'} style={v2 ? undefined : { color: active ? STR_TEXT : '#6B7280' }}>
                          {label} · {bmin}׳
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <span className={v2 ? 'inline-flex items-center bg-white rounded-full shadow-v2-ring' : 'inline-flex items-center bg-white rounded-lg'} style={v2 ? { padding: '5px 12px' } : { border: '0.5px solid #E0E9FF', boxShadow: '0 2px 12px rgba(0,0,0,.05)', padding: '4px 10px' }}>
                  <DifficultyBolts difficulty={2} size="sm" />
                </span>
              )}
            </div>

            {/* axis */}
            <div className={v2 ? 'flex items-center gap-1.5 whitespace-nowrap text-[17px] font-black !tracking-[-0.02em] text-v2-ink mt-5 mb-2.5' : 'flex items-center gap-1.5 text-[12px] font-black mt-4 mb-2'} style={v2 ? undefined : { color: '#6B7280', letterSpacing: '.03em' }}>
              מהלך האימון
            </div>
            {/* v2: provide HomeV2Context so the shared ExerciseCard rows render their v2 look
                (white row + thumbnail, ring instead of border). Value false = today. */}
            <HomeV2Context.Provider value={v2}>
            <HybridJourneyAxis
              v2={v2}
              segments={plan.segments}
              // design-unification (05.08.2026): HybridJourneyAxis is ALREADY purely
              // data-driven on stationName (its own docstring: "Omitted for budget-split
              // cards → legacy rendering unchanged" describes the OLD wiring, not a real
              // constraint) — dropping the composed.bolts gate here unifies leg titles,
              // the zone badge, meta-row format, the station header's collapsibility, and
              // exercise-section grouping for ANY session with a named station, full-park
              // or not. When composed.station is undefined (e.g. a bodyweight/A3 fallback),
              // this still correctly falls through to the legacy rendering — same as it
              // already does for full-park's own (rare) unnamed-station case.
              stationName={composed.station?.name}
              walkLegs={roundTripOn && roundTripLegs ? { thereMin: roundTripLegs.walkThereMin, backMin: roundTripLegs.walkBackMin } : null}
              isWarmupActive={isWarmupActive}
              isWarmupExpanded={isWarmupExpanded}
              onToggleWarmupActive={toggleWarmupActive}
              onToggleWarmupExpanded={toggleWarmupExpanded}
              onExerciseTap={onExerciseTap}
              onSwapExercise={onSwapExercise}
              onSegmentAssessmentLink={onAssessmentLink}
            />
            </HomeV2Context.Provider>
            <div style={{ height: 8 }} />
          </div>

          {/* sticky CTA — pinned to the visible card bottom at every detent */}
          <div className="px-4 pt-2 flex-shrink-0">
            <button type="button" onClick={onStart} aria-label="התחל אימון משולב"
              className={v2
                ? 'w-full h-12 flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-v2-cta text-[16px] font-extrabold text-v2-on-cta shadow-v2-cta transition-transform duration-150 ease-v2 active:scale-[0.97]'
                : 'w-full flex items-center justify-center gap-2 text-white text-[15px] font-black rounded-2xl active:scale-[0.97] transition-transform'}
              style={v2 ? undefined : { height: 54, background: 'linear-gradient(to left, #0CF2E3, #00BAF7)' }}>
              <Play size={18} className={v2 ? 'fill-current' : undefined} /> התחל אימון
            </button>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
