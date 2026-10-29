'use client';

/**
 * StopsInfoDemo — the route + stops sheet's loop (board StopsCard v111, owner approved 29.10),
 * from this route: the overview's JourneyStrip, then a mini leg axis (the walk leg into the
 * station, the station with its real exercises on the real ExerciseCard, the walk back) with
 * a dot moving down the spine. ~14s: walk lit → the SHEET ITSELF slides down to its top and
 * the scrim fades, so the overview's own map shows behind it, with a short caption and the
 * walk progressing → back up with the station lit → the walk back. Reduced motion: no drop,
 * static axis. Visual only (inert).
 */

import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { JourneyStrip, type JourneyStripItem } from '@/components/ui/v2';
import ExerciseCard from '@/features/workouts/components/workout-preview-drawer/components/exercise-list/ExerciseCard';
import type { WorkoutExercise as EngineWorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';
import { ActivityGlyph } from '@/features/parks/core/components/hybrid/activity-icons';
import { HYBRID_AER as AER, HYBRID_STR as STR } from '@/features/parks/core/components/hybrid/hybrid-colors';
import { formatMinutes } from '@/features/parks/core/components/hybrid/hybrid-format';
import type { AerobicLeg } from '@/features/parks/core/components/overview/overview-legs';
import type { MapT } from '@/messages/ns/map';
import type { InfoSheetDemoControls } from '../InfoSheetButton';
import { useInfoLoop } from '../useInfoLoop';
import { inertRef } from '../inert-ref';
import { stopsPhases, type StopsInfoModel } from './stops-info.model';

const noop = () => {};
/** Station exercises shown (board: two). */
const STATION_CARDS = 2;

export interface StopsInfoDemoProps {
  model: StopsInfoModel;
  t: MapT;
  ctl: InfoSheetDemoControls;
  strip: readonly JourneyStripItem[];
  stationName: string;
  exercises: readonly EngineWorkoutExercise[];
  imageOf: (ex: EngineWorkoutExercise) => string;
}

function LegRow({ leg, lit }: { leg: AerobicLeg; lit: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-[16px] bg-white px-3 py-2.5 transition-shadow duration-300 ${lit ? 'shadow-[0_0_0_2px_#10B981]' : 'shadow-v2-ring'}`}
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px]" style={{ background: `${AER}1a`, color: AER }}>
        <ActivityGlyph kind="aerobic" subtype={leg.activity ?? 'walking'} className="h-4 w-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[14px] font-extrabold text-v2-ink">{leg.title}</span>
        {leg.meta[0] && <span className="truncate text-[12px] font-bold text-v2-muted">{leg.meta[0].text}</span>}
      </span>
    </div>
  );
}

export default function StopsInfoDemo({ model, t, ctl, strip, stationName, exercises, imageOf }: StopsInfoDemoProps) {
  const { phase: idx, reduced } = useInfoLoop(stopsPhases(model, false).map((p) => p.ms));
  const phases = stopsPhases(model, reduced);
  const phase = reduced ? null : phases[idx]?.phase ?? 'walk';
  const { peek } = ctl;

  // The sheet drops while the user "walks"; the caption + progress stay under its title.
  useEffect(() => {
    if (phase === 'peek') {
      peek(
        true,
        <div className="flex flex-col gap-2">
          <p className="text-[15px] font-bold leading-[22px] text-slate-700">{t('featureInfo.stops.caption')}</p>
          <div aria-hidden className="relative h-6">
            <span className="absolute inset-x-3 top-1/2 h-[3px] -translate-y-1/2 rounded-full" style={{ background: `${AER}40` }} />
            <span className="absolute end-0 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full bg-white shadow-v2-ring" style={{ color: STR }}>
              <ActivityGlyph kind="strength" className="h-3.5 w-3.5" />
            </span>
            <motion.span
              className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 border-white"
              style={{ background: AER }}
              initial={{ insetInlineStart: '0%' }}
              animate={{ insetInlineStart: '88%' }}
              transition={{ duration: 4.2, ease: 'easeInOut', delay: 0.5 }}
            />
          </div>
        </div>,
      );
    } else peek(false);
  }, [phase, peek, t]);
  useEffect(() => () => peek(false), [peek]);

  const nodes = model.walkBack ? 3 : 2;
  const dotNode = phase === 'station' ? 1 : phase === 'back' ? 2 : 0;
  const mainCount = exercises.filter((e) => ((e.exerciseRole || (e.exercise as { exerciseRole?: string }).exerciseRole) ?? 'main') === 'main').length;

  return (
    <div aria-hidden className="pointer-events-none flex flex-col gap-3" ref={inertRef}>
      <JourneyStrip items={strip} v2 />
      <div className="relative flex gap-3">
        <div className="relative w-3 shrink-0">
          <span className="absolute inset-x-0 inset-y-4 mx-auto w-[3px] rounded-full bg-slate-200" />
          {!reduced && (
            <motion.span
              className="absolute inset-x-0 mx-auto h-3 w-3 -translate-y-1/2 rounded-full border-2 border-white"
              style={{ background: dotNode === 1 ? STR : AER }}
              animate={{ top: `${6 + (dotNode / Math.max(1, nodes - 1)) * 88}%` }}
              transition={{ duration: 1.2, ease: 'easeInOut' }}
            />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <LegRow leg={model.walkTo} lit={phase === 'walk' || phase === 'peek'} />
          <div className={`flex flex-col gap-2 rounded-[16px] bg-white p-2.5 transition-shadow duration-300 ${phase === 'station' ? 'shadow-[0_0_0_2px_#06B6D4]' : 'shadow-v2-ring'}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[14px] font-extrabold text-v2-ink">{t('hybrid.station.titleNamed', { name: stationName })}</span>
              <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-extrabold" style={{ background: `${STR}1a`, color: STR }}>
                {t('hybrid.station.stopAndTrain')}
              </span>
            </div>
            <span className="text-[12px] font-bold text-v2-muted">
              {t('hybrid.station.exercises', { count: String(mainCount) })}
              {model.stationDurationSec ? ` · ~${formatMinutes(model.stationDurationSec)}` : ''}
            </span>
            {exercises.slice(0, STATION_CARDS).map((ex, i) => (
              <ExerciseCard key={`${ex.exercise.id}-${i}`} exercise={ex} cachedImageUrl={imageOf(ex)} isSuperset={false} framed onSwap={noop} />
            ))}
          </div>
          {model.walkBack && <LegRow leg={model.walkBack} lit={phase === 'back'} />}
        </div>
      </div>
    </div>
  );
}
