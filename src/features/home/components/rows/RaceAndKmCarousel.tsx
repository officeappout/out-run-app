"use client";

/**
 * RaceAndKmCarousel — left half of `PerformanceMetricsRow` (compact).
 *
 * Snap-scrolling carousel between two `CompactMetricTile`s sized to fit a
 * `SideBySideRow` cell (matching the "ExerciseRow" / strength tile design
 * language, ~64px tall — much smaller than the previous full-width
 * `RunProgressCircle` rendering).
 *
 * Slides:
 *   1. Race-pace prediction (5K Riegel-projected from user's basePace).
 *   2. Weekly KM total      — `useWeeklyRunningKm` (PR 2 helper).
 *
 * Uses CSS scroll-snap (no extra deps). Heights match neighbouring tiles
 * via `h-full`.
 */

import React from 'react';
import { Footprints, Activity } from 'lucide-react';
import { useUserStore } from '@/features/user';
import { useWeeklyRunningKm } from '@/features/activity';
import CompactMetricTile from '@/features/home/components/widgets/CompactMetricTile';

const REF_KM_5K = 5;

function riegelPredict(basePaceSecKm: number, refKm: number, targetKm: number): number {
  const refTime = basePaceSecKm * refKm;
  return refTime * Math.pow(targetKm / refKm, 1.06);
}

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function RacePaceTile() {
  const profile = useUserStore((s) => s.profile);
  const basePace = profile?.running?.paceProfile?.basePace ?? 0;
  const has5kPrediction = basePace > 0;
  const fiveKSeconds = has5kPrediction ? riegelPredict(basePace, REF_KM_5K, REF_KM_5K) : 0;

  return (
    <CompactMetricTile
      icon={<Activity size={16} />}
      label="צפי 5 ק״מ"
      value={has5kPrediction ? formatTime(fiveKSeconds) : '—'}
      unit={has5kPrediction ? 'ריצה רציפה' : 'נדרש מבחן ריצה'}
      ariaLabel={`צפי לריצת 5 קילומטר: ${has5kPrediction ? formatTime(fiveKSeconds) : 'לא זמין'}`}
    />
  );
}

function WeeklyKmTile() {
  const { km, loading } = useWeeklyRunningKm();
  const target = 20; // soft target for the ring; can be tied to weeklyFrequency * avg later
  const percentage = Math.min(100, Math.round((km / target) * 100));

  return (
    <CompactMetricTile
      percentage={percentage}
      icon={<Footprints size={16} className="-scale-x-100" />}
      label="ק״מ השבוע"
      value={loading ? '—' : km.toFixed(1)}
      unit={`/ ${target} ק״מ יעד`}
      ariaLabel={`קילומטרים שנצברו השבוע: ${loading ? 'טוען' : km.toFixed(1)}`}
    />
  );
}

export function RaceAndKmCarousel() {
  return (
    <div
      className="w-full h-full overflow-x-auto snap-x snap-mandatory scrollbar-none"
      dir="rtl"
    >
      <div className="flex gap-2 h-full">
        <div className="snap-center shrink-0 w-full h-full">
          <RacePaceTile />
        </div>
        <div className="snap-center shrink-0 w-full h-full">
          <WeeklyKmTile />
        </div>
      </div>
    </div>
  );
}

export default RaceAndKmCarousel;
