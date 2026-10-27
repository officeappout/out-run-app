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

import { common } from '@/messages/ns/common';
import { useT } from '@/hooks/useT';
import { withUnit, unitLabel } from '@/lib/i18n/units';
import React from 'react';
import { Footprints, Activity } from 'lucide-react';
import { useUserStore } from '@/features/user';
import { useWeeklyRunningKm } from '@/features/activity';
import { useHomeV2 } from '@/features/home/context/HomeV2Context';
import CompactMetricTile from '@/features/home/components/widgets/CompactMetricTile';
import { predictRaceSeconds, targetDistanceKm } from '@/features/workout-engine/core/services/race-prediction.service';

const REF_KM_5K = 5;

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function RacePaceTile() {
  const tc = useT(common);
  const profile = useUserStore((s) => s.profile);
  const basePace = profile?.running?.paceProfile?.basePace ?? 0;
  const has5kPrediction = basePace > 0;
  // Same model as every other surface: reference = the plan's target distance.
  const refKm = targetDistanceKm(profile?.running?.generatedProgramTemplate?.targetDistance);
  const fiveKSeconds = has5kPrediction ? predictRaceSeconds(basePace, refKm, REF_KM_5K) : 0;

  return (
    <CompactMetricTile
      icon={<Activity size={16} />}
      label={`צפי ${withUnit('km', 5, tc)}`}
      value={has5kPrediction ? formatTime(fiveKSeconds) : '—'}
      unit={has5kPrediction ? 'ריצה רציפה' : 'נדרש מבחן ריצה'}
      ariaLabel={`צפי לריצת 5 קילומטר: ${has5kPrediction ? formatTime(fiveKSeconds) : 'לא זמין'}`}
    />
  );
}

function WeeklyKmTile() {
  const tc = useT(common);
  const { km, loading } = useWeeklyRunningKm();
  // The km are walks + runs together (every cardio workout) — fine, owner 20.10.2026; under
  // enable_home_v2 the label says so. The weekly RUN count is runs only (useWeeklyRunCount).
  const v2 = useHomeV2();
  const target = 20; // soft target for the ring; can be tied to weeklyFrequency * avg later
  const percentage = Math.min(100, Math.round((km / target) * 100));

  return (
    <CompactMetricTile
      percentage={percentage}
      icon={<Footprints size={16} className="-scale-x-100" />}
      label={v2 ? `${unitLabel('km', tc)} השבוע · הליכה + ריצה` : `${unitLabel('km', tc)} השבוע`}
      value={loading ? '—' : km.toFixed(1)}
      unit={`/ ${withUnit('km', target, tc)} יעד`}
      ariaLabel={`קילומטרים שנצברו השבוע: ${loading ? 'טוען' : km.toFixed(1)}`}
    />
  );
}

export function RaceAndKmCarousel() {
  return (
    <div
      className="w-full h-full overflow-x-auto snap-x snap-mandatory scrollbar-none"
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
