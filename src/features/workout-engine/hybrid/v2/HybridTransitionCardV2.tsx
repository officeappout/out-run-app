'use client';

/**
 * HybridTransitionCardV2 — arrival → strength (F-2c, U-D2): the leg just
 * run, a 20 s countdown that starts the station by itself (+20 s, pause,
 * "התחל עכשיו" = the one gradient CTA), the station and its first exercise,
 * and "דלג" for the whole station.
 *
 * `arrival` (enable_combo_flow_v1, board PlayerTransitionStation step 1): the same card as the
 * attached bottom sheet: the "walk complete" line with a check, the "you made it" title + the
 * station, the countdown in a ring, the first exercise with its photo, and skip / +20 / pause /
 * start now in one row.
 */

import { common } from '@/messages/ns/common';
import { player } from '@/messages/ns/player';
import { useT } from '@/hooks/useT';
import { withUnit } from '@/lib/i18n/units';
import React from 'react';
import { Check, Pause, Play, Plus } from 'lucide-react';
import { Button, MiniRing } from '@/components/ui/v2';
import { HYBRID_AER, HYBRID_STR } from '@/features/parks/core/components/hybrid/hybrid-colors';
import { HeaderProgressBar } from '../../players/shared/v2';
import { fmtClock } from '../../players/running/lib/planned-rep-results';
import type { HybridPlayerV2Api } from './HybridPlayerV2Context';
import { HYBRID_V2_COLORS, stationExercises, transitionView } from './hybrid-v2-view';
import { exerciseImageOf, exerciseNameOf } from './exercise-display';

import { useUiDir } from '@/lib/i18n/useUiDir';
export default function HybridTransitionCardV2({ api, arrival = false }: { api: HybridPlayerV2Api; arrival?: boolean }) {
  const { direction } = useUiDir();
  const tc = useT(common);
  const t = useT(player);
  const view = api.view;
  if (!view) return null;
  const tv = transitionView(view, api.plan, api.names, exerciseNameOf, api.transitionSec, t);
  const prevLeg = api.legs[view.cursor - 1];
  const ran =
    prevLeg && prevLeg.kind !== 'station' && prevLeg.distanceM > 0
      ? t('hybrid.v2.ranDone', {
          kind: prevLeg.aerobicType === 'walking' ? 'walking' : 'running',
          distance: withUnit('km', (prevLeg.distanceM / 1000).toFixed(2), tc),
          time: fmtClock(prevLeg.durationSec),
        })
      : null;

  const pauseButton = (
    <Button
      variant="ghost"
      size="sm"
      onClick={api.toggleTransitionPause}
      aria-label={view.paused ? t('hybrid.v2.transition.resumeAria') : t('hybrid.v2.transition.pauseAria')}
      className="w-9 !px-0"
    >
      <span className="grid place-items-center">
        {view.paused ? <Play size={15} fill="currentColor" aria-hidden /> : <Pause size={15} fill="currentColor" aria-hidden />}
      </span>
    </Button>
  );
  const extendLabel = (
    <span className="inline-flex items-center gap-1">
      <Plus size={14} strokeWidth={2.6} aria-hidden />
      {t('hybrid.v2.transition.extend', { sec: String(api.state?.options.extendSec ?? 20) })}
    </span>
  );

  if (arrival) {
    const seconds = Math.ceil(Math.max(0, view.transitionRemainingMs ?? 0) / 1000);
    const firstEntry = stationExercises(api.plan[view.cursor])[0];
    const firstImage = firstEntry ? exerciseImageOf(firstEntry) : undefined;
    return (
      <div className="pointer-events-auto w-full rounded-t-[28px] bg-white px-[18px] pt-3 shadow-v2-float" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }} dir={direction}>
        <span className="mx-auto mb-3 block h-[5px] w-10 rounded-full bg-v2-hairline" aria-hidden />
        {ran && (
          <p className="flex items-center gap-2 truncate whitespace-nowrap text-[12.5px] font-extrabold text-emerald-700">
            <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full text-white" style={{ background: HYBRID_AER }} aria-hidden>
              <Check size={11} strokeWidth={3.2} />
            </span>
            {ran}
          </p>
        )}
        <div className="mt-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate whitespace-nowrap text-[24px] font-black !tracking-[-0.02em] text-v2-ink">
              {view.paused ? t('hybrid.v2.transition.paused') : t('hybrid.v2.transition.arrived')}
            </h3>
            <p className="truncate whitespace-nowrap text-[14px] font-bold text-v2-muted">{t('hybrid.v2.transition.arrivedSub', { station: tv.stationLabel })}</p>
          </div>
          <MiniRing pct={tv.fraction * 100} color={HYBRID_STR} size={56} stroke={5} label={t('hybrid.v2.transition.ringAria', { sec: String(seconds) })}>
            <span dir="ltr" className="relative text-[15px] font-black tabular-nums text-v2-ink" aria-hidden>{seconds}</span>
          </MiniRing>
        </div>

        {tv.first && (
          <div className="mt-3 flex items-center gap-2.5 rounded-[16px] bg-cyan-50 p-2">
            {firstImage ? (
              <img src={firstImage} alt="" className="h-[52px] w-16 shrink-0 rounded-[12px] bg-v2-surface object-cover" />
            ) : (
              <span className="h-[52px] w-16 shrink-0 rounded-[12px] bg-v2-surface" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <span className="block whitespace-nowrap text-[11.5px] font-extrabold text-v2-muted">{t('hybrid.v2.transition.firstExercise')}</span>
              <span className="block truncate whitespace-nowrap text-[15px] font-black text-v2-ink">{tv.first.name}</span>
            </div>
            {tv.first.target && <span className="shrink-0 whitespace-nowrap pe-1 text-[15px] font-black text-v2-ink">{tv.first.target}</span>}
          </div>
        )}

        <div className="mt-3 flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={api.skipStation} className="whitespace-nowrap">
            {t('hybrid.v2.transition.skip')}
          </Button>
          <Button variant="ghost" size="sm" onClick={api.extendTransition} className="whitespace-nowrap" aria-label={t('hybrid.v2.transition.extendAria')}>
            {extendLabel}
          </Button>
          {pauseButton}
          <Button variant="cta" onClick={api.startStationNow} className="min-w-0 flex-1">
            {t('hybrid.v2.transition.start')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto w-full rounded-[28px] bg-white px-[18px] pb-4 pt-4 shadow-v2-float" dir={direction}>
      {ran && <p className="truncate whitespace-nowrap text-[12.5px] font-bold text-v2-muted">{ran}</p>}
      <div className="mt-1 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="whitespace-nowrap text-[13px] font-extrabold" style={{ color: HYBRID_V2_COLORS.strength }}>
            {view.paused ? t('hybrid.v2.transition.paused') : t('hybrid.v2.transition.going')}
          </p>
          <h3 className="truncate whitespace-nowrap text-[20px] font-black !tracking-[-0.02em] text-v2-ink">{tv.stationLabel}</h3>
          {tv.stationMeta && <p className="truncate whitespace-nowrap text-[12.5px] font-bold text-v2-ink-2">{tv.stationMeta}</p>}
        </div>
        <span dir="ltr" className="shrink-0 whitespace-nowrap text-[44px] font-black leading-none tracking-[-0.03em] tabular-nums text-v2-ink">
          {tv.countdown}
        </span>
      </div>
      <div className="mt-2.5">
        <HeaderProgressBar progress={tv.fraction} color={HYBRID_V2_COLORS.strength} />
      </div>

      {tv.first && (
        <div className="mt-3 flex items-center gap-3 rounded-[16px] bg-v2-surface px-3 py-2.5 ring-1 ring-inset ring-v2-hairline">
          <div className="min-w-0 flex-1">
            <span className="block whitespace-nowrap text-[11.5px] font-extrabold text-v2-muted">{t('hybrid.v2.transition.firstExercise')}</span>
            <span className="block truncate whitespace-nowrap text-[15px] font-black text-v2-ink">{tv.first.name}</span>
            {tv.moreText && <span className="block truncate whitespace-nowrap text-[12px] font-bold text-v2-muted">{tv.moreText}</span>}
          </div>
          <div className="shrink-0 text-end">
            {tv.first.target && <span className="block whitespace-nowrap text-[16px] font-black text-v2-ink">{tv.first.target}</span>}
            {tv.first.setsText && <span className="block whitespace-nowrap text-[12px] font-bold text-v2-muted">{tv.first.setsText}</span>}
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center justify-center gap-2">
        <Button variant="ghost" size="sm" onClick={api.skipStation} className="whitespace-nowrap">
          {t('hybrid.v2.transition.skip')}
        </Button>
        <Button variant="ghost" size="sm" onClick={api.extendTransition} className="whitespace-nowrap" aria-label={t('hybrid.v2.transition.extendAria')}>
          {extendLabel}
        </Button>
        {pauseButton}
      </div>
      <Button variant="cta" block onClick={api.startStationNow} className="mt-3">
        {t('hybrid.v2.transition.start')}
      </Button>
    </div>
  );
}
