'use client';

/**
 * ContinuousRunLiveV2 — home-v2 (enable_home_v2) player for PLANNED runs that
 * are one steady block (easy / tempo / long, wrappers aside — see
 * isContinuousPlan). Boards R2-prop-easy + U-B1…B3 pages + U-C1/C2 shell.
 * Rendered by PlannedRunActive, which keeps owning every timer, cue,
 * auto-advance and the finish flow; this file maps the engine to layout.
 *
 *   top:    header card — cart icon (opens the list), zone · goal, time
 *           left, %, per-block story bars
 *   bottom: ContinuousRunCardV2 (pages · "הבא" + skip · lap/pause/hold-stop)
 *   behind: the session list (PlannedSessionListV2) via PlayerShell; the
 *           player shrinks to the MiniPlayer.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LocateFixed } from 'lucide-react';
import { CartProgressIcon, StoryBars } from '@/components/ui/v2';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import GpsIndicator from '@/features/workout-engine/components/GpsIndicator';
import { HeaderProgressBar, MiniPlayer, PlayerHeaderCard, PlayerShell, usePublishedPlayerChrome } from '../../../../shared/v2';
import { useRunningPlayer } from '../../../store/useRunningPlayer';
import type { RunBlock } from '../../../types/run-block.type';
import type { PlannedRunEngine } from '../../../hooks/usePlannedRunEngine';
import { usePlannedLiveResults } from '../../../hooks/usePlannedLiveResults';
import { useZoneTracking } from '../../../hooks/useZoneTracking';
import { blockDisplayLabel, fmtClock, fmtDistance, isShortLeg, repNumbers, v2BlockColor } from '../../../lib/planned-rep-results';
import { blockGoal, continuousMainIndex, continuousZone, goalView, heroKind, v2BlockTextColor, zoneLabel } from '../../../lib/continuous-run';
import PlannedSessionListV2 from '../../PlannedRun/v2/PlannedSessionListV2';
import ContinuousRunCardV2 from './ContinuousRunCardV2';

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

const plannedMeta = (b: RunBlock) =>
  b.distanceMeters ? fmtDistance(b.distanceMeters) : b.durationSeconds ? fmtClock(b.durationSeconds) : '';

export default function ContinuousRunLiveV2({
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
  const blockElapsedMeters = useRunningPlayer((s) => s.blockElapsedMeters);
  const isMapFollowEnabled = useRunningPlayer((s) => s.isMapFollowEnabled);
  const setMapFollowEnabled = useRunningPlayer((s) => s.setMapFollowEnabled);

  const { currentBlock: block, currentBlockIndex: idx, blockProgress, blockTimeRemaining, blockDistanceRemaining } = engine;
  const [listOpen, setListOpen] = useState(false);
  // Map camera keeps the runner's marker between the header and the card.
  const chrome = usePublishedPlayerChrome({ topGapPx: 8, bottomGapPx: 12 });

  const zone = useMemo(
    () => continuousZone(block, engine.basePace, engine.zones, engine.showNumbers),
    [block, engine.basePace, engine.zones, engine.showNumbers],
  );
  const mainIndex = useMemo(() => continuousMainIndex(blocks), [blocks]);
  // Only the plan's steady block feeds the saved time-in-zone (not warm-up / cool-down).
  const tracking = useZoneTracking(zone, idx, { publish: idx === mainIndex });
  const live = usePlannedLiveResults(engine);
  const reps = useMemo(() => repNumbers(blocks), [blocks]);

  const totals = {
    durationSec: Number.isFinite(totalDuration) ? totalDuration : 0,
    distanceKm: Number.isFinite(totalDistance) ? totalDistance : 0,
    calories: Number.isFinite(totalCalories) ? totalCalories : 0,
  };
  const goal = blockGoal(block, blockElapsedSeconds, blockElapsedMeters);
  const gv = goal ? goalView(goal) : null;
  const kind = heroKind(goal);
  const showLivePace = !!block && !isShortLeg(block);

  const remaining = !block
    ? '--'
    : block.durationSeconds && block.durationSeconds > 0
      ? fmtClock(blockTimeRemaining)
      : block.distanceMeters && block.distanceMeters > 0
        ? fmtDistance(blockDistanceRemaining)
        : fmtClock(blockElapsedSeconds);

  const plannedKm = useMemo(
    () => (blocks.length > 0 && blocks.every((b) => (b.distanceMeters ?? 0) > 0) ? blocks.reduce((a, b) => a + (b.distanceMeters ?? 0), 0) / 1000 : null),
    [blocks],
  );
  const nextBlock = blocks[idx + 1] ?? null;
  const next = nextBlock ? { label: blockDisplayLabel(nextBlock), meta: plannedMeta(nextBlock), color: v2BlockColor(nextBlock) } : null;

  const segments = useMemo(() => blocks.map((b, i) => ({ key: b.id ?? String(i), color: v2BlockColor(b) })), [blocks]);
  const cartItems = useMemo(() => blocks.map((b, i) => ({ color: v2BlockColor(b), done: i < idx })), [blocks, idx]);
  const color = block ? v2BlockColor(block) : '#a9b7c2';
  const label = block ? zoneLabel(block) : title;

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
          currentBlockIndex={idx}
          records={live.byIndex}
          reps={reps}
          resolveTarget={live.resolve}
          showNumbers={engine.showNumbers}
          currentRemaining={remaining}
          totals={totals}
          onJumpToBlock={onJumpToBlock}
          onClose={() => setListOpen(false)}
        />
      }
      mini={({ startDrag, height, safeBottom }) => (
        <MiniPlayer
          color={color}
          title={block ? `${label} · ${remaining}` : title}
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
          <div ref={chrome.headerRef} className="absolute inset-x-3" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}>
            <PlayerHeaderCard
              onPointerDown={startDrag}
              leading={<CartProgressIcon items={cartItems} onClick={() => setListOpen(true)} size={48} />}
              eyebrow={gv ? `${label} · ${gv.targetText}` : label}
              eyebrowColor={block ? v2BlockTextColor(block) : undefined}
              title={gv ? gv.remainingText : fmtClock(totals.durationSec)}
              trailing={
                gv ? (
                  <span dir="ltr" className="shrink-0 whitespace-nowrap text-[14px] font-black tabular-nums text-v2-deep">{`${gv.percent}%`}</span>
                ) : null
              }
              strip={
                blocks.length > 1 ? (
                  <StoryBars segments={segments} currentIndex={idx} progress={blockProgress} />
                ) : (
                  <HeaderProgressBar progress={blockProgress} color={color} />
                )
              }
            />
            <div className="mt-2 flex justify-start">
              <div className="pointer-events-none">
                <GpsIndicator accuracy={gpsAccuracy} status={gpsStatus} />
              </div>
            </div>
          </div>

          <AnimatePresence>
            {!isMapFollowEnabled && (
              <motion.button
                type="button"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                onClick={() => setMapFollowEnabled(true)}
                aria-label="מרכז את המפה"
                className="pointer-events-auto absolute left-4 top-[calc(env(safe-area-inset-top,0px)+150px)] grid h-11 w-11 place-items-center rounded-full bg-white shadow-v2-ring"
              >
                <LocateFixed size={20} className="text-v2-deep" aria-hidden />
              </motion.button>
            )}
          </AnimatePresence>

          <div ref={chrome.cardRef} className="absolute inset-x-3" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
            <ContinuousRunCardV2
              data={{
                heroKind: kind,
                heroSeconds: goal?.type === 'time' ? goal.current : totals.durationSec,
                heroKm: goal?.type === 'distance' ? goal.current : totals.distanceKm,
                zone,
                tracking,
                currentPaceSec: engine.currentPaceSeconds,
                showLivePace,
                totals,
                plannedKm,
                shortLegRemaining: showLivePace ? null : remaining,
              }}
              next={next}
              canSkip={canSkip}
              onSkip={onSkip}
              isPaused={isPaused}
              onPause={onPause}
              onResume={onResume}
              onLap={triggerLap}
              onStop={onEnd}
            />
          </div>
        </>
      )}
    </PlayerShell>
  );
}
