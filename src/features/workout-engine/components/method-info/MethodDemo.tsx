'use client';

/**
 * MethodDemo — the looping demo inside the method "i" sheet
 * (enable_method_info_sheet_v1). Built from the REAL cards the user sees in
 * the workout: ExerciseCard / PyramidStepCard and the player's
 * RestProgressBar, with the block's own exercises, volume and rest. A lit
 * ring walks the cards and the rest bars drain in the method's order
 * (demoPhases). Reduced motion: everything static, nothing lit.
 *
 * Visual only: the cards are inert (no tap, no swap, no focus); the 3 steps
 * under the demo carry the explanation for screen readers.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import ExerciseCard from '@/features/workouts/components/workout-preview-drawer/components/exercise-list/ExerciseCard';
import PyramidStepCard from '@/features/workouts/components/workout-preview-drawer/components/exercise-list/PyramidStepCard';
import type { WorkoutExercise as EngineWorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';
import RestProgressBar from '../../players/strength/playlist/blocks/RestProgressBar';
import { demoPhases, type MethodDemoItem, type MethodInfoModel } from '../../core/methods/method-info/method-info.model';
import type { PlayerT } from '@/messages/ns/player';

/** One tick of the loop; a phase lasts TICKS_PER_PHASE ticks (a rest bar drains over them). */
const TICK_MS = 260;
const TICKS_PER_PHASE = 6;

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;

/**
 * Player rows aren't plan exercises; ExerciseCard reads only the name and
 * symmetry from `exercise` when it is handed a volume line, so a row is
 * shaped into just that.
 */
function cardExercise(item: MethodDemoItem): EngineWorkoutExercise {
  return (item.exercise ?? {
    exercise: { id: item.key, name: item.name, symmetry: item.isUnilateral ? 'unilateral' : undefined },
  }) as EngineWorkoutExercise;
}

function useDemoTick(enabled: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => clearInterval(id);
  }, [enabled]);
  return tick;
}

export default function MethodDemo({ model, t }: { model: MethodInfoModel; t: PlayerT }) {
  const reduced = useReducedMotion() === true;
  const phases = useMemo(() => demoPhases(model), [model]);
  const tick = useDemoTick(!reduced && phases.length > 0);
  const phaseIdx = Math.floor(tick / TICKS_PER_PHASE) % Math.max(1, phases.length);
  const phase = reduced ? null : phases[phaseIdx];
  const sub = tick % TICKS_PER_PHASE;

  const restTotals =
    model.kind === 'superset' ? [model.shortRestSec ?? 0, model.restSec] : [model.restSec];
  const restLeft = (bar: number): number | undefined => {
    if (phase?.rest !== bar) return undefined;
    const total = restTotals[bar] ?? 0;
    return Math.round(total * (1 - (sub + 1) / TICKS_PER_PHASE));
  };

  const lit = (i: number) => phase?.card === i;
  const cardFrame = (i: number, node: React.ReactNode) => (
    <div
      key={model.items[i].key}
      className={`rounded-[16px] transition-shadow duration-300 ${lit(i) ? 'shadow-[0_0_0_2px_#00baf7]' : ''}`}
    >
      {node}
    </div>
  );
  const restBar = (bar: number, caption?: string) => (
    <div
      key={`rest-${bar}`}
      className={`transition-opacity duration-300 ${reduced || phase?.rest === bar ? 'opacity-100' : 'opacity-40'}`}
    >
      {caption && <p className="mb-1 text-[12px] font-bold text-slate-500">{caption}</p>}
      <RestProgressBar
        totalRest={restTotals[bar] ?? 0}
        restTimeLeft={restLeft(bar)}
        formatTime={mmss}
        className="mx-0 mb-0"
      />
    </div>
  );

  const exerciseCard = (item: MethodDemoItem, i: number) =>
    cardFrame(
      i,
      <ExerciseCard
        exercise={cardExercise(item)}
        cachedImageUrl={item.imageUrl}
        isSuperset={false}
        framed
        volumeOverride={
          model.kind === 'tabata' && model.tabata ? t('methodInfo.tabata.work', { sec: model.tabata.workSec }) : item.line
        }
      />,
    );

  const stepCard = (item: MethodDemoItem, i: number) =>
    item.step
      ? cardFrame(
          i,
          <PyramidStepCard
            parentEx={cardExercise(item)}
            step={item.step}
            stepIdx={item.stepIdx ?? i}
            cachedImageUrl={item.imageUrl}
            isSuperset={false}
            isGoal={false}
            uniLabel=""
            parentName={item.name}
          />,
        )
      : null;

  let body: React.ReactNode;
  switch (model.kind) {
    case 'superset':
      body = (
        <div className="flex gap-2">
          <span className="w-[3px] shrink-0 rounded-full bg-cyan-300" aria-hidden />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {exerciseCard(model.items[0], 0)}
            {restBar(0, t('methodInfo.superset.restShort'))}
            {exerciseCard(model.items[1], 1)}
            {restBar(1, t('methodInfo.superset.restLong'))}
          </div>
        </div>
      );
      break;
    case 'tabata':
      body = (
        <div className="flex gap-2">
          <span className="w-[3px] shrink-0 rounded-full bg-orange-400/70" aria-hidden />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {model.items.map(exerciseCard)}
            {restBar(0)}
          </div>
        </div>
      );
      break;
    case 'straight': {
      const sets = model.sets ?? 1;
      // Sets done so far in this pass of the loop (static: none).
      const done = phase ? Math.min(sets, phases.slice(0, phaseIdx + 1).filter((p) => p.card === 0).length) : 0;
      body = (
        <>
          {exerciseCard(model.items[0], 0)}
          {sets > 1 && restBar(0)}
          <div className="flex items-center gap-1.5 text-[12px] text-slate-500" aria-hidden>
            <span>{t('methodInfo.setDots')}</span>
            {Array.from({ length: Math.min(sets, 8) }, (_, i) => (
              <span
                key={i}
                className={`h-1.5 w-7 rounded-full transition-colors duration-300 ${i < done ? 'bg-[#00baf7]' : 'bg-slate-200'}`}
              />
            ))}
          </div>
        </>
      );
      break;
    }
    default:
      body = (
        <>
          {model.items.map((item, i) => (
            <React.Fragment key={item.key}>
              {stepCard(item, i)}
              {i === 0 && model.items.length > 1 && restBar(0)}
            </React.Fragment>
          ))}
        </>
      );
  }

  return (
    <div className="pointer-events-none flex flex-col gap-2" aria-hidden {...({ inert: '' } as Record<string, string>)}>
      {body}
    </div>
  );
}
