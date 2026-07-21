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

import { useState, useRef, useEffect } from 'react';
import { Ruler, Clock, MapPin, Play, ArrowRight, Info, ChevronLeft, ChevronDown } from 'lucide-react';
import { motion, useDragControls, useMotionValue, useTransform, animate } from 'framer-motion';
import DifficultyBolts from '@/features/workout-engine/components/DifficultyBolts';
import CaloriesChip from '@/components/ui/CaloriesChip';
import WeightInlineRow from '@/components/ui/WeightInlineRow';
import { resolveIconKey, getProgramIcon } from '@/features/content/programs/core/program-icon.util';
import HybridJourneyAxis from './HybridJourneyAxis';
import { useSheetDrag, type SheetAnchor, type SheetMeasurements } from '@/features/workout-engine/shared/hooks/useSheetDrag';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import type { ComposedHybridSession } from '@/features/workout-engine/hybrid/start-hybrid-session';

const ACCENT = '#00ADEF';
const AER = '#10B981', STR = '#00C9F2'; // strength = BRAND_CYAN (app-wide; color-system.md §4)
const STR_TINT = '#ECFEFF', STR_TEXT = '#0E7490'; // cyan tint/text from color-system.md (no new hex)

// Three detents as a fraction of the viewport that stays VISIBLE above the map.
const DETENT = { peek: 0.20, half: 0.55, full: 0.90 } as const;
type DetentId = keyof typeof DETENT;

// Point 2: minimum downward travel (px) at scrollTop 0 before a content touch is
// handed off from native scroll to the sheet drag. Small = responsive, but big
// enough to disambiguate a deliberate downward pull from tap jitter.
const SHEET_DRAG_HANDOFF_PX = 6;

/** yPx = card top (from screen top); visible height = vh − yPx = DETENT·vh. */
function buildAnchors(m: SheetMeasurements): SheetAnchor[] {
  return (Object.keys(DETENT) as DetentId[]).map((id) => ({
    id,
    yPx: Math.round(m.vh * (1 - DETENT[id])),
    heightPx: Math.round(m.vh * DETENT[id]),
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
      journeyStrip.push(<ChevronLeft key={`sep${i}`} size={13} style={{ color: '#CBD5E1', flexShrink: 0 }} />);
    }
    if (seg.kind === 'aerobic') {
      const kind = seg.aerobicType ?? aerobicKind; // 'walking' → WalkingIcon · 'running' → RunIcon
      journeyStrip.push(
        <span key={`leg${i}`} className="inline-flex items-center gap-1 text-[12.5px] font-bold whitespace-nowrap" style={{ color: '#374151' }}>
          <span className="inline-flex" style={{ color: AER }}>{getProgramIcon(resolveIconKey(kind === 'walking' ? 'walking' : 'running'), 'w-[15px] h-[15px]')}</span>
          {Math.round((seg.durationSec ?? 0) / 60)} דק׳
        </span>,
      );
    } else {
      // domainFocus = the station's program (push | pull | legs_core). The shared map
      // keys legs/core separately, so legs_core → legs for the icon lookup.
      const alias = seg.domainFocus === 'legs_core' ? 'legs' : seg.domainFocus;
      journeyStrip.push(
        <span key={`stn${i}`} className="inline-flex items-center gap-1 text-[12.5px] font-extrabold whitespace-nowrap" style={{ color: '#0E7490' }}>
          <span className="inline-flex" style={{ color: STR }}>{getProgramIcon(resolveIconKey(alias), 'w-[15px] h-[15px]')}</span>
          כוח
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
  const sheetY = useMotionValue(Math.round(viewportH * (1 - DETENT.half)));
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
  const DETENT_ORDER: DetentId[] = ['peek', 'half', 'full']; // ascending size / descending Y
  const detentY = (id: DetentId) => Math.round(viewportH * (1 - DETENT[id]));
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
  // Value = viewportH·DETENT = exactly the height sheetY settles to (same source,
  // NOT recomputed geometry). Cleared on unmount so non-hybrid previews fall back.
  const setOverviewSheetHeightPx = useMapStore((s) => s.setOverviewSheetHeightPx);
  useEffect(() => {
    const id = (currentAnchor in DETENT ? currentAnchor : 'half') as DetentId;
    setOverviewSheetHeightPx(Math.round(viewportH * DETENT[id]));
  }, [currentAnchor, viewportH, setOverviewSheetHeightPx]);
  useEffect(() => () => setOverviewSheetHeightPx(null), [setOverviewSheetHeightPx]);

  // ── Point 2: content-scroll ↔ sheet-drag arbitration ──────────────────────
  // DELIBERATE local implementation — the shared useSheetScrollChain hook can NOT
  // drive this sheet: it expects a `y` MotionValue + onClose (dismiss), whereas
  // useSheetDrag positions the sheet via useAnimation `controls` across three
  // detents (peek/half/full) with no MotionValue. So we reproduce the same
  // Instagram/Moovit arbitration locally: the drawer is draggable from the body
  // ONLY when it is scrolled to the top AND the user pulls DOWN; otherwise the
  // touch scrolls the content. We hand the gesture to the SAME dragControls the
  // grabber uses, so the release snap (onDragEndSnap, point 14) applies unchanged.
  // FUTURE: unify with useSheetScrollChain once that hook supports detent sheets
  // (feat/hybrid-drawer-ux · point 2). This is not an oversight.
  const scrollBodyRef = useRef<HTMLDivElement>(null);
  const dragGesture = useRef<{ id: number | null; startY: number; handedOff: boolean }>({
    id: null,
    startY: 0,
    handedOff: false,
  });
  const onScrollPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragGesture.current = { id: e.pointerId, startY: e.clientY, handedOff: false };
  };
  const onScrollPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = dragGesture.current;
    if (g.handedOff || g.id !== e.pointerId) return;
    const atTop = (scrollBodyRef.current?.scrollTop ?? 0) <= 0;
    const pullingDown = e.clientY - g.startY > SHEET_DRAG_HANDOFF_PX;
    if (atTop && pullingDown) {
      g.handedOff = true;
      dragControls.start(e); // → the existing detent drag (same as the grabber)
    }
  };
  const endScrollGesture = () => {
    dragGesture.current.id = null;
  };

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

          {/* Moovit strip — sticky below the summary, but COLLAPSES at peek so the
              low detent stays map-first (peek=0.20; two sticky rows would leave no
              room to scroll — measured). touch-action:pan-x keeps horizontal scroll;
              NO vertical drag-handoff here (that path is frozen — parking-lot #2).
              Drag the sheet from the grabber / summary above. */}
          {currentAnchor !== 'peek' && (
            <div className="px-4 pb-2 flex-shrink-0">
              <div className="overflow-x-auto" style={{ touchAction: 'pan-x', scrollbarWidth: 'none' }}>
                <div className="inline-flex items-center gap-2 bg-white rounded-lg"
                  style={{ border: '0.5px solid #E0E9FF', boxShadow: '0 2px 12px rgba(0,0,0,.05)', padding: '7px 11px' }}>
                  {journeyStrip}
                </div>
              </div>
            </div>
          )}

          {/* scroll body — overflow-x-hidden pins the content horizontally.
              overflow-y:auto alone makes the computed overflow-x:auto (CSS spec),
              so any sub-pixel-wide child let a horizontal drag rubber-band the
              whole body sideways. (The Moovit strip moved to the sticky header
              in point 3, so it no longer scrolls here — its horizontal scroll
              lives in the header with touch-action:pan-x.) */}
          <div
            ref={scrollBodyRef}
            onPointerDown={onScrollPointerDown}
            onPointerMove={onScrollPointerMove}
            onPointerUp={endScrollGesture}
            onPointerCancel={endScrollGesture}
            className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pt-2"
          >
            <div className="flex items-center gap-1.5 text-[12px] mt-0.5" style={{ color: '#6B7280' }}>
              <MapPin size={14} /> {cityName ?? 'קרוב אליך'} · לולאה עם תחנת כוח אחת
            </div>

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
                    <div className="flex gap-2 flex-wrap">
                      <Chip icon={<Ruler size={15} />} tint={AER}>{t.distanceKm?.toFixed(1)} ק״מ</Chip>
                      <CaloriesChip calories={t.estCalories ?? 0} weightDependent onEditWeight={() => setShowWeightNudge(true)} />
                    </div>
                    {showWeightNudge && <WeightInlineRow onSaved={() => setShowWeightNudge(false)} />}
                    {/* container for future expanded detail — no content yet */}
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
