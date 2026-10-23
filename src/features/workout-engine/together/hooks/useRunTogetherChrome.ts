'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import PresenceRail from '@/features/workout-engine/players/shared/v2/PresenceRail';
import RunVsPanel from '@/features/workout-engine/players/shared/v2/run-chrome/RunVsPanel';
import { availableLayers, layerAfterSelection, vsGap, type RunLayerId, type VsSide } from '@/features/workout-engine/players/shared/v2/run-chrome/run-chrome-logic';
import { useTogetherSession, type TogetherLiveStatus } from './useTogetherSession';
import { TogetherFacesLayer, TogetherRaceLayer } from '../components/TogetherHeaderLayers';
import CheerButton from '../components/CheerButton';
import TogetherToasts from '../components/TogetherToasts';

const toSide = (s: { distanceKm?: number; paceSecPerKm?: number; avgPaceSecPerKm?: number; elapsedSec?: number; elevGainM?: number }): VsSide => ({
  distanceKm: s.distanceKm ?? 0,
  paceSecPerKm: s.paceSecPerKm ?? 0,
  avgPaceSecPerKm: s.avgPaceSecPerKm ?? 0,
  elapsedSec: s.elapsedSec ?? 0,
  elevGainM: s.elevGainM ?? 0,
});

/**
 * The together pieces of the attached run chrome, ready to drop in:
 *   layers(blocks)  -> the header's sliding layers (blocks / together / race)
 *   overlay         -> the rail (+ cheers) and the toasts
 *   vsPanel         -> the me-vs-them content for the drawer (null = normal drawer)
 * Everything is inert (blocks layer only, no overlay) when the flag is off or
 * the player is not in a together session.
 */
export function useRunTogetherChrome(p: { live: TogetherLiveStatus; headerHeight: number; metric?: 'pace' | 'speed'; enabled?: boolean }) {
  const s = useTogetherSession(p.live, p.enabled ?? true);
  const [sheetHeight, setSheetHeight] = useState(240);
  const [layerId, setLayerId] = useState<RunLayerId>('blocks');
  const prevSelected = useRef<string | null>(null);

  const layerIds = availableLayers(s.on, !!s.rival);
  useEffect(() => {
    setLayerId((cur) => layerAfterSelection(layerIds, cur, s.selected, prevSelected.current));
    prevSelected.current = s.selected;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.selected, layerIds.join(',')]);

  // Gap trend: compare with the sample from >= 5 s ago.
  const history = useRef<Array<{ t: number; m: number }>>([]);
  const meSide = toSide(p.live);
  const themSide = s.rival ? toSide(s.rival) : null;
  const gapNow = themSide ? vsGap(meSide, themSide).meters : null;
  const [prevGap, setPrevGap] = useState<number | null>(null);
  useEffect(() => {
    if (gapNow == null) { history.current = []; setPrevGap(null); return; }
    const now = Date.now();
    history.current.push({ t: now, m: gapNow });
    history.current = history.current.filter((h) => now - h.t < 30_000);
    const old = [...history.current].reverse().find((h) => now - h.t >= 5000);
    setPrevGap(old ? old.m : null);
  }, [gapNow]);

  const layers = (blocks: React.ReactNode): React.ReactNode[] =>
    layerIds.map((id) =>
      id === 'blocks' ? blocks
        : id === 'together' ? React.createElement(TogetherFacesLayer, { key: id, participants: s.participants, totalKm: s.totalKm })
          : React.createElement(TogetherRaceLayer, { key: id, name: s.rival?.name ?? '', mePaceSec: meSide.paceSecPerKm, themPaceSec: themSide?.paceSecPerKm ?? 0, metric: p.metric }),
    );

  const overlay = s.on
    ? React.createElement(React.Fragment, null,
        React.createElement(PresenceRail, {
          participants: s.participants,
          selectedUid: s.selected,
          onSelect: s.setSelected,
          topInset: p.headerHeight + 8,
          bottomInset: sheetHeight + 8,
          renderExtra: (q) => (q.isMe || q.state === 'done' ? null : React.createElement(CheerButton, { name: q.name, onCheer: () => s.cheer(q.uid) })),
        }),
        React.createElement(TogetherToasts, { events: s.events, onAck: s.ackEvents }))
    : null;

  const vsPanel = s.rival && themSide
    ? React.createElement(RunVsPanel, {
        me: { ...meSide, name: s.myName, photoURL: s.myPhoto },
        them: { ...themSide, name: s.rival.name, photoURL: s.rival.photoURL },
        prevGapMeters: prevGap,
        metric: p.metric,
        onClose: () => s.setSelected(null),
      })
    : null;

  return {
    on: s.on,
    layers,
    layerIndex: Math.max(0, layerIds.indexOf(layerId)),
    setLayerIndex: (i: number) => setLayerId(layerIds[i] ?? 'blocks'),
    overlay,
    vsPanel,
    setSheetHeight,
  };
}
