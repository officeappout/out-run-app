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
import { MiniPlayer, PlayerShell, usePublishedPlayerChrome } from '../../../../shared/v2';
import { useRunningPlayer } from '../../../store/useRunningPlayer';
import type { RunBlock } from '../../../types/run-block.type';
import type { PlannedRunEngine } from '../../../hooks/usePlannedRunEngine';
import { usePlannedLiveResults } from '../../../hooks/usePlannedLiveResults';
import { blockDisplayLabel, fmtClock, fmtDistance, fmtPace, isRestBlock, repNumbers, v2BlockColor } from '../../../lib/planned-rep-results';
import { RunDrawerSheet, RunFloatingButtons, RunHeaderChrome, UnifiedGpsMark, UnifiedHeaderLayer, useMeasuredHeight, type RunDrawerPage } from '../../../../shared/v2/run-chrome';
import { useUnifiedGps } from '../../../hooks/useUnifiedGps';
import { Cell, Cells } from '../../../../shared/v2/run-chrome/RunDrawerBlocks';
import { PAGE_CAPTION_KEY, drawerPagesFor } from '../../../../shared/v2/run-chrome/unified-chrome-logic';
import { useUnifiedPlayerV1 } from '../../../../shared/v2/useUnifiedPlayerV1';
import { together } from '@/messages/ns/together';
import { useRunTogetherChrome } from '@/features/workout-engine/together/hooks/useRunTogetherChrome';
import { usePlannedChromeNodes } from './usePlannedChromeNodes';
import PlannedLiveCardV2 from './PlannedLiveCardV2';
import PlannedSessionListV2 from './PlannedSessionListV2';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import { usePilotAhV1 } from '@/hooks/usePilotAhV1';
import { RouteTurnRow } from '@/features/workout-engine/hybrid/v2/park/ParkMessageRow';

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
  /**
   * enable_run_player_drawer_v1: the card becomes the metrics drawer (the
   * header here is already attached to the top edge). Off = today's layout.
   */
  drawerV1?: boolean;
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
  drawerV1 = false,
}: Props) {
  const pilotAh = usePilotAhV1();
  const t = useT(player);
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
  // Map camera keeps the runner's marker between the header and the card.
  const chrome = usePublishedPlayerChrome({ bottomGapPx: drawerV1 ? 0 : 14, headerIncludesSafeTop: true, drawer: drawerV1 });
  // enable_run_player_drawer_v1: the attached chrome (header layers + sheet + floating buttons); together parts need enable_together_layer_v1.
  const [chromeHeaderRef, chromeHeaderH] = useMeasuredHeight();
  const setHeaderNodes = useCallback((n: HTMLDivElement | null) => { chrome.headerRef(n); chromeHeaderRef(n); }, [chrome, chromeHeaderRef]);

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
  // enable_unified_player_v1: name / bars / data on top, drawer pages, new buttons, pace colour on recovery too.
  const unified = useUnifiedPlayerV1() && drawerV1;
  const chromeNodes = usePlannedChromeNodes({ engine, blocks, reps, totals, blockElapsedSeconds, isPaused, unified });
  const gps = useUnifiedGps(unified);
  const tg = useRunTogetherChrome({ live: chromeNodes.live, headerHeight: chromeHeaderH + 56, enabled: drawerV1 });
  const currentRemaining = !currentBlock
    ? '--'
    : currentBlock.durationSeconds && currentBlock.durationSeconds > 0
      ? fmtClock(blockTimeRemaining)
      : currentBlock.distanceMeters && currentBlock.distanceMeters > 0
        ? fmtDistance(blockDistanceRemaining)
        : fmtClock(blockElapsedSeconds);

  // enable_unified_player_v1: drawer pages "this rep" (or "recovery") then "overview".
  const tt = useT(together);
  const avgPaceSec = totals.distanceKm > 0.05 ? totals.durationSec / totals.distanceKm : 0;
  const generalCells = (size: number) => (
    <Cells>
      <Cell label={tt('chrome.label.time')} value={fmtClock(totals.durationSec)} size={size} />
      <Cell label={tt('chrome.label.km')} value={totals.distanceKm.toFixed(2)} size={size} />
      <Cell label={tt('chrome.label.avgPace')} value={avgPaceSec > 0 ? fmtPace(avgPaceSec) : '--:--'} size={size} />
    </Cells>
  );
  const drawerPages: RunDrawerPage[] | undefined = unified
    ? drawerPagesFor('planned', { lapOn: true }).map((id) => (id === 'general'
      ? { id, caption: tt(PAGE_CAPTION_KEY.general), compact: generalCells(26), large: generalCells(30) }
      : { id, caption: isRestBlock(currentBlock) ? tt('chrome.page.rest') : tt(PAGE_CAPTION_KEY[id]), compact: chromeNodes.compact, large: chromeNodes.large }))
    : undefined;

  const triggerLap = useCallback(() => {
    useRunningPlayer.getState().triggerLap();
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(15);
  }, []);

  const card = (
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
  );

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
          title={currentBlock ? `${blockDisplayLabel(currentBlock)} · ${currentRemaining}` : t('run.planned.mini.fallbackTitle')}
          subtitle={t('run.planned.mini.subtitle', { time: fmtClock(totals.durationSec), km: totals.distanceKm.toFixed(1) })}
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
            {drawerV1 ? (
              <RunHeaderChrome
                outerRef={setHeaderNodes}
                onPointerDown={startDrag}
                layers={tg.layers(
                  unified ? (
                    <UnifiedHeaderLayer
                      title={title}
                      bars={<StoryBars segments={segments} currentIndex={currentBlockIndex} progress={blockProgress} />}
                      label={chromeNodes.caption || undefined}
                      hint={pilotAh ? <RouteTurnRow /> : undefined}
                      flash={gps === 'lost' ? { text: tt('chrome.gps.lostHint'), tone: 'warn' } : null}
                    />
                  ) : (
                  <div className="px-5">
                    <div className="flex h-[46px] flex-col justify-center">
                      <StoryBars segments={segments} currentIndex={currentBlockIndex} progress={blockProgress} />
                      {chromeNodes.caption && <div className="mt-2 text-center text-[13px] font-extrabold text-slate-600">{chromeNodes.caption}</div>}
                    </div>
                    {/* enable_pilot_ah_v1 (AH23): the next turn as one line (MapShell keeps the big card off). */}
                    {pilotAh && <RouteTurnRow />}
                  </div>
                  ),
                )}
                index={tg.layerIndex}
                onIndexChange={tg.setLayerIndex}
                strip={chromeNodes.strip}
                trailing={unified ? <UnifiedGpsMark state={gps} /> : <GpsIndicator accuracy={gpsAccuracy} status={gpsStatus} />}
              />
            ) : (
            <header
              ref={chrome.headerRef}
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
            )}

            {/* Re-centre (map follow) */}
            <AnimatePresence>
              {!isMapFollowEnabled && (
                <motion.button
                  type="button"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  onClick={() => setMapFollowEnabled(true)}
                  aria-label={t('run.planned.recenter')}
                  className="pointer-events-auto absolute right-4 top-[calc(env(safe-area-inset-top,0px)+110px)] grid h-11 w-11 place-items-center rounded-full bg-white shadow-v2-ring"
                >
                  <LocateFixed size={20} className="text-v2-deep" aria-hidden />
                </motion.button>
              )}
            </AnimatePresence>

            {/* The card over the map. */}
            {drawerV1 ? (
              <RunDrawerSheet
                cardRef={chrome.cardRef}
                onHeight={tg.setSheetHeight}
                onOpenList={() => setListOpen(true)}
                compact={chromeNodes.compact}
                large={chromeNodes.large}
                pages={drawerPages}
                override={tg.vsPanel}
                overrideCaption={unified && tg.vsPanel ? tt('chrome.page.vs') : undefined}
                buttons={<RunFloatingButtons unified={unified} isPaused={isPaused} onPause={onPause} onResume={onResume} onLap={triggerLap} onStop={onEnd} />}
              />
            ) : (
              <div ref={chrome.cardRef} className="absolute inset-x-3" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)' }}>
                {card}
              </div>
            )}
            {drawerV1 && tg.overlay}
          </>
      )}
    </PlayerShell>
  );
}
