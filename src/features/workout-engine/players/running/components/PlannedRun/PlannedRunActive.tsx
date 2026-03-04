'use client';

import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Pause, SkipForward } from 'lucide-react';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useRunningPlayer } from '../../store/useRunningPlayer';
import { usePlannedRunEngine } from '../../hooks/usePlannedRunEngine';
import GpsIndicator from '@/features/workout-engine/components/GpsIndicator';
import BlockHeader from './BlockHeader';
import PlannedCarousel from './PlannedCarousel';
import BlockTransitionOverlay from './BlockTransitionOverlay';

interface PlannedRunActiveProps {
  onBack: () => void;
}

export default function PlannedRunActive({ onBack }: PlannedRunActiveProps) {
  const { pauseSession } = useSessionStore();
  const { gpsAccuracy, gpsStatus, tickBlockElapsed, advanceBlock } =
    useRunningPlayer();
  const engine = usePlannedRunEngine();

  const {
    currentBlock,
    currentBlockIndex,
    totalBlocks,
    blockTimeRemaining,
    blockDistanceRemaining,
    blockProgress,
    targetZoneLabel,
    isWorkoutComplete,
  } = engine;

  // Block elapsed ticker — runs every second while session is active
  useEffect(() => {
    const id = setInterval(() => {
      tickBlockElapsed();
    }, 1000);
    return () => clearInterval(id);
  }, [tickBlockElapsed]);

  // Auto-advance when the current block completes (time-based)
  const prevProgressRef = useRef(blockProgress);
  useEffect(() => {
    if (blockProgress >= 1 && prevProgressRef.current < 1 && !isWorkoutComplete) {
      advanceBlock();
    }
    prevProgressRef.current = blockProgress;
  }, [blockProgress, advanceBlock, isWorkoutComplete]);

  // ── Rest block "Get Ready" cue: audio + haptic at T-3s ────────────
  const restCueFiredRef = useRef(false);
  useEffect(() => {
    restCueFiredRef.current = false;
  }, [currentBlockIndex]);

  useEffect(() => {
    if (!currentBlock?._isSynthesizedRest) return;
    if (restCueFiredRef.current) return;
    if (blockTimeRemaining > 3 || blockTimeRemaining <= 0) return;

    restCueFiredRef.current = true;

    import('@/features/workout-engine/core/services/AudioService').then(
      ({ audioService }) => audioService.speak('תתכוננו'),
    );
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([100, 50, 100]);
    }
  }, [currentBlock, blockTimeRemaining]);

  // When workout is complete, auto-finish
  useEffect(() => {
    if (isWorkoutComplete) {
      const timer = setTimeout(async () => {
        const { finishWorkout } = useRunningPlayer.getState();
        await finishWorkout();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isWorkoutComplete]);

  // Force re-render every second for timer display
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((p) => p + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const handleSkipBlock = () => {
    if (!isWorkoutComplete) advanceBlock();
  };

  return (
    <div
      className="absolute inset-0 z-20 flex flex-col overflow-hidden font-sans pointer-events-none"
      style={{ fontFamily: 'var(--font-simpler)' }}
    >
      {/* HEADER */}
      <header className="bg-[#00ADEF] text-white h-14 min-h-[3.5rem] flex items-center justify-between px-4 shadow-sm z-30 shrink-0 pointer-events-auto">
        <div className="w-11" />
        <h1 className="text-lg font-bold tracking-wide">אימון מתוכנן</h1>
        <button
          onClick={onBack}
          className="w-8 h-8 flex items-center justify-center rounded-full active:bg-white/20 transition-colors min-w-[44px] min-h-[44px]"
        >
          <ArrowLeft className="transform rotate-180" size={24} />
        </button>
      </header>

      {/* GPS Indicator */}
      <div className="absolute top-16 left-1/2 transform -translate-x-1/2 z-30 pointer-events-none">
        <GpsIndicator accuracy={gpsAccuracy} status={gpsStatus} />
      </div>

      {/* MAIN */}
      <main className="flex-grow flex flex-col relative overflow-hidden">
        {/* Stats card */}
        <section className="bg-white pt-3 pb-2 px-4 z-20 shadow-sm shrink-0 relative rounded-b-[2rem] pointer-events-auto">
          {/* Block header — always visible above carousel */}
          <div className="mb-2">
            <BlockHeader
              currentBlock={currentBlock}
              currentBlockIndex={currentBlockIndex}
              totalBlocks={totalBlocks}
              blockTimeRemaining={blockTimeRemaining}
              blockDistanceRemaining={blockDistanceRemaining}
              blockProgress={blockProgress}
              zoneLabel={targetZoneLabel}
            />
          </div>

          {/* Swipeable carousel: General Metrics / Interval Gauge */}
          <PlannedCarousel />
        </section>

        {/* Map area (rendered behind by parent) */}
        <section className="flex-grow relative w-full h-full overflow-hidden pointer-events-none">
          {/* Floating action buttons */}
          <div
            className="absolute w-full px-4 md:px-10 flex justify-between items-end z-20 pointer-events-auto"
            dir="ltr"
            style={{
              bottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px) + 2rem)',
            }}
          >
            {/* Pause */}
            <button
              onClick={() => pauseSession()}
              className="bg-[#FF8C00] text-white min-w-[44px] min-h-[44px] w-16 h-16 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all"
            >
              <Pause size={32} fill="currentColor" />
            </button>

            {/* Skip to next block */}
            <button
              onClick={handleSkipBlock}
              className="bg-[#00ADEF] text-white min-w-[44px] min-h-[44px] w-16 h-16 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all"
            >
              <SkipForward size={24} fill="currentColor" />
            </button>
          </div>
        </section>
      </main>

      {/* Bottom nav (map only — no laps tab for planned run) */}
      <nav
        className="min-h-[4.5rem] bg-white border-t border-gray-200 flex shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] pointer-events-auto"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex-1 flex flex-col items-center justify-center gap-1 bg-cyan-50 relative min-h-[44px]">
          <div className="absolute top-0 w-full h-[2px] bg-[#00ADEF]" />
          <span className="text-[#00ADEF] font-medium text-sm">אימון</span>
        </div>
      </nav>

      {/* Block transition overlay (rest blocks show persistent countdown) */}
      <BlockTransitionOverlay
        currentBlock={currentBlock}
        currentBlockIndex={currentBlockIndex}
        blockTimeRemaining={blockTimeRemaining}
      />
    </div>
  );
}
