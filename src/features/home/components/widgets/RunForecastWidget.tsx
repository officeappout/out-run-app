"use client";

/**
 * RunForecastWidget
 *
 * Predicts race finish times based on the user's average pace
 * from recent running sessions. Uses a simplified Riegel formula:
 *   T2 = T1 × (D2 / D1)^1.06
 *
 * Shows predictions for 5K, 10K, and Half Marathon.
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Timer, Trophy, TrendingUp, Footprints } from 'lucide-react';
import { useUserStore } from '@/features/user';

// ============================================================================
// TYPES
// ============================================================================

interface RunForecastWidgetProps {
  /** Average pace in min/km from recent sessions */
  averagePaceMinPerKm: number;
  /** Reference distance in km used for the pace (e.g. average session distance) */
  referenceDistanceKm?: number;
  className?: string;
}

interface RacePrediction {
  label: string;
  distanceKm: number;
  predictedTime: string; // "HH:MM:SS" or "MM:SS"
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Riegel formula: T2 = T1 × (D2 / D1)^1.06
 * Returns predicted time in seconds.
 */
function riegelPredict(
  referenceTimeSec: number,
  referenceDistKm: number,
  targetDistKm: number,
): number {
  if (referenceDistKm <= 0 || referenceTimeSec <= 0) return 0;
  return referenceTimeSec * Math.pow(targetDistKm / referenceDistKm, 1.06);
}

/**
 * Format seconds to "H:MM:SS" or "MM:SS"
 */
function formatTime(totalSeconds: number): string {
  if (totalSeconds <= 0) return '--:--';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);

  const mm = m.toString().padStart(2, '0');
  const ss = s.toString().padStart(2, '0');

  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Race distances
const RACES = [
  { label: '5K', distanceKm: 5 },
  { label: '10K', distanceKm: 10 },
  { label: 'חצי מרתון', distanceKm: 21.0975 },
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function RunForecastWidget({
  averagePaceMinPerKm,
  referenceDistanceKm = 5,
  className = '',
}: RunForecastWidgetProps) {
  const { profile } = useUserStore();

  const predictions = useMemo((): RacePrediction[] => {
    if (averagePaceMinPerKm <= 0) return [];

    const refTimeSec = averagePaceMinPerKm * 60 * referenceDistanceKm;

    return RACES.map((race) => ({
      label: race.label,
      distanceKm: race.distanceKm,
      predictedTime: formatTime(
        riegelPredict(refTimeSec, referenceDistanceKm, race.distanceKm),
      ),
    }));
  }, [averagePaceMinPerKm, referenceDistanceKm]);

  // ── Upsell: user finished strength but NOT running → show blurred card ──
  const dashboardMode = profile?.lifestyle?.dashboardMode;
  const runningIncomplete = !profile?.running?.paceProfile?.basePace;
  const showRunningUpsell = dashboardMode === 'PERFORMANCE' && runningIncomplete;

  if (showRunningUpsell) {
    return (
      <div
        className={`relative bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden ${className}`}
        dir="rtl"
      >
        {/* Blurred placeholder */}
        <div className="filter blur-[6px] opacity-40 pointer-events-none select-none">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-gray-300" />
            <h3 className="text-base font-bold text-gray-300">תחזית מרוצים</h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {RACES.map((r) => (
              <div key={r.label} className="bg-gray-50 rounded-xl p-3 text-center">
                <span className="text-xs text-gray-300">{r.label}</span>
                <p className="text-lg font-black text-gray-300">--:--</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/60 dark:bg-slate-800/60 backdrop-blur-[1px] rounded-2xl">
          <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center">
            <Footprints size={20} className="text-orange-500" />
          </div>
          <p className="text-sm font-bold text-slate-800 dark:text-white text-center px-4">
            התחל את מסע הריצה שלך
          </p>
          <a
            href="/onboarding-new/dynamic"
            className="text-xs font-bold text-orange-500 hover:underline"
          >
            להגיע ל-100% →
          </a>
        </div>
      </div>
    );
  }

  if (predictions.length === 0 || averagePaceMinPerKm <= 0) {
    return null;
  }

  // Format current pace for display
  const paceMin = Math.floor(averagePaceMinPerKm);
  const paceSec = Math.round((averagePaceMinPerKm - paceMin) * 60);
  const paceDisplay = `${paceMin}:${paceSec.toString().padStart(2, '0')}`;

  return (
    <div
      className={`bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-slate-700 ${className}`}
      dir="rtl"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-lime-500" />
          <h3 className="text-base font-bold text-gray-900 dark:text-white">תחזית מרוצים</h3>
        </div>
        <div className="flex items-center gap-1.5 bg-lime-50 dark:bg-lime-900/20 px-2.5 py-1 rounded-full">
          <Timer className="w-3.5 h-3.5 text-lime-600 dark:text-lime-400" />
          <span className="text-xs font-bold text-lime-700 dark:text-lime-300">
            {paceDisplay} דק'/ק"מ
          </span>
        </div>
      </div>

      {/* Predictions grid */}
      <div className="grid grid-cols-3 gap-3">
        {predictions.map((pred, idx) => (
          <motion.div
            key={pred.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-3 text-center"
          >
            <div className="flex items-center justify-center gap-1 mb-1">
              <Trophy className="w-3.5 h-3.5 text-lime-500" />
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                {pred.label}
              </span>
            </div>
            <p className="text-lg font-black text-gray-900 dark:text-white tabular-nums">
              {pred.predictedTime}
            </p>
          </motion.div>
        ))}
      </div>

      <p className="text-[10px] text-gray-400 mt-3 text-center">
        מבוסס על ממוצע 3 האימונים האחרונים • נוסחת Riegel
      </p>
    </div>
  );
}

export default RunForecastWidget;
