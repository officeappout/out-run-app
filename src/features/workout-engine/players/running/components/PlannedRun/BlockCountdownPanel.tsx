'use client';

import React, { useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useRunningPlayer } from '../../store/useRunningPlayer';
import { usePlannedRunEngine } from '../../hooks/usePlannedRunEngine';

const LABEL_MAP: Record<string, string> = {
  surge: 'ספרינט',
  sprint: 'ספרינט',
  recovery: 'שחזור',
  warmup: 'חימום',
  cooldown: 'שחרור',
  run: 'ריצה',
  walk: 'הליכה',
  strides: 'מתגברות',
};

function hebrewLabel(raw: string): string {
  const lower = raw.toLowerCase().trim();
  for (const [eng, heb] of Object.entries(LABEL_MAP)) {
    if (lower.startsWith(eng)) return heb;
  }
  return raw;
}

export default function BlockCountdownPanel() {
  const { totalDistance } = useSessionStore();
  const blocks = useRunningPlayer((s) => s.currentWorkout?.blocks ?? []);
  const {
    currentBlock,
    currentBlockIndex,
    paceStatus,
    paceStatusColor,
    currentPaceSeconds,
    currentPaceFormatted,
    targetMinPace,
    targetMaxPace,
    showNumbers,
    blockMode,
    effortLabel,
  } = usePlannedRunEngine();

  if (!currentBlock) return null;

  const blockColor = currentBlock.colorHex || '#00ADEF';
  const targetDistKm = (currentBlock.distanceMeters ?? 0) / 1000;
  const safeDistance = totalDistance && isFinite(totalDistance) ? totalDistance : 0;

  const blockTitle = useMemo(() => {
    const name = hebrewLabel(currentBlock.label);
    const dist = currentBlock.distanceMeters ? ` ${currentBlock.distanceMeters} מ׳` : '';

    const sameType = blocks.filter(
      (b) => b.label === currentBlock.label && !b._isSynthesizedRest,
    );
    const indexInGroup = sameType.findIndex((b) => b.id === currentBlock.id);
    const counter =
      sameType.length > 1 ? ` (${indexInGroup + 1}/${sameType.length})` : '';

    return `${name}${dist}${counter}`;
  }, [currentBlock, blocks, currentBlockIndex]);

  return (
    <div
      className="w-full h-full flex flex-col justify-center px-6"
      style={{ fontFamily: 'var(--font-simpler)' }}
    >
      {/* ── Block name ── */}
      <div className="text-center" style={{ marginBottom: 8 }}>
        <span className="text-sm font-bold text-slate-500">{blockTitle}</span>
      </div>

      {/* ── Segmented Pace Gauge or Effort Badge ── */}
      {blockMode !== 'effort' ? (
        <SegmentedPaceGauge
          targetMinPace={targetMinPace}
          targetMaxPace={targetMaxPace}
          currentPaceSeconds={currentPaceSeconds}
          paceStatusColor={paceStatusColor}
          blockColor={blockColor}
          showNumbers={showNumbers}
        />
      ) : (
        <EffortBadge effortLabel={effortLabel} />
      )}

      {/* ── 8px gap ── */}
      <div style={{ height: 8 }} />

      {/* ── Hero Number (current pace) ── */}
      <div className="text-center">
        <motion.div
          key={currentBlockIndex}
          initial={{ scale: 0.95, opacity: 0.7 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-[4rem] font-black leading-none tabular-nums"
          style={{ color: paceStatus !== 'idle' ? paceStatusColor : '#111827' }}
          dir="ltr"
        >
          {currentPaceFormatted || '--:--'}
        </motion.div>
        <div
          className="text-slate-400 text-xs font-medium"
          style={{ marginTop: 8 }}
        >
          קצב הקפה
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="h-px bg-slate-200 mx-4" style={{ marginTop: 12 }} />

      {/* ── 24px gap ── */}
      <div style={{ height: 24 }} />

      {/* ── Distance stats (prominent) ── */}
      <div className="text-center" dir="ltr">
        <div className="text-[2rem] font-black text-slate-800 leading-none tabular-nums">
          {targetDistKm > 0 ? (
            <>
              <span className="text-slate-400 font-bold">
                {targetDistKm.toFixed(1)}
              </span>
              <span className="text-slate-300 mx-1">/</span>
              <span>{safeDistance.toFixed(2)}</span>
            </>
          ) : (
            <span>{safeDistance.toFixed(2)}</span>
          )}
        </div>
        <div className="text-slate-400 text-xs font-medium" style={{ marginTop: 4 }}>
          קילומטר
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Segmented Pace Gauge — 3 segments with 8px gaps
   Pace labels (14px font-black) centered inside the gaps
   ═══════════════════════════════════════════════════════════════════════════ */

interface SegmentedPaceGaugeProps {
  targetMinPace: number;
  targetMaxPace: number;
  currentPaceSeconds: number;
  paceStatusColor: string;
  blockColor: string;
  showNumbers: boolean;
}

function SegmentedPaceGauge({
  targetMinPace,
  targetMaxPace,
  currentPaceSeconds,
  paceStatusColor,
  blockColor,
  showNumbers,
}: SegmentedPaceGaugeProps) {
  const hasTarget = targetMinPace > 0 && targetMaxPace > 0;

  const { markerPercent, leftFlex, centerFlex, rightFlex } = useMemo(() => {
    if (!hasTarget)
      return { markerPercent: 50, leftFlex: 1, centerFlex: 2, rightFlex: 1 };

    const zoneWidth = targetMaxPace - targetMinPace;
    const padding = Math.max(zoneWidth * 0.5, 12);
    const gaugeMin = targetMinPace - padding;
    const gaugeMax = targetMaxPace + padding;
    const gaugeRange = gaugeMax - gaugeMin;

    const lf = (targetMinPace - gaugeMin) / gaugeRange;
    const cf = zoneWidth / gaugeRange;
    const rf = (gaugeMax - targetMaxPace) / gaugeRange;

    let marker = 50;
    if (currentPaceSeconds > 0) {
      const clamped = Math.max(gaugeMin, Math.min(gaugeMax, currentPaceSeconds));
      marker = ((clamped - gaugeMin) / gaugeRange) * 100;
    }

    return { markerPercent: marker, leftFlex: lf, centerFlex: cf, rightFlex: rf };
  }, [currentPaceSeconds, targetMinPace, targetMaxPace, hasTarget]);

  // Throttled spring for the marker dot.
  // GPS pace can arrive multiple times per second; recalculating a new spring
  // target on every tick drives continuous layout work on the UI thread.
  // Instead we update the MotionValue at most 5 Hz (200 ms gate) and let
  // the spring physics run in Framer's own rAF loop, completely decoupled
  // from React renders.
  const lastUpdateRef = useRef<number>(Date.now() - 201);
  const markerLeftMV = useMotionValue(markerPercent);
  const springLeft = useSpring(markerLeftMV, { stiffness: 150, damping: 22, restDelta: 0.5 });
  const leftStyle = useTransform(springLeft, (v: number) => `${v}%`);

  useEffect(() => {
    const now = Date.now();
    if (now - lastUpdateRef.current >= 200) {
      lastUpdateRef.current = now;
      markerLeftMV.set(markerPercent);
    }
  }, [markerPercent, markerLeftMV]);

  return (
    <div>
      {/* Gauge + labels in one layout so labels sit inside the 8px gaps */}
      <div className="flex items-center" dir="ltr">
        {/* Left segment */}
        <div
          className="h-3 rounded-full bg-slate-200"
          style={{ flex: leftFlex }}
        />

        {/* Left gap — holds the min-pace label centered */}
        {hasTarget && showNumbers ? (
          <div className="flex items-center justify-center" style={{ width: 44 }}>
            <span className="text-[15px] font-black text-slate-800 tabular-nums leading-none">
              {formatPace(targetMinPace)}
            </span>
          </div>
        ) : (
          <div style={{ width: 8 }} />
        )}

        {/* Center segment (target zone) */}
        <div
          className="h-3 rounded-full relative"
          style={{ flex: centerFlex, backgroundColor: blockColor, opacity: 0.85 }}
        />

        {/* Right gap — holds the max-pace label centered */}
        {hasTarget && showNumbers ? (
          <div className="flex items-center justify-center" style={{ width: 44 }}>
            <span className="text-[15px] font-black text-slate-800 tabular-nums leading-none">
              {formatPace(targetMaxPace)}
            </span>
          </div>
        ) : (
          <div style={{ width: 8 }} />
        )}

        {/* Right segment */}
        <div
          className="h-3 rounded-full bg-slate-200"
          style={{ flex: rightFlex }}
        />
      </div>

      {/* Current pace marker — overlaid on the full gauge width.
          Position is driven by a throttled useSpring MotionValue so the
          spring physics run in Framer's rAF loop, not on every GPS render. */}
      <div className="relative" style={{ marginTop: -12 }}>
        <div className="relative h-3">
          <AnimatePresence>
            {currentPaceSeconds > 0 && (
              <motion.div
                className="absolute w-3.5 h-3.5 rounded-full shadow-md border-2 border-white z-10"
                style={{
                  backgroundColor: paceStatusColor,
                  top: '50%',
                  left: leftStyle,
                  translateX: '-50%',
                  translateY: '-50%',
                }}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Effort Badge — for effort-mode blocks (no pace target)
   ═══════════════════════════════════════════════════════════════════════════ */

const EFFORT_COLORS: Record<string, string> = {
  moderate: '#F59E0B',
  hard: '#EF4444',
  max: '#DC2626',
};

function EffortBadge({ effortLabel = '' }: { effortLabel?: string }) {
  const key =
    effortLabel === 'מאמץ בינוני'
      ? 'moderate'
      : effortLabel === 'מאמץ גבוה'
        ? 'hard'
        : 'max';
  const color = EFFORT_COLORS[key] ?? '#F59E0B';

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-xs font-bold text-slate-400 tracking-wider">
        רמת מאמץ
      </span>
      <motion.span
        key={effortLabel}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="text-lg font-black px-5 py-1.5 rounded-full"
        style={{ backgroundColor: `${color}1A`, color }}
      >
        {effortLabel || 'מאמץ'}
      </motion.span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════════ */

function formatPace(seconds: number): string {
  if (seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
