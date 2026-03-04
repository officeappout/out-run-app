'use client';

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PaceStatus } from '../../hooks/usePlannedRunEngine';

interface PaceGaugeProps {
  currentPaceSeconds: number;
  targetMinPace: number;
  targetMaxPace: number;
  paceStatus: PaceStatus;
  paceStatusColor: string;
  currentPaceFormatted: string;
  targetPaceFormatted: string;
  showNumbers: boolean;
  blockMode?: 'pace' | 'effort';
  effortLabel?: string;
}

/**
 * Visual gauge bar showing the runner's current pace relative to the target zone.
 *
 * Layout (left-to-right, because pace is displayed LTR):
 *   |  fast zone  | ▓▓ target band ▓▓ |  slow zone  |
 *                  minPace        maxPace
 *
 * The marker slides within a normalised 0-100% range where:
 *   - 0%   = very fast (well below minPace)
 *   - 50%  = centre of target zone
 *   - 100% = very slow (well above maxPace)
 */
const EFFORT_COLORS: Record<string, string> = {
  'moderate': '#F59E0B',
  'hard':     '#EF4444',
  'max':      '#DC2626',
};

export default function PaceGauge({
  currentPaceSeconds,
  targetMinPace,
  targetMaxPace,
  paceStatus,
  paceStatusColor,
  currentPaceFormatted,
  targetPaceFormatted,
  showNumbers,
  blockMode = 'pace',
  effortLabel = '',
}: PaceGaugeProps) {
  if (blockMode === 'effort') {
    const color = EFFORT_COLORS[effortLabel === 'מאמץ בינוני' ? 'moderate' : effortLabel === 'מאמץ גבוה' ? 'hard' : 'max'] ?? '#F59E0B';
    return (
      <div
        className="w-full rounded-2xl bg-white shadow-sm px-5 py-6 flex flex-col items-center gap-3"
        style={{ fontFamily: 'var(--font-simpler)' }}
      >
        <span className="text-[11px] font-bold text-gray-400 tracking-wide">
          רמת מאמץ
        </span>
        <motion.span
          key={effortLabel}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-xl font-black px-6 py-2 rounded-full"
          style={{ backgroundColor: `${color}1A`, color }}
        >
          {effortLabel || 'מאמץ'}
        </motion.span>
      </div>
    );
  }

  const hasTarget = targetMinPace > 0 && targetMaxPace > 0;

  const { markerPercent, bandLeftPercent, bandWidthPercent } = useMemo(() => {
    if (!hasTarget) return { markerPercent: 50, bandLeftPercent: 20, bandWidthPercent: 60 };

    const zoneWidth = targetMaxPace - targetMinPace;
    // Pad 40% of zone width on each side for the overflow area
    const padding = Math.max(zoneWidth * 0.6, 15);
    const gaugeMin = targetMinPace - padding;
    const gaugeMax = targetMaxPace + padding;
    const gaugeRange = gaugeMax - gaugeMin;

    const bandLeft = ((targetMinPace - gaugeMin) / gaugeRange) * 100;
    const bandW = (zoneWidth / gaugeRange) * 100;

    let marker = 50;
    if (currentPaceSeconds > 0) {
      const clamped = Math.max(gaugeMin, Math.min(gaugeMax, currentPaceSeconds));
      marker = ((clamped - gaugeMin) / gaugeRange) * 100;
    }

    return { markerPercent: marker, bandLeftPercent: bandLeft, bandWidthPercent: bandW };
  }, [currentPaceSeconds, targetMinPace, targetMaxPace, hasTarget]);

  const statusLabel = paceStatusToLabel(paceStatus);

  return (
    <div
      className="w-full rounded-2xl bg-white shadow-sm px-5 py-4"
      style={{ fontFamily: 'var(--font-simpler)' }}
    >
      {/* Label row */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold text-gray-400 tracking-wide">
          קצב נוכחי
        </span>
        <span className="text-[11px] font-bold text-gray-400 tracking-wide">
          טווח יעד
        </span>
      </div>

      {/* The gauge track */}
      <div className="relative h-4 rounded-full bg-gray-100 overflow-hidden">
        {/* Target band */}
        {hasTarget && (
          <div
            className="absolute inset-y-0 rounded-full"
            style={{
              left: `${bandLeftPercent}%`,
              width: `${bandWidthPercent}%`,
              backgroundColor: 'rgba(16,185,129,0.18)',
            }}
          />
        )}

        {/* Centre tick of target band */}
        {hasTarget && (
          <div
            className="absolute inset-y-0 w-px bg-emerald-400/50"
            style={{ left: `${bandLeftPercent + bandWidthPercent / 2}%` }}
          />
        )}

        {/* Current pace marker */}
        <AnimatePresence>
          {currentPaceSeconds > 0 && (
            <motion.div
              className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full shadow-md border-2 border-white"
              style={{ backgroundColor: paceStatusColor }}
              initial={{ left: '50%', x: '-50%', scale: 0 }}
              animate={{
                left: `${markerPercent}%`,
                x: '-50%',
                scale: 1,
              }}
              exit={{ scale: 0 }}
              transition={{ type: 'spring', stiffness: 150, damping: 22 }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Values row */}
      <div className="flex items-center justify-between mt-2.5">
        {showNumbers ? (
          <>
            <span
              className="text-base font-black leading-none"
              style={{ color: paceStatusColor }}
              dir="ltr"
            >
              {currentPaceSeconds > 0 ? currentPaceFormatted : '—'}
            </span>
            <span className="text-base font-black text-gray-700 leading-none" dir="ltr">
              {targetPaceFormatted}
            </span>
          </>
        ) : (
          <span
            className="text-sm font-bold w-full text-center"
            style={{ color: paceStatusColor }}
          >
            {statusLabel}
          </span>
        )}
      </div>

      {/* Status pill (shown for everyone, including beginners) */}
      {paceStatus !== 'idle' && (
        <div className="flex justify-center mt-2">
          <motion.span
            key={paceStatus}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="text-[10px] font-bold px-3 py-0.5 rounded-full"
            style={{
              backgroundColor: `${paceStatusColor}1A`,
              color: paceStatusColor,
            }}
          >
            {statusLabel}
          </motion.span>
        </div>
      )}
    </div>
  );
}

function paceStatusToLabel(status: PaceStatus): string {
  switch (status) {
    case 'on_target': return 'בטווח היעד';
    case 'slow':      return 'לאט מדי';
    case 'fast':      return 'מהר מדי';
    case 'idle':      return 'ממתין...';
  }
}
