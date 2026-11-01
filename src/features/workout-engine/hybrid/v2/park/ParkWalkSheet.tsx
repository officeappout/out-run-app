'use client';
/**
 * ParkWalkSheet — a walking or running leg of a hybrid / park workout in the unified frame
 * (enable_unified_player_v1, canvas 5ב/5ג/9ג). Same attached drawer as the run players:
 * the floating buttons above it (blue pause, orange resume, hold-to-finish; lap only on a run),
 * page 1 = time · km · (run: pace now) · to the station, page 2 = the next station (skip, "I'm here").
 * In the last metres ("approaching") the "I'm here" button sits on top of page 1. On the leg back
 * there is no station page and a finish button instead. A run's large page adds the target-zone
 * gauge the old run card showed (HybridRunLegV2).
 */
import React from 'react';
import { Activity, Dumbbell, Footprints } from 'lucide-react';
import { Button } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import { together } from '@/messages/ns/together';
import { RunDrawerSheet, RunFloatingButtons, PAGE_CAPTION_KEY, type RunDrawerPage } from '../../../players/shared/v2/run-chrome';
import { Cell, Cells, Gauge } from '../../../players/shared/v2/run-chrome/RunDrawerBlocks';
import { useFreeRunLive } from '../../../players/running/components/FreeRun/v2/useFreeRunLive';
import { fmtBand, fmtClock, fmtDistance, fmtPace } from '../../../players/running/lib/planned-rep-results';
import type { HybridPlayerV2Api } from '../HybridPlayerV2Context';
import { legZone, nextBlockView, stationName } from '../hybrid-v2-view';
import { legSheetCells, walkCardView, type LegSheetCell } from '../../park-live-v2';

interface Props {
  api: HybridPlayerV2Api;
  onOpenList: () => void;
  cardRef: (n: HTMLDivElement | null) => void;
  /** A running (or riding) leg: live pace, lap button, target-zone gauge. Absent = a walk. */
  running?: boolean;
}

export default function ParkWalkSheet({ api, onOpenList, cardRef, running = false }: Props) {
  const t = useT(player);
  const tt = useT(together);
  const live = useFreeRunLive();
  const view = api.view;
  const card = walkCardView(view);
  if (!view || !card) return null;
  const hasStation = view.canArriveManually;
  const park = stationName(view.upcomingStation, api.names);
  const next = nextBlockView(view, api.names, t);
  const title = running
    ? hasStation
      ? park ? t('parkLive.leg.toPark', { name: park }) : t('parkLive.leg.toStation')
      : t('parkLive.leg.back')
    : hasStation
      ? park ? t('parkLive.walk.toPark', { name: park }) : t('parkLive.walk.toStation')
      : t('parkLive.walk.back');
  const zone = running ? legZone(view.segment, t) : null;

  const cellOf = (id: LegSheetCell, size: number) => {
    switch (id) {
      case 'time': return <Cell key={id} label={t('parkLive.walk.time')} value={fmtClock(card.elapsedSec)} size={size} />;
      case 'km': return <Cell key={id} label={t('parkLive.walk.km')} value={card.km.toFixed(2)} size={size} />;
      case 'pace': return <Cell key={id} label={tt('chrome.label.paceNow')} value={fmtPace(live.currentPaceSec)} size={size} />;
      case 'toStation': return <Cell key={id} label={t('parkLive.walk.toStationLabel')} value={fmtDistance(card.toStationM ?? 0)} size={size} />;
    }
  };
  const cells = (size: number) => <Cells>{legSheetCells(view, running).map((id) => cellOf(id, size))}</Cells>;
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
  const general = (size: number, withGauge: boolean) => (
    <div className="flex flex-col gap-3">
      {action}
      <div data-coach="park-live-data">{cells(size)}</div>
      {withGauge && zone && (
        <Gauge nowSec={live.currentPaceSec ?? 0} loSec={zone.minSec} hiSec={zone.maxSec} bottomCenter={tt('chrome.gauge.target', { range: fmtBand(zone.minSec, zone.maxSec) })} />
      )}
    </div>
  );
  const station = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {running ? (
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#ffedd5] text-[#c2410c]" aria-hidden>
            <Activity size={16} strokeWidth={2.4} />
          </span>
        ) : (
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#ecfccb] text-[#4d7c0f]" aria-hidden>
            <Footprints size={16} strokeWidth={2.4} />
          </span>
        )}
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
    { id: 'general', caption: tt(PAGE_CAPTION_KEY.general), compact: general(26, false), large: general(30, true) },
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
          <RunFloatingButtons unified isPaused={live.isPaused} onPause={live.pause} onResume={live.resume} onLap={running ? live.lap : undefined} onStop={api.finish} />
        </div>
      )}
    />
  );
}
