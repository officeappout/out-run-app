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

import { useState, useRef, useEffect, useMemo } from 'react';
import { Ruler, Clock, MapPin, Play, ArrowRight, Info, ChevronLeft, ChevronDown } from 'lucide-react';
import { motion, useDragControls, useMotionValue, useTransform, animate } from 'framer-motion';
import DifficultyBolts from '@/features/workout-engine/components/DifficultyBolts';
import CaloriesChip from '@/components/ui/CaloriesChip';
import WeightInlineRow from '@/components/ui/WeightInlineRow';
import { resolveIconKey, getProgramIcon } from '@/features/content/programs/core/program-icon.util';
import HybridJourneyAxis from './HybridJourneyAxis';
import { useSheetDrag, type SheetAnchor, type SheetMeasurements } from '@/features/workout-engine/shared/hooks/useSheetDrag';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import { HYBRID_AER as AER, HYBRID_STR as STR } from './hybrid-colors'; // single source (point 15)
import type { ComposedHybridSession } from '@/features/workout-engine/hybrid/start-hybrid-session';

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

function Chip({ icon, children, tint }: { icon: React.ReactNode; children: React.ReactNode; tint?: string }) {
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
}

export default function HybridOverviewScreen({ composed, cityName, onStart, onBack, onExerciseTap, onSwapExercise }: Props) {
  const { fallbackHint, aerobicKind } = composed;
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
  const totalMin = Math.round((t.aerobicMin ?? 0) + (t.strengthMin ?? 0));

  // Route description (point 11). ⚠️ TEMPORARY placeholder copy, generated from the
  // composed plan. The real per-route descriptions will come from the ADMIN PANEL —
  // do NOT invest in this wording; replace the whole string when the panel source
  // lands. Neutral "מסלול" on purpose (NOT "לולאה" — today's route is out-and-back,
  // not a loop).
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

  // Moovit-style at-a-glance sequence (RTL): walk-leg (mins) › station (program icon
  // + "כוח") › walk-leg … Built from the SAME composed segments the axis renders, and
  // both icons come from the shared program-icon map — no new icon logic.
  const journeyStrip: JSX.Element[] = [];
  plan.segments.forEach((seg, i) => {
    if (journeyStrip.length > 0) {
      journeyStrip.push(<ChevronLeft key={`sep${i}`} size={16} style={{ color: '#CBD5E1', flexShrink: 0 }} />);
    }
    if (seg.kind === 'aerobic') {
      const kind = seg.aerobicType ?? aerobicKind; // 'walking' → WalkingIcon · 'running' → RunIcon
      journeyStrip.push(
        <span key={`leg${i}`} className="inline-flex items-center gap-1.5 text-[14px] font-bold whitespace-nowrap" style={{ color: '#374151' }}>
          <span className="inline-flex" style={{ color: AER }}>{getProgramIcon(resolveIconKey(kind === 'walking' ? 'walking' : 'running'), 'w-[19px] h-[19px]')}</span>
          {Math.round((seg.durationSec ?? 0) / 60)} דק׳
        </span>,
      );
    } else {
      // domainFocus = the station's program (push | pull | legs_core). The shared map
      // keys legs/core separately, so legs_core → legs for the icon lookup.
      const alias = seg.domainFocus === 'legs_core' ? 'legs' : seg.domainFocus;
      journeyStrip.push(
        <span key={`stn${i}`} className="inline-flex items-center gap-1.5 text-[14px] font-extrabold whitespace-nowrap" style={{ color: '#0E7490' }}>
          <span className="inline-flex" style={{ color: STR }}>{getProgramIcon(resolveIconKey(alias), 'w-[19px] h-[19px]')}</span>
          {Math.round((seg.durationSec ?? 0) / 60)} דק׳
        </span>,
      );
    }
  });

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

  // Point 15: publish the station fractions for the map route gradient (cleared on
  // unmount so non-hybrid routes render with their normal flat color).
  const setHybridRouteStations = useMapStore((s) => s.setHybridRouteStations);
  useEffect(() => {
    setHybridRouteStations(routeStationFracs);
  }, [routeStationFracs, setHybridRouteStations]);
  useEffect(() => () => setHybridRouteStations(null), [setHybridRouteStations]);

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
        style={{ y: sheetY, touchAction: 'none' }}
      >
        <motion.div
          ref={cardRef}
          className="absolute top-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl pointer-events-auto flex flex-col overflow-hidden"
          style={{
            height: cardHeight,
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
          }}
          data-anchor={currentAnchor}
        >
          {/* grabber = the drag handle (+ back button) */}
          <div className="relative pt-3 px-4 flex-shrink-0" onPointerDown={(e) => dragControls.start(e)}
            style={{ touchAction: 'none', cursor: 'grab' }}>
            <div className="mx-auto rounded-full" style={{ width: 36, height: 5, background: '#E2E8F0' }} />
            <button type="button" onClick={onBack} aria-label="חזור"
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute top-3 left-4 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform">
              <ArrowRight size={16} className="text-gray-600" />
            </button>
          </div>

          {/* ── Sticky summary header (point 3) — stays fixed while the body scrolls.
              Doubles as a drag zone via the SAME proven pattern as the grabber
              (onPointerDown → dragControls.start + touch-action:none). Moovit pins
              the ROUTE summary (duration · finish), not a station name. ── */}
          <div
            className="px-4 pt-0.5 pb-2 flex-shrink-0"
            onPointerDown={(e) => dragControls.start(e)}
            style={{ touchAction: 'none', cursor: 'grab' }}
          >
            {composed.bolts ? (
              /* full-park: ONE unified title row — title · duration · finish */
              <div className="flex items-center gap-1.5 flex-wrap text-[13px]">
                <span className="text-[18px] font-black" style={{ color: '#111827' }}>אימון משולב</span>
                <span style={{ color: '#D1D5DB' }}>·</span>
                <span className="font-black" style={{ color: '#374151' }}>{totalMin} דק׳</span>
                <span style={{ color: '#D1D5DB' }}>·</span>
                <span className="font-bold" style={{ color: '#6B7280' }}>מסיים ~{finishClock}</span>
              </div>
            ) : (
              <>
                <div className="text-[18px] font-black" style={{ color: '#111827' }}>אימון משולב</div>
                {/* total workout time + estimated finish (Moovit-style "18 דקות | שעת הגעה 19:58") */}
                <div className="flex items-center gap-1.5 text-[13px] mt-1" style={{ color: '#374151' }}>
                  <span className="font-black">{totalMin} דק׳</span>
                  <span style={{ color: '#D1D5DB' }}>·</span>
                  <span className="font-bold" style={{ color: '#6B7280' }}>מסיים ~{finishClock}</span>
                </div>
              </>
            )}
          </div>

          {/* Moovit strip — the enlarged primary nav element (point 10). Shown at
              EVERY detent incl. peek (point 9/10 decision): it's the route summary,
              no sense hiding it exactly when the map is visible. peek is a fixed px
              height sized to include it. touch-action:pan-x keeps horizontal scroll;
              vertical gestures are handled by the grabber/summary drag zone above. */}
          <div className="px-4 pb-2.5 flex-shrink-0">
            <div className="overflow-x-auto" style={{ touchAction: 'pan-x', scrollbarWidth: 'none' }}>
              <div className="inline-flex items-center gap-2.5 bg-white rounded-xl"
                style={{ border: '0.5px solid #E0E9FF', boxShadow: '0 3px 14px rgba(0,0,0,.07)', padding: '11px 15px' }}>
                {journeyStrip}
              </div>
            </div>
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
          >
            {/* A3 fallback banner */}
            {fallbackHint && (
              <div className="flex items-center gap-2 mt-3 rounded-xl text-[12px] font-bold" style={{ background: '#FFFBEB', border: '0.5px solid #FDE68A', color: '#B45309', padding: '9px 12px' }}>
                <Info size={15} /> {fallbackHint}
              </div>
            )}

            {composed.bolts ? (
              /* full-park: "פירוט" collapsible (defaultOpen=false) — stats now, container for future detail */
              <div className="mt-3">
                <button type="button" onClick={() => setDetailOpen((o) => !o)} aria-expanded={detailOpen}
                  className="flex items-center gap-1 text-[12px] font-black active:scale-[0.98] transition-transform" style={{ color: '#6B7280', letterSpacing: '.03em' }}>
                  <ChevronDown size={15} style={{ transform: detailOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} /> פירוט
                </button>
                {detailOpen && (
                  <div className="mt-2">
                    {/* Route description in prose (point 11) — replaces the old location row */}
                    <div className="flex items-start gap-1.5 text-[12.5px] leading-relaxed mb-2.5" style={{ color: '#4B5563' }}>
                      <MapPin size={14} style={{ color: '#9CA3AF', flexShrink: 0, marginTop: 2 }} /> {routeDesc}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Chip icon={<Ruler size={15} />} tint={AER}>{t.distanceKm?.toFixed(1)} ק״מ</Chip>
                      <CaloriesChip calories={t.estCalories ?? 0} weightDependent onEditWeight={() => setShowWeightNudge(true)} />
                    </div>
                    {showWeightNudge && <WeightInlineRow onSaved={() => setShowWeightNudge(false)} />}
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* chips */}
                <div className="flex gap-2 mt-3 flex-wrap">
                  <Chip icon={<Ruler size={15} />} tint={AER}>{t.distanceKm?.toFixed(1)} ק״מ</Chip>
                  <Chip icon={<Clock size={15} />}>{totalMin} דק׳</Chip>
                  <CaloriesChip calories={t.estCalories ?? 0} weightDependent onEditWeight={() => setShowWeightNudge(true)} />
                </div>
                {showWeightNudge && <WeightInlineRow onSaved={() => setShowWeightNudge(false)} />}
              </>
            )}

            {/* meta row — difficulty carousel (full-park, קל/בינוני/קשה with emergent
                minutes) or, for budget-split cards, the original static bolts pill */}
            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
              {composed.bolts ? (
                <div className="flex w-full items-stretch bg-white rounded-full" role="group" aria-label="בחירת עצימות"
                  style={{ border: '0.5px solid #E0E9FF', boxShadow: '0 2px 12px rgba(0,0,0,.05)', padding: 3, gap: 3 }}>
                  {composed.bolts.labels.map((label, i) => {
                    const bt = composed.bolts!.plans[i].totals;
                    const bmin = Math.round((bt.aerobicMin ?? 0) + (bt.strengthMin ?? 0));
                    const active = i === boltIndex;
                    return (
                      <button key={label} type="button" onClick={() => selectBolt(i)} aria-pressed={active}
                        className="flex-1 flex flex-col items-center justify-center gap-0.5 rounded-full active:scale-[0.98] transition-all duration-200"
                        style={{ padding: '7px 6px', background: active ? STR_TINT : 'transparent' }}>
                        {/* graduated bolts via the shared DifficultyBolts (reuse, not modified): קליל 1 / מאוזן 2 / עוצמתי 3 */}
                        <DifficultyBolts difficulty={(i + 1) as 1 | 2 | 3} size="sm" />
                        <span className="text-[11px] font-bold whitespace-nowrap" style={{ color: active ? STR_TEXT : '#6B7280' }}>
                          {label} · {bmin}׳
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <span className="inline-flex items-center bg-white rounded-lg" style={{ border: '0.5px solid #E0E9FF', boxShadow: '0 2px 12px rgba(0,0,0,.05)', padding: '4px 10px' }}>
                  <DifficultyBolts difficulty={2} size="sm" />
                </span>
              )}
            </div>

            {/* axis */}
            <div className="flex items-center gap-1.5 text-[12px] font-black mt-4 mb-2" style={{ color: '#6B7280', letterSpacing: '.03em' }}>
              מהלך האימון
            </div>
            <HybridJourneyAxis
              segments={plan.segments}
              stationName={composed.bolts ? composed.station?.name : undefined}
              isWarmupActive={isWarmupActive}
              isWarmupExpanded={isWarmupExpanded}
              onToggleWarmupActive={toggleWarmupActive}
              onToggleWarmupExpanded={toggleWarmupExpanded}
              onExerciseTap={onExerciseTap}
              onSwapExercise={onSwapExercise}
            />
            <div style={{ height: 8 }} />
          </div>

          {/* sticky CTA — pinned to the visible card bottom at every detent */}
          <div className="px-4 pt-2 flex-shrink-0">
            <button type="button" onClick={onStart} aria-label="התחל אימון משולב"
              className="w-full flex items-center justify-center gap-2 text-white text-[15px] font-black rounded-2xl active:scale-[0.97] transition-transform"
              style={{ height: 54, background: 'linear-gradient(to left, #0CF2E3, #00BAF7)' }}>
              <Play size={18} /> התחל אימון
            </button>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
