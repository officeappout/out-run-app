'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import {
  ArrowLeft,
  SkipForward,
  Play,
  Pause,
  LocateFixed,
  ChevronUp,
  Square,
} from 'lucide-react';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useRunningPlayer } from '../../store/useRunningPlayer';
import { usePlannedRunEngine } from '../../hooks/usePlannedRunEngine';
import { audioService } from '@/features/workout-engine/core/services/AudioService';
import GpsIndicator from '@/features/workout-engine/components/GpsIndicator';
import PlannedCarousel from './PlannedCarousel';
import BlockTransitionOverlay from './BlockTransitionOverlay';
import RunStoryBar from './RunStoryBar';
import LongPressPauseButton from './LongPressPauseButton';
import RunBlockPlaylist from './RunBlockPlaylist';
import FloatingMetricBubble from './FloatingMetricBubble';

const PACE_HINT_COOLDOWN_MS = 30_000;
const PACE_HINT_THRESHOLD_S = 10;
const MINI_BAR_HEIGHT = 72;

type PlayerState = 'full' | 'mini' | 'bubble';

interface PlannedRunActiveProps {
  onBack: () => void;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function PlannedRunActive({ onBack }: PlannedRunActiveProps) {
  const { pauseSession, resumeSession, status, totalDuration, totalDistance } =
    useSessionStore();
  const {
    gpsAccuracy,
    gpsStatus,
    tickBlockElapsed,
    advanceBlock,
    jumpToBlock,
    currentWorkout,
    isMapFollowEnabled,
    setMapFollowEnabled,
  } = useRunningPlayer();
  const engine = usePlannedRunEngine();

  const {
    currentBlock,
    currentBlockIndex,
    blockTimeRemaining,
    blockProgress,
    isWorkoutComplete,
    paceStatus,
    currentPaceSeconds,
    targetMinPace,
    targetMaxPace,
  } = engine;

  const isPaused = status === 'paused';
  const [playerState, setPlayerState] = useState<PlayerState>('full');
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [winH, setWinH] = useState(
    typeof window !== 'undefined' ? window.innerHeight : 812,
  );
  const [safeAreaBottom, setSafeAreaBottom] = useState(0);
  const dragControls = useDragControls();
  const safeAreaRef = useRef<HTMLDivElement>(null);

  const minimizedY = winH - MINI_BAR_HEIGHT - safeAreaBottom;

  useEffect(() => {
    const update = () => setWinH(window.innerHeight);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    if (safeAreaRef.current) {
      setSafeAreaBottom(safeAreaRef.current.getBoundingClientRect().height);
    }
  }, []);

  const dragBounds = useMemo(() => {
    if (playerState === 'mini') return { top: 0, bottom: minimizedY + 120 };
    return { top: 0, bottom: minimizedY };
  }, [playerState, minimizedY]);

  // ── Block elapsed ticker ──
  useEffect(() => {
    if (isPaused) return;
    const id = setInterval(() => tickBlockElapsed(), 1000);
    return () => clearInterval(id);
  }, [tickBlockElapsed, isPaused]);

  // ── Auto-advance when block completes ──
  const prevProgressRef = useRef(blockProgress);
  useEffect(() => {
    if (blockProgress >= 1 && prevProgressRef.current < 1 && !isWorkoutComplete) {
      advanceBlock();
    }
    prevProgressRef.current = blockProgress;
  }, [blockProgress, advanceBlock, isWorkoutComplete]);

  // ── Block-start announcement ──
  const prevBlockIndexRef = useRef(currentBlockIndex);
  useEffect(() => {
    if (currentBlockIndex === prevBlockIndexRef.current) return;
    prevBlockIndexRef.current = currentBlockIndex;
    if (!currentBlock) return;

    if (!currentBlock._isSynthesizedRest) {
      audioService.announceBlock(currentBlock.label);
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(currentBlock._isSynthesizedRest ? [50] : [80, 40, 80]);
    }
  }, [currentBlockIndex, currentBlock]);

  // ── Rest block "Get Ready" cue at T-3s ──
  const restCueFiredRef = useRef(false);
  useEffect(() => {
    restCueFiredRef.current = false;
  }, [currentBlockIndex]);
  useEffect(() => {
    if (!currentBlock?._isSynthesizedRest) return;
    if (restCueFiredRef.current) return;
    if (blockTimeRemaining > 3 || blockTimeRemaining <= 0) return;
    restCueFiredRef.current = true;
    audioService.speak('תתכוננו');
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([100, 50, 100]);
    }
  }, [currentBlock, blockTimeRemaining]);

  // ── Pace deviation audio hint ──
  const lastPaceHintRef = useRef(0);
  useEffect(() => {
    if (paceStatus !== 'slow' && paceStatus !== 'fast') return;
    if (currentPaceSeconds <= 0 || targetMinPace <= 0 || targetMaxPace <= 0) return;
    const deviation =
      paceStatus === 'slow'
        ? currentPaceSeconds - targetMaxPace
        : targetMinPace - currentPaceSeconds;
    if (deviation < PACE_HINT_THRESHOLD_S) return;
    const now = Date.now();
    if (now - lastPaceHintRef.current < PACE_HINT_COOLDOWN_MS) return;
    lastPaceHintRef.current = now;
    audioService.announcePaceHint(paceStatus);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([40, 30, 40]);
    }
  }, [paceStatus, currentPaceSeconds, targetMinPace, targetMaxPace]);

  // ── Auto-finish ──
  useEffect(() => {
    if (isWorkoutComplete) {
      const timer = setTimeout(async () => {
        const { finishWorkout } = useRunningPlayer.getState();
        await finishWorkout();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isWorkoutComplete]);

  // ── Force re-render every second for timer display ──
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((p) => p + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const handleSkipBlock = () => {
    if (!isWorkoutComplete) advanceBlock();
  };

  const togglePause = () => {
    if (isPaused) resumeSession();
    else pauseSession();
  };

  const handleFinishWorkout = useCallback(async () => {
    setShowExitConfirm(false);
    const { finishWorkout } = useRunningPlayer.getState();
    await finishWorkout();
  }, []);

  // ── Drag mechanics — mirrors StrengthRunner exactly ──
  const handleDragEnd = useCallback(
    (_: unknown, info: { offset: { y: number }; velocity: { y: number } }) => {
      const { offset, velocity } = info;
      if (playerState === 'full') {
        if (offset.y > 100 || velocity.y > 500) setPlayerState('mini');
      } else if (playerState === 'mini') {
        if (offset.y < -50 || velocity.y < -500) setPlayerState('full');
        else if (offset.y > 80 || velocity.y > 400) setPlayerState('bubble');
      }
    },
    [playerState],
  );

  const handleHeaderPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      dragControls.start(e);
    },
    [dragControls],
  );

  const blocks = currentWorkout?.blocks ?? [];
  const elapsedFormatted = formatElapsed(totalDuration);

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════

  return (
    <div
      className="absolute inset-0 z-20 overflow-hidden font-sans pointer-events-none"
      style={{ fontFamily: 'var(--font-simpler)' }}
    >
      {/* ═══ BUBBLE MODE ═══ */}
      <AnimatePresence>
        {playerState === 'bubble' && (
          <div className="pointer-events-auto">
            <FloatingMetricBubble
              elapsedTime={elapsedFormatted}
              distanceKm={`${totalDistance.toFixed(1)} ק״מ`}
              onExpand={() => setPlayerState('full')}
            />
          </div>
        )}
      </AnimatePresence>

      {/* ═══ RE-CENTER BUTTON (Pillar 6) ═══ */}
      <AnimatePresence>
        {!isMapFollowEnabled && playerState !== 'bubble' && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setMapFollowEnabled(true)}
            className="absolute bottom-28 right-4 z-30 w-10 h-10 rounded-full
                       bg-white/90 shadow-lg flex items-center justify-center pointer-events-auto"
          >
            <LocateFixed size={20} className="text-blue-500" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ═══ BASE LAYER: Block Playlist (only visible when minimized) ═══ */}
      {playerState === 'mini' && (
        <div className="absolute inset-0 z-10 pointer-events-auto">
          <RunBlockPlaylist
            blocks={blocks}
            currentBlockIndex={currentBlockIndex}
            onJumpToBlock={jumpToBlock}
          />
        </div>
      )}

      {/* ═══ TOP LAYER: Draggable Main Player ═══ */}
      <motion.div
        className={`absolute inset-0 z-20 pointer-events-auto shadow-2xl overflow-hidden ${
          playerState === 'mini' ? 'rounded-t-2xl' : ''
        }`}
        animate={{
          y: playerState === 'full' ? 0 : playerState === 'mini' ? minimizedY : winH,
        }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={dragBounds}
        dragElastic={0.12}
        onDragEnd={handleDragEnd}
      >
        {playerState === 'mini' ? (
          /* ──────────────────────────────────────────────────────────────────
             MINI-PLAYER BAR (72px)
             ────────────────────────────────────────────────────────────── */
          <div
            className="flex items-center bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] px-4 gap-3 cursor-pointer relative"
            style={{
              height: MINI_BAR_HEIGHT,
              touchAction: 'none',
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }}
            dir="rtl"
            onClick={() => setPlayerState('full')}
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest('button')) return;
              dragControls.start(e);
            }}
          >
            {/* Drag handle */}
            <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-12 h-1 rounded-full bg-slate-400" />

            {/* Block color indicator — far right in RTL */}
            <div
              className="w-2.5 h-10 rounded-full shrink-0"
              style={{
                backgroundColor: currentBlock?.colorHex || '#00ADEF',
                boxShadow: `0 0 8px ${currentBlock?.colorHex || '#00ADEF'}40`,
              }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">
                {currentBlock?.label ?? 'אימון מתוכנן'}
              </p>
              <p className="text-xs text-slate-500 tabular-nums" dir="ltr">
                {elapsedFormatted} · {engine.currentPaceFormatted} /ק״מ
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                togglePause();
              }}
              className="w-10 h-10 rounded-full bg-slate-800 text-white flex items-center justify-center shrink-0"
            >
              {isPaused ? (
                <Play size={18} fill="currentColor" />
              ) : (
                <Pause size={18} fill="currentColor" />
              )}
            </button>
            <ChevronUp size={18} className="text-slate-400" />
          </div>
        ) : (
          /* ──────────────────────────────────────────────────────────────────
             FULL PLAYER CONTENT
             ────────────────────────────────────────────────────────────── */
          <div className="flex flex-col h-screen bg-transparent overflow-hidden">
            {/* Story Bar header — drag handle area */}
            <header
              className="shrink-0 z-30 bg-white"
              style={{ touchAction: 'none' }}
              onPointerDown={handleHeaderPointerDown}
            >
              {/* Compact top row: drag handle + back button */}
              <div className="flex items-center justify-between px-4 pt-1.5 pb-0">
                <div className="w-8" />
                <div className="w-8 h-0.5 rounded-full bg-slate-300" />
                <button
                  onClick={onBack}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-slate-600 active:bg-slate-100 transition-colors min-w-[44px] min-h-[44px]"
                >
                  <ArrowLeft className="transform rotate-180" size={20} />
                </button>
              </div>

              <RunStoryBar
                blocks={blocks}
                currentBlockIndex={currentBlockIndex}
                blockProgress={blockProgress}
                isPaused={isPaused}
              />
            </header>

            {/* Stats card — full width, rounded bottom only */}
            <section className="bg-white pt-2 pb-3 z-20 shrink-0 relative w-full rounded-b-[2rem] shadow-[0_4px_20px_rgba(0,0,0,0.08)]">
              {/* GPS Indicator — absolute, doesn't affect layout */}
              <div className="absolute top-1 right-4 z-30 pointer-events-none">
                <GpsIndicator accuracy={gpsAccuracy} status={gpsStatus} />
              </div>
              <PlannedCarousel />
            </section>

            {/* Map area — transparent, shows map below + floating action buttons */}
            <section className="flex-grow relative w-full h-full overflow-hidden pointer-events-none">
              <div
                className="absolute w-full px-4 md:px-10 flex justify-between items-end z-20 pointer-events-auto"
                dir="ltr"
                style={{
                  bottom:
                    'calc(4.5rem + env(safe-area-inset-bottom, 0px) + 2rem)',
                }}
              >
                <LongPressPauseButton
                  onConfirm={() => pauseSession()}
                  holdDuration={1.5}
                />

                <button
                  onClick={handleSkipBlock}
                  className="bg-[#00ADEF] text-white min-w-[44px] min-h-[44px] w-16 h-16 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all"
                >
                  <SkipForward size={24} fill="currentColor" />
                </button>
              </div>
            </section>

            {/* Bottom nav */}
            <nav
              className="min-h-[4.5rem] bg-white border-t border-gray-200 flex shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]"
              style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            >
              <div className="flex-1 flex flex-col items-center justify-center gap-1 bg-cyan-50 relative min-h-[44px]">
                <div className="absolute top-0 w-full h-[2px] bg-[#00ADEF]" />
                <span className="text-[#00ADEF] font-medium text-sm">אימון</span>
              </div>
            </nav>
          </div>
        )}
      </motion.div>

      {/* ═══ PAUSE OVERLAY — mirrors StrengthRunner ═══ */}
      <AnimatePresence>
        {isPaused && !showExitConfirm && (
          <motion.div
            key="pause-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center pointer-events-auto"
            style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
            dir="rtl"
          >
            <h1
              className="text-4xl font-black text-white mb-12"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              הפסקה
            </h1>

            {/* Elapsed stats */}
            <div className="flex gap-8 mb-10">
              <div className="text-center">
                <p
                  className="text-3xl font-black text-white tabular-nums"
                  dir="ltr"
                >
                  {elapsedFormatted}
                </p>
                <p className="text-xs text-white/50 mt-1">זמן</p>
              </div>
              <div className="text-center">
                <p
                  className="text-3xl font-black text-white tabular-nums"
                  dir="ltr"
                >
                  {totalDistance.toFixed(1)}
                </p>
                <p className="text-xs text-white/50 mt-1">ק״מ</p>
              </div>
            </div>

            <div className="w-full max-w-xs space-y-3 px-6">
              <button
                onClick={() => resumeSession()}
                className="w-full h-16 rounded-2xl font-bold text-white text-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-lg shadow-cyan-500/30 bg-gradient-to-l from-[#00C9F2] to-[#00AEEF]"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                <Play size={22} fill="white" />
                התחילו שוב
              </button>
              <button
                onClick={() => setShowExitConfirm(true)}
                className="w-full h-16 bg-white rounded-2xl font-bold text-slate-800 text-lg active:scale-[0.98] transition-transform shadow-lg"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                סיום אימון
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ EXIT CONFIRMATION MODAL ═══ */}
      <AnimatePresence>
        {showExitConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-6 pointer-events-auto"
            style={{
              backdropFilter: 'blur(8px)',
              backgroundColor: 'rgba(0,0,0,0.4)',
            }}
            onClick={() => setShowExitConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 22, stiffness: 300 }}
              className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl text-center"
              dir="rtl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-14 h-14 mx-auto mb-5 rounded-full border-2 border-orange-400 flex items-center justify-center">
                <Square size={22} className="text-orange-400" fill="currentColor" />
              </div>

              <h2
                className="text-xl font-black text-slate-900 mb-2"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                בטוחים שאתם רוצים לסיים?
              </h2>
              <p
                className="text-sm text-slate-500 mb-7"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                האימון יישמר עם הנתונים שנאספו עד כה
              </p>

              <button
                onClick={() => {
                  setShowExitConfirm(false);
                  if (isPaused) resumeSession();
                }}
                className="w-full h-14 rounded-2xl font-bold text-white text-base mb-4 bg-gradient-to-l from-[#00C9F2] to-[#00AEEF] shadow-lg shadow-cyan-500/20 active:scale-[0.98] transition-transform"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                יאללה להמשיך
              </button>

              <button
                onClick={handleFinishWorkout}
                className="text-sm text-slate-500 underline underline-offset-2 hover:text-slate-700 transition-colors"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                אני רוצה לסיים את האימון
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Block transition overlay */}
      <BlockTransitionOverlay
        currentBlock={currentBlock}
        currentBlockIndex={currentBlockIndex}
        blockTimeRemaining={blockTimeRemaining}
      />

      {/* Hidden element to measure safe-area-inset-bottom */}
      <div
        ref={safeAreaRef}
        className="fixed bottom-0 left-0 w-0 pointer-events-none"
        style={{ height: 'env(safe-area-inset-bottom, 0px)' }}
      />
    </div>
  );
}
