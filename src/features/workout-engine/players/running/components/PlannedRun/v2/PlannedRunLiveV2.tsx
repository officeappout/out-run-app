'use client';

/**
 * PlannedRunLiveV2 — home-v2 (enable_home_v2) planned-run player, boards
 * F-1c / F-1c2 / F-1d / F-1e. Rendered by PlannedRunActive, which keeps
 * owning every timer, cue, auto-advance and the finish flow; this file is
 * layout only.
 *
 *   top:    white fade with per-block story bars, the cart icon (ring
 *           segmented per block + done badge) and the session clock
 *   bottom: the free-run-style white card over the map (PlannedLiveCardV2)
 *   behind: the session list (PlannedSessionListV2) — drag the player down
 *           or tap the cart; the player shrinks to the MiniPlayer
 *           (shared shell: players/shared/v2/PlayerShell).
 */

import React, { useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LocateFixed } from 'lucide-react';
import { CartProgressIcon, StoryBars } from '@/components/ui/v2';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import GpsIndicator from '@/features/workout-engine/components/GpsIndicator';
import { MiniPlayer, PlayerShell } from '../../../../shared/v2';
import { useRunningPlayer } from '../../../store/useRunningPlayer';
import type { RunBlock } from '../../../types/run-block.type';
import type { PlannedRunEngine } from '../../../hooks/usePlannedRunEngine';
import { usePlannedLiveResults } from '../../../hooks/usePlannedLiveResults';
import { blockDisplayLabel, fmtClock, fmtDistance, repNumbers, v2BlockColor } from '../../../lib/planned-rep-results';
import PlannedLiveCardV2 from './PlannedLiveCardV2';
import PlannedSessionListV2 from './PlannedSessionListV2';

interface Props {
  engine: PlannedRunEngine;
  blocks: RunBlock[];
  title: string;
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  canSkip: boolean;
  onSkip: () => void;
  onEnd: () => void;
  onJumpToBlock: (index: number) => void;
}

export default function PlannedRunLiveV2({
  engine,
  blocks,
  title,
  isPaused,
  onPause,
  onResume,
  canSkip,
  onSkip,
  onEnd,
  onJumpToBlock,
}: Props) {
  const totalDuration = useSessionStore((s) => s.totalDuration);
  const totalDistance = useSessionStore((s) => s.totalDistance);
  const gpsAccuracy = useRunningPlayer((s) => s.gpsAccuracy);
  const gpsStatus = useRunningPlayer((s) => s.gpsStatus);
  const totalCalories = useRunningPlayer((s) => s.totalCalories);
  const blockElapsedSeconds = useRunningPlayer((s) => s.blockElapsedSeconds);
  const isMapFollowEnabled = useRunningPlayer((s) => s.isMapFollowEnabled);
  const setMapFollowEnabled = useRunningPlayer((s) => s.setMapFollowEnabled);

  const live = usePlannedLiveResults(engine);
  const reps = useMemo(() => repNumbers(blocks), [blocks]);
  const { currentBlock, currentBlockIndex, blockProgress, blockTimeRemaining, blockDistanceRemaining } = engine;

  const [listOpen, setListOpen] = useState(false);

  const segments = useMemo(() => blocks.map((b, i) => ({ key: b.id ?? String(i), color: v2BlockColor(b) })), [blocks]);
  const cartItems = useMemo(
    () => blocks.map((b, i) => ({ color: v2BlockColor(b), done: i < currentBlockIndex })),
    [blocks, currentBlockIndex],
  );

  const totals = {
    durationSec: Number.isFinite(totalDuration) ? totalDuration : 0,
    distanceKm: Number.isFinite(totalDistance) ? totalDistance : 0,
    calories: Number.isFinite(totalCalories) ? totalCalories : 0,
  };
  const currentRemaining = !currentBlock
    ? '--'
    : currentBlock.durationSeconds && currentBlock.durationSeconds > 0
      ? fmtClock(blockTimeRemaining)
      : currentBlock.distanceMeters && currentBlock.distanceMeters > 0
        ? fmtDistance(blockDistanceRemaining)
        : fmtClock(blockElapsedSeconds);

  const triggerLap = useCallback(() => {
    useRunningPlayer.getState().triggerLap();
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(15);
  }, []);

  return (
    <PlayerShell
      open={listOpen}
      onOpenChange={setListOpen}
      behind={
        <PlannedSessionListV2
          title={title}
          blocks={blocks}
          currentBlockIndex={currentBlockIndex}
          records={live.byIndex}
          reps={reps}
          resolveTarget={live.resolve}
          showNumbers={engine.showNumbers}
          currentRemaining={currentRemaining}
          totals={totals}
          onJumpToBlock={onJumpToBlock}
          onClose={() => setListOpen(false)}
        />
      }
      mini={({ startDrag, height, safeBottom }) => (
        <MiniPlayer
          color={currentBlock ? v2BlockColor(currentBlock) : '#a9b7c2'}
          title={currentBlock ? `${blockDisplayLabel(currentBlock)} · ${currentRemaining}` : 'אימון מתוכנן'}
          subtitle={`${fmtClock(totals.durationSec)} · ${totals.distanceKm.toFixed(1)} ק״מ`}
          isPaused={isPaused}
          onTogglePause={isPaused ? onResume : onPause}
          onExpand={() => setListOpen(false)}
          onPointerDown={startDrag}
          height={height}
          safeBottom={safeBottom}
        />
      )}
    >
      {({ startDrag }) => (
          <>
            {/* Header — also the drag handle. */}
            <header
              className="pointer-events-auto absolute inset-x-0 top-0 px-4 pb-8"
              style={{
                paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)',
                background:
                  'linear-gradient(to bottom, rgba(255,255,255,1) 0%, rgba(255,255,255,0.98) 40%, rgba(255,255,255,0.85) 60%, rgba(255,255,255,0.4) 82%, rgba(255,255,255,0) 100%)',
                touchAction: 'none',
              }}
              onPointerDown={startDrag}
            >
              <StoryBars segments={segments} currentIndex={currentBlockIndex} progress={blockProgress} className="mb-2.5" />
              <div className="flex items-center">
                <div className="flex w-[100px] justify-start">
                  <CartProgressIcon items={cartItems} onClick={() => setListOpen(true)} />
                </div>
                <div dir="ltr" className="min-w-0 flex-1 whitespace-nowrap text-center text-[20px] font-black tabular-nums text-v2-ink">
                  {fmtClock(totals.durationSec)}
                </div>
                <div className="flex w-[100px] justify-end">
                  <GpsIndicator accuracy={gpsAccuracy} status={gpsStatus} />
                </div>
              </div>
            </header>

            {/* Re-centre (map follow) */}
            <AnimatePresence>
              {!isMapFollowEnabled && (
                <motion.button
                  type="button"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  onClick={() => setMapFollowEnabled(true)}
                  aria-label="מרכז את המפה"
                  className="pointer-events-auto absolute right-4 top-[calc(env(safe-area-inset-top,0px)+110px)] grid h-11 w-11 place-items-center rounded-full bg-white shadow-v2-ring"
                >
                  <LocateFixed size={20} className="text-v2-deep" aria-hidden />
                </motion.button>
              )}
            </AnimatePresence>

            {/* The card over the map. */}
            <div className="absolute inset-x-3" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)' }}>
              <PlannedLiveCardV2
                engine={engine}
                blocks={blocks}
                reps={reps}
                lastRep={live.lastRep}
                blockElapsedSeconds={blockElapsedSeconds}
                totals={totals}
                canSkip={canSkip}
                onSkip={onSkip}
                onPause={onPause}
                onEnd={onEnd}
                onLap={triggerLap}
              />
            </div>
          </>
      )}
    </PlayerShell>
  );
}
