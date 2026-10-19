'use client';

/** The v2 hybrid mini-player (FreeRunLayer's TwoLayerShell mini strip). */

import React from 'react';
import { MiniPlayer } from '../../players/shared/v2';
import { useFreeRunLive } from '../../players/running/components/FreeRun/v2/useFreeRunLive';
import { useHybridPlayerV2 } from './HybridPlayerV2Context';
import { miniView } from './hybrid-v2-view';

export default function HybridMiniV2({ onExpand, height }: { onExpand: () => void; height: number }) {
  const api = useHybridPlayerV2();
  const live = useFreeRunLive();
  if (!api?.enabled || !api.view) return null;
  const m = miniView(api.view, api.plan, api.names, live.totals.durationSec, live.totals.distanceKm);
  const inTransition = api.view.phase === 'transition';
  const isPaused = inTransition ? api.view.paused : live.isPaused;
  return (
    <MiniPlayer
      color={m.color}
      title={m.title}
      subtitle={m.subtitle}
      isPaused={isPaused}
      onTogglePause={inTransition ? api.toggleTransitionPause : isPaused ? live.resume : live.pause}
      onExpand={onExpand}
      height={height}
      rounded={false}
    />
  );
}
