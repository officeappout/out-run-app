'use client';

/** The v2 free-run mini-player (inside FreeRunLayer's TwoLayerShell mini strip). */

import React from 'react';
import { MiniPlayer } from '../../../../shared/v2';
import { V2_BLOCK_COLORS, fmtClock, fmtPace } from '../../../lib/planned-rep-results';
import { goalView } from '../../../lib/continuous-run';
import { useFreeRunLive } from './useFreeRunLive';

export default function FreeRunMiniV2({ onExpand, height }: { onExpand: () => void; height: number }) {
  const { totals, currentPaceSec, isPaused, goal, pause, resume } = useFreeRunLive();
  const gv = goal ? goalView(goal) : null;
  return (
    <MiniPlayer
      color={V2_BLOCK_COLORS.easy}
      title={gv ? `ריצה חופשית · ${gv.remainingText}` : `ריצה חופשית · ${totals.distanceKm.toFixed(2)} ק״מ`}
      subtitle={`${fmtClock(totals.durationSec)}${currentPaceSec > 0 ? ` · ${fmtPace(currentPaceSec)}` : ''}${gv ? ` · ${gv.percent}%` : ''}`}
      isPaused={isPaused}
      onTogglePause={isPaused ? resume : pause}
      onExpand={onExpand}
      height={height}
      rounded={false}
    />
  );
}
