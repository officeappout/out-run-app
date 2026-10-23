'use client';

import React, { useMemo } from 'react';
import WideSplit from '@/features/workout-engine/players/shared/v2/WideSplit';
import { WidePlayerProvider } from '@/features/workout-engine/players/shared/v2/WidePlayerContext';
import { computeWideLayout } from '@/features/workout-engine/players/shared/v2/wide-layout-logic';
import { useTvCues } from '../hooks/useTvCues';
import { useViewportSize } from '../hooks/useViewportSize';
import { PAGE_BG } from '../ui/styles';
import TvFriendsRow from './TvFriendsRow';
import TvMediaStage from './TvMediaStage';
import TvStagePanel from './TvStagePanel';
import type { WideStageModel } from './stage-model';

/**
 * The TV's live stage = the wide player (#768, enable_wide_player_v1): WideSplit (exercise media + side panel with
 * WideHeroClock / WideNextUp) drawn from the host's mirror, the together row as its footer. `audio` (the host's
 * volume / mute) turns on the countdown beeps; omitted = silent.
 */
export default function TvStageAdapter({ model, banner, audio }: { model: WideStageModel; banner?: React.ReactNode; audio?: { volume: number; muted: boolean } }) {
  const size = useViewportSize();
  const layout = useMemo(() => computeWideLayout(size), [size]);
  useTvCues(
    model.hasClock && model.phase !== 'done' ? { key: `${model.exerciseIndex}:${model.setIndex}:${model.phase}`, clockMs: model.clockMs, runningDown: model.clockRunningDown } : null,
    audio,
  );
  return (
    <WidePlayerProvider value={layout}>
      <main dir="rtl" className={`fixed inset-0 ${PAGE_BG}`} aria-live="off">
        <WideSplit
          media={<TvMediaStage media={model.media} paused={model.paused} />}
          panel={<TvStagePanel model={model} />}
          footer={model.friends.length > 0 ? <TvFriendsRow model={model} /> : undefined}
        />
        {banner && <div className="absolute inset-x-0 top-0 z-20">{banner}</div>}
      </main>
    </WidePlayerProvider>
  );
}
