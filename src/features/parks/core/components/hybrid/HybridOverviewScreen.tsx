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

import { Ruler, Clock, Flame, Dumbbell, MapPin, Play, ArrowRight, Info } from 'lucide-react';
import { motion, useDragControls } from 'framer-motion';
import DifficultyBolts from '@/features/workout-engine/components/DifficultyBolts';
import HybridJourneyAxis from './HybridJourneyAxis';
import { useSheetDrag, type SheetAnchor, type SheetMeasurements } from '@/features/workout-engine/shared/hooks/useSheetDrag';
import type { ComposedHybridSession } from '@/features/workout-engine/hybrid/start-hybrid-session';

const ACCENT = '#00ADEF';
const AER = '#10B981', STR = '#F59E0B';

// Three detents as a fraction of the viewport that stays VISIBLE above the map.
const DETENT = { peek: 0.20, half: 0.55, full: 0.90 } as const;
type DetentId = keyof typeof DETENT;

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
  const { plan, fallbackHint } = composed;
  const t = plan.totals;
  const exCount = plan.segments.reduce((n, s) => n + (s.kind === 'strength' ? s.content?.exercises?.length ?? 0 : 0), 0);
  const totalMin = Math.round((t.aerobicMin ?? 0) + (t.strengthMin ?? 0));

  const dragControls = useDragControls();
  const { cardRef, currentAnchor, controls, handleDragEnd, dragConstraints, viewportH } =
    useSheetDrag(buildAnchors, 'half', { velocityThreshold: 250 });
  // Card height = the current detent's visible height, so its top sits at the
  // anchor Y and its bottom stays flush with the screen bottom (CTA always visible).
  const cardH = Math.round(viewportH * (DETENT[currentAnchor as DetentId] ?? DETENT.half));

  return (
    <div className="absolute inset-0 z-[100] pointer-events-none" dir="rtl">
      <motion.div
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={dragConstraints}
        dragElastic={0}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        animate={controls}
        className="absolute top-0 left-0 right-0 bottom-0 pointer-events-none"
        style={{ touchAction: 'none' }}
      >
        <div
          ref={cardRef}
          className="absolute top-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl pointer-events-auto flex flex-col overflow-hidden"
          style={{
            height: cardH,
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
            transition: 'height 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
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

          {/* scroll body */}
          <div className="flex-1 overflow-y-auto px-4 pt-2">
            <div className="text-[18px] font-black" style={{ color: '#111827' }}>אימון משולב</div>
            <div className="flex items-center gap-1.5 text-[12px] mt-0.5" style={{ color: '#6B7280' }}>
              <MapPin size={14} /> {cityName ?? 'קרוב אליך'} · לולאה עם תחנת כוח אחת
            </div>

            {/* A3 fallback banner */}
            {fallbackHint && (
              <div className="flex items-center gap-2 mt-3 rounded-xl text-[12px] font-bold" style={{ background: '#FFFBEB', border: '0.5px solid #FDE68A', color: '#B45309', padding: '9px 12px' }}>
                <Info size={15} /> {fallbackHint}
              </div>
            )}

            {/* chips */}
            <div className="flex gap-2 mt-3 flex-wrap">
              <Chip icon={<Ruler size={15} />} tint={AER}>{t.distanceKm?.toFixed(1)} ק״מ</Chip>
              <Chip icon={<Clock size={15} />}>{totalMin} דק׳</Chip>
              <Chip icon={<Flame size={15} />}>{t.estCalories} קק״ל</Chip>
              <Chip icon={<Dumbbell size={15} />} tint={STR}>{exCount} תרגילים</Chip>
            </div>

            {/* meta row */}
            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
              <span className="inline-flex items-center bg-white rounded-lg" style={{ border: '0.5px solid #E0E9FF', boxShadow: '0 2px 12px rgba(0,0,0,.05)', padding: '4px 10px' }}>
                <DifficultyBolts difficulty={2} size="sm" />
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg text-[11.5px] font-extrabold" style={{ background: '#FFFBEB', border: '0.5px solid #FDE68A', color: '#B45309', padding: '6px 10px' }}>
                <Flame size={13} /> אימון איכות משולב
              </span>
            </div>

            {/* axis */}
            <div className="flex items-center gap-1.5 text-[12px] font-black mt-4 mb-2" style={{ color: '#6B7280', letterSpacing: '.03em' }}>
              מהלך האימון
            </div>
            <HybridJourneyAxis segments={plan.segments} onExerciseTap={onExerciseTap} onSwapExercise={onSwapExercise} />
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
        </div>
      </motion.div>
    </div>
  );
}
