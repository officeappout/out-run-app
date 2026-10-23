'use client';

import React from 'react';
import { useT } from '@/hooks/useT';
import { wide } from '@/messages/ns/wide';
import { formatClock } from '../core/format';
import Avatar from '../ui/Avatar';
import { PAGE_BG } from '../ui/styles';
import type { StageTone, WideStageModel } from './stage-model';

const TONE_TEXT: Record<StageTone, string> = { accent: '#0e1b2a', warn: '#ea580c', ok: '#16a34a', idle: '#00a9e8' };
const TONE_BAR: Record<StageTone, string> = { accent: '#00b4ff', warn: '#f97316', ok: '#22c55e', idle: '#94a3b8' };

/**
 * The wide-player seam. TODAY: a self-contained light-theme stage that draws the
 * WideStageModel (huge clock, exercise, set, next up, friends row).
 * AFTER #768 (enable_wide_player_v1) lands: render the model through its WideHeroClock /
 * WideSplit / WideNextUp pieces here — this file is the only one that changes.
 */
export default function TvStageAdapter({ model, banner }: { model: WideStageModel; banner?: React.ReactNode }) {
  const t = useT(wide);
  const done = model.phase === 'done';
  const title = done ? t('stage.done') : model.phase === 'rest' ? t('stage.rest') : model.exerciseName;
  const pct = Math.round(model.progress * 100);
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
            <div
              dir="ltr"
              className="whitespace-nowrap font-black leading-none tabular-nums tracking-[-0.03em]"
              style={{ fontSize: '12vw', color: TONE_TEXT[model.tone], opacity: model.paused ? 0.5 : 1 }}
            >
              {formatClock(model.clockMs)}
            </div>
            <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="mx-auto mt-[2vh] h-[1.4vh] w-full overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: TONE_BAR[model.tone] }} />
            </div>
          </div>
        )}
        {model.paused && <p className="text-[2.4vw] font-black text-[#b45309]">{t('stage.paused')}</p>}
        {model.nextName && !done && (
          <p className="mt-[2vh] rounded-full bg-white px-[2vw] py-[1vh] text-[1.9vw] font-extrabold shadow-[0_0_0_1px_rgba(14,27,42,0.08)]">
            {t('stage.next')}: {model.nextName}
          </p>
        )}
      </div>
      {model.friends.length > 0 && (
        <ul className="flex items-center justify-center gap-[2vw] px-[5vw] pb-[4vh]" aria-label={t('stage.friends')}>
          {model.friends.map((p) => (
            <li key={p.uid} className="flex items-center gap-[0.8vw] rounded-full bg-white py-[0.8vh] ps-[0.8vw] pe-[1.6vw] shadow-[0_0_0_1px_rgba(14,27,42,0.08)]">
              <Avatar uid={p.uid} name={p.name} size={52} />
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
