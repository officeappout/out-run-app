'use client';

import React from 'react';
import { useT } from '@/hooks/useT';
import { wide } from '@/messages/ns/wide';
import WideHeroClock from '@/features/workout-engine/players/shared/v2/WideHeroClock';
import WideNextUp from '@/features/workout-engine/players/shared/v2/WideNextUp';
import { formatClock } from '../core/format';
import { useViewportWidth } from '../hooks/useViewportWidth';
import Avatar from '../ui/Avatar';
import { PAGE_BG } from '../ui/styles';
import type { WideStageModel } from './stage-model';

/**
 * The wide-player seam (#768, enable_wide_player_v1): the model is drawn with the wide player's own
 * WideHeroClock (huge digits + progress) and WideNextUp (next-up card). The rest of the stage (exercise,
 * set, friends row, banner) is TV-specific.
 * TODO(wide player): WideSplit (media + side drawer) needs the player's WidePlayerContext and an exercise
 * video, which the TV does not receive (the mirror carries names only) — adopt it when the mirror gains media.
 */
export default function TvStageAdapter({ model, banner }: { model: WideStageModel; banner?: React.ReactNode }) {
  const t = useT(wide);
  const vw = useViewportWidth();
  const done = model.phase === 'done';
  const title = done ? t('stage.done') : model.phase === 'rest' ? t('stage.rest') : model.exerciseName;
  return (
    <main dir="rtl" className={`fixed inset-0 flex flex-col ${PAGE_BG}`} aria-live="off">
      {banner}
      <div className="flex flex-1 flex-col items-center justify-center gap-[1.4vh] px-[5vw] text-center">
        <p className="text-[1.8vw] font-extrabold text-[#0284c7]">
          {model.exerciseCount > 0 && !done ? t('stage.exercise', { index: model.exerciseIndex + 1, total: model.exerciseCount }) : ''}
        </p>
        <h1 className="text-[4.6vw] font-black leading-tight">{title}</h1>
        {!done && (
          <p className="text-[2.2vw] font-bold text-[#475569]">
            {t('stage.set', { set: model.setIndex, total: model.setCount })}
            {model.repsMin != null && model.repsMax != null && model.repsMin !== model.repsMax ? ` · ${t('remote.target.reps', { min: model.repsMin, max: model.repsMax })}` : ''}
            {model.repsMin != null && model.repsMax != null && model.repsMin === model.repsMax ? ` · ${t('remote.target.repsOne', { min: model.repsMin })}` : ''}
            {model.holdSec ? ` · ${t('remote.target.hold', { sec: model.holdSec })}` : ''}
          </p>
        )}
        {model.hasClock && !done && (
          <div className="w-[60vw]">
            <WideHeroClock text={formatClock(model.clockMs)} progress={model.progress} tone={model.tone} dim={model.paused} size={Math.round(vw * 0.12)} />
          </div>
        )}
        {model.paused && <p className="text-[2.4vw] font-black text-[#b45309]">{t('stage.paused')}</p>}
        {model.nextName && !done && (
          <div className="mt-[2vh] w-[34vw] text-start">
            <WideNextUp name={model.nextName} />
          </div>
        )}
      </div>
      {model.friends.length > 0 && (
        <ul className="flex items-center justify-center gap-[2vw] px-[5vw] pb-[4vh]" aria-label={t('stage.friends')}>
          {model.friends.map((p) => (
            <li key={p.uid} className="flex items-center gap-[0.8vw] rounded-full bg-white py-[0.8vh] ps-[0.8vw] pe-[1.6vw] shadow-[0_0_0_1px_rgba(14,27,42,0.08)]">
              <Avatar uid={p.uid} name={p.name} avatar={p.avatar} size={52} />
              <span className="text-[1.7vw] font-extrabold">{p.name || t('lobby.noName')}</span>
              <span className="text-[1.4vw] font-bold text-[#475569]">
                {p.state === 'resting'
                  ? t('remote.friend.resting')
                  : p.state === 'done'
                    ? t('remote.friend.done')
                    : p.state === 'active' && p.set && p.totalSets
                      ? t('remote.friend.active', { set: p.set, total: p.totalSets })
                      : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
