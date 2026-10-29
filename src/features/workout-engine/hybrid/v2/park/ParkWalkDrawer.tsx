'use client';
/**
 * ParkWalkDrawer — the bottom of the live park workout on a WALKING leg (enable_park_live_v2,
 * board Park 1, pilot M3 / M22): today's controls (lap · pause · hold-to-stop) above a drawer
 * attached to the bottom edge. Walking shows time, distance and the distance to the station,
 * never a pace. Tapping the grabber reveals the session list behind (board Park 3).
 */
import React from 'react';
import { Dumbbell, Footprints } from 'lucide-react';
import { Button } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import { PlayerControls } from '../../../players/shared/v2';
import { useFreeRunLive } from '../../../players/running/components/FreeRun/v2/useFreeRunLive';
import { fmtClock, fmtDistance } from '../../../players/running/lib/planned-rep-results';
import type { HybridPlayerV2Api } from '../HybridPlayerV2Context';
import { nextBlockView, stationName } from '../hybrid-v2-view';
import { walkCardView } from '../../park-live-v2';

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col items-center">
      <span dir="ltr" className="text-[24px] font-black tabular-nums tracking-[-0.03em] text-v2-ink">{value}</span>
      <span className="text-[11.5px] font-bold text-v2-muted">{label}</span>
    </span>
  );
}

export default function ParkWalkDrawer({ api, onOpenList }: { api: HybridPlayerV2Api; onOpenList: () => void }) {
  const t = useT(player);
  const live = useFreeRunLive();
  const view = api.view;
  const card = walkCardView(view);
  if (!view || !card) return null;
  const hasStation = view.canArriveManually;
  const park = stationName(view.upcomingStation, api.names);
  const next = nextBlockView(view, api.names, t);
  const title = hasStation
    ? park ? t('parkLive.walk.toPark', { name: park }) : t('parkLive.walk.toStation')
    : t('parkLive.walk.back');
  return (
    <div className="flex flex-col items-center gap-3" dir="rtl">
      <div className="pointer-events-auto flex w-full justify-center px-3">
        {hasStation ? (
          <Button variant={view.approaching ? 'cta' : 'ghost'} size={view.approaching ? undefined : 'sm'} onClick={api.arriveNow} className="whitespace-nowrap">
            <Dumbbell size={16} strokeWidth={2.4} aria-hidden />
            {view.approaching
              ? next ? t('hybrid.v2.run.arriveNamed', { label: next.label }) : t('hybrid.cta.arrive')
              : t('hybrid.layer.arrived')}
          </Button>
        ) : (
          <Button variant="cta" onClick={api.finish} className="min-w-[160px] whitespace-nowrap">
            {t('hybrid.v2.run.finish')}
          </Button>
        )}
      </div>
      <div className="pointer-events-auto" data-coach="route-player-controls">
        <PlayerControls isPaused={live.isPaused} onPause={live.pause} onResume={live.resume} onLap={live.lap} onStop={api.finish} />
      </div>
      <div
        className="pointer-events-auto w-full rounded-t-[26px] bg-white px-[18px] pt-2 shadow-v2-float"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
      >
        <button
          type="button"
          onClick={onOpenList}
          aria-label={t('parkLive.walk.openListAria')}
          className="mx-auto mb-2 flex h-6 w-16 items-center justify-center"
        >
          <span className="h-[5px] w-10 rounded-full bg-v2-pill-border" aria-hidden />
        </button>
        <div className="mb-2 flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#ecfccb] text-[#4d7c0f]" aria-hidden>
            <Footprints size={16} strokeWidth={2.4} />
          </span>
          <span className="min-w-0 flex-1 truncate text-[15px] font-black text-v2-ink">{title}</span>
          {hasStation && (
            <button
              type="button"
              onClick={api.skipUpcoming}
              className="shrink-0 rounded-full px-3 py-1 text-[12.5px] font-extrabold text-v2-muted ring-1 ring-inset ring-v2-pill-border"
            >
              {t('hybrid.layer.skip')}
            </button>
          )}
        </div>
        <div className="flex rounded-2xl bg-v2-surface px-1 py-2.5 ring-1 ring-inset ring-v2-hairline" data-coach="park-live-data">
          <Metric value={fmtClock(card.elapsedSec)} label={t('parkLive.walk.time')} />
          <Metric value={card.km.toFixed(2)} label={t('parkLive.walk.km')} />
          {card.toStationM != null && <Metric value={fmtDistance(card.toStationM)} label={t('parkLive.walk.toStationLabel')} />}
        </div>
      </div>
    </div>
  );
}
