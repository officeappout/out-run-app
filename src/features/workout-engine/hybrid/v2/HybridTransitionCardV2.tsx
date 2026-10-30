'use client';

/**
 * HybridTransitionCardV2 — arrival → strength (F-2c, U-D2): the leg just
 * run, a 20 s countdown that starts the station by itself (+20 s, pause,
 * "התחל עכשיו" = the one gradient CTA), the station and its first exercise,
 * and "דלג" for the whole station.
 */

import { common } from '@/messages/ns/common';
import { player } from '@/messages/ns/player';
import { useT } from '@/hooks/useT';
import { withUnit } from '@/lib/i18n/units';
import React from 'react';
import { Pause, Play, Plus } from 'lucide-react';
import { Button } from '@/components/ui/v2';
import { HeaderProgressBar } from '../../players/shared/v2';
import { fmtClock } from '../../players/running/lib/planned-rep-results';
import type { HybridPlayerV2Api } from './HybridPlayerV2Context';
import { HYBRID_V2_COLORS, transitionView } from './hybrid-v2-view';
import { exerciseNameOf } from './exercise-display';

import { useUiDir } from '@/lib/i18n/useUiDir';
export default function HybridTransitionCardV2({ api }: { api: HybridPlayerV2Api }) {
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
          <span className="inline-flex items-center gap-1">
            <Plus size={14} strokeWidth={2.6} aria-hidden />
            {t('hybrid.v2.transition.extend', { sec: String(api.state?.options.extendSec ?? 20) })}
          </span>
        </Button>
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
      </div>
      <Button variant="cta" block onClick={api.startStationNow} className="mt-3">
        {t('hybrid.v2.transition.start')}
      </Button>
    </div>
  );
}
