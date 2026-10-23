'use client';

import React from 'react';
import { useT } from '@/hooks/useT';
import { wide } from '@/messages/ns/wide';
import WideHeroClock from '@/features/workout-engine/players/shared/v2/WideHeroClock';
import WideNextUp from '@/features/workout-engine/players/shared/v2/WideNextUp';
import { formatClock } from '../core/format';
import type { WideStageModel } from './stage-model';

/** The wide player's side panel on the TV (sized for 360 logical px — WideSplit zooms it to the screen). */
export default function TvStagePanel({ model }: { model: WideStageModel }) {
  const t = useT(wide);
  const done = model.phase === 'done';
  const rest = model.phase === 'rest';
  const amrap = model.mode === 'amrap';
  const target =
    model.repsMin != null && model.repsMax != null
      ? model.repsMin === model.repsMax
        ? t('remote.target.repsOne', { min: model.repsMin })
        : t('remote.target.reps', { min: model.repsMin, max: model.repsMax })
      : model.holdSec
        ? t('remote.target.hold', { sec: model.holdSec })
        : '';

  if (done) {
    return (
      <div className="flex flex-col items-center text-center">
        <h2 className="text-[34px] font-black leading-tight !tracking-[-0.02em] text-v2-ink">{t('stage.done')}</h2>
      </div>
    );
  }
  return (
    <div data-tv-panel="" className="flex flex-col items-center text-center">
      <div className="mb-1 flex flex-wrap items-center justify-center gap-2 text-[15px] font-extrabold tabular-nums text-v2-deep">
        {model.exerciseCount > 0 && <span>{t('stage.exercise', { index: model.exerciseIndex + 1, total: model.exerciseCount })}</span>}
        {model.mode !== 'strength' && <span className="rounded-full bg-v2-surface px-2.5 py-0.5 ring-1 ring-inset ring-v2-hairline">{t(`stage.mode.${model.mode}`)}</span>}
      </div>
      {rest ? (
        <h2 className="mb-2 text-[40px] font-black leading-tight !tracking-[-0.02em] text-[#16a34a]">{t('stage.rest')}</h2>
      ) : (
        <>
          <div className="mb-1 whitespace-nowrap text-[16px] font-extrabold tabular-nums text-v2-deep">
            {amrap ? t('stage.round', { round: model.setIndex }) : t('stage.set', { set: model.setIndex, total: model.setCount })}
          </div>
          <h2 className="mb-2 text-[30px] font-black leading-tight !tracking-[-0.02em] text-v2-ink">{model.exerciseName}</h2>
          {target && <div className="mb-2 text-[22px] font-extrabold tabular-nums text-v2-deep">{target}</div>}
        </>
      )}
      {model.hasClock && (
        <div className="w-full">
          <WideHeroClock text={formatClock(model.clockMs)} progress={model.progress} tone={model.tone} dim={model.paused} size={96} />
        </div>
      )}
      {model.paused && <p className="mt-2 text-[24px] font-black text-[#b45309]">{t('stage.paused')}</p>}
      {model.nextName && (
        <div className="w-full text-start">
          <WideNextUp name={model.nextName} imageUrl={model.nextMedia?.imageUrl ?? null} />
        </div>
      )}
    </div>
  );
}
