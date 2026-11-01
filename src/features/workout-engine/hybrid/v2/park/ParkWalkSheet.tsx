'use client';
/**
 * ParkWalkSheet — the walking leg of a hybrid / park workout in the unified frame
 * (enable_unified_player_v1, canvas 5ב/5ג/9ג). Same attached drawer as the run players:
 * the floating buttons above it (blue pause, orange resume, hold-to-finish; no lap on a walk),
 * page 1 = time · km · to the station, page 2 = the next station (skip). In the last metres
 * ("approaching") the "I'm here" button sits on top of page 1. On the walk back there is no
 * station page and a finish button instead.
 */
import React from 'react';
import { Dumbbell, Footprints } from 'lucide-react';
import { Button } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import { together } from '@/messages/ns/together';
import { RunDrawerSheet, RunFloatingButtons, PAGE_CAPTION_KEY, type RunDrawerPage } from '../../../players/shared/v2/run-chrome';
import { Cell, Cells } from '../../../players/shared/v2/run-chrome/RunDrawerBlocks';
import { useFreeRunLive } from '../../../players/running/components/FreeRun/v2/useFreeRunLive';
import { fmtClock, fmtDistance } from '../../../players/running/lib/planned-rep-results';
import type { HybridPlayerV2Api } from '../HybridPlayerV2Context';
import { nextBlockView, stationName } from '../hybrid-v2-view';
import { walkCardView } from '../../park-live-v2';

export default function ParkWalkSheet({ api, onOpenList, cardRef }: { api: HybridPlayerV2Api; onOpenList: () => void; cardRef: (n: HTMLDivElement | null) => void }) {
  const t = useT(player);
  const tt = useT(together);
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

  const cells = (size: number) => (
    <Cells>
      <Cell label={t('parkLive.walk.time')} value={fmtClock(card.elapsedSec)} size={size} />
      <Cell label={t('parkLive.walk.km')} value={card.km.toFixed(2)} size={size} />
      {card.toStationM != null && <Cell label={t('parkLive.walk.toStationLabel')} value={fmtDistance(card.toStationM)} size={size} />}
    </Cells>
  );
  const action = hasStation ? (
    view.approaching ? (
      <Button variant="cta" onClick={api.arriveNow} className="w-full whitespace-nowrap">
        <Dumbbell size={16} strokeWidth={2.4} aria-hidden />
        {next ? t('hybrid.v2.run.arriveNamed', { label: next.label }) : t('hybrid.cta.arrive')}
      </Button>
    ) : null
  ) : (
    <Button variant="cta" onClick={api.finish} className="w-full whitespace-nowrap">
      {t('hybrid.v2.run.finish')}
    </Button>
  );
  const general = (size: number) => (
    <div className="flex flex-col gap-3">
      {action}
      <div data-coach="park-live-data">{cells(size)}</div>
    </div>
  );
  const station = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#ecfccb] text-[#4d7c0f]" aria-hidden>
          <Footprints size={16} strokeWidth={2.4} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-black text-v2-ink">{title}</span>
        <button
          type="button"
          onClick={api.skipUpcoming}
          className="shrink-0 rounded-full px-3 py-1 text-[12.5px] font-extrabold text-v2-muted ring-1 ring-inset ring-v2-pill-border"
        >
          {t('hybrid.layer.skip')}
        </button>
      </div>
      {next && <div className="text-[13px] font-extrabold text-slate-500">{next.label}</div>}
      {!view.approaching && (
        <Button variant="ghost" size="sm" onClick={api.arriveNow} className="self-center whitespace-nowrap">
          <Dumbbell size={16} strokeWidth={2.4} aria-hidden />
          {t('hybrid.layer.arrived')}
        </Button>
      )}
    </div>
  );
  const pages: RunDrawerPage[] = [
    { id: 'general', caption: tt(PAGE_CAPTION_KEY.general), compact: general(26), large: general(30) },
    ...(hasStation ? [{ id: 'station', caption: tt('chrome.page.nextStation'), compact: station, large: station }] : []),
  ];

  return (
    <RunDrawerSheet
      cardRef={cardRef}
      onOpenList={onOpenList}
      compact={pages[0].compact}
      large={pages[0].large}
      pages={pages}
      buttons={(
        <div data-coach="route-player-controls">
          <RunFloatingButtons unified isPaused={live.isPaused} onPause={live.pause} onResume={live.resume} onStop={api.finish} />
        </div>
      )}
    />
  );
}
