'use client';

import { ArrowLeft, Play, RotateCcw } from 'lucide-react';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useRunningPlayer } from '../../store/useRunningPlayer';
import { usePlannedRunEngine } from '../../hooks/usePlannedRunEngine';
import BlockHeader from './BlockHeader';
import PlannedCarousel from './PlannedCarousel';

interface PlannedRunPausedProps {
  onBack: () => void;
}

export default function PlannedRunPaused({ onBack }: PlannedRunPausedProps) {
  const { resumeSession } = useSessionStore();
  const engine = usePlannedRunEngine();

  const {
    currentBlock,
    currentBlockIndex,
    totalBlocks,
    blockTimeRemaining,
    blockDistanceRemaining,
    blockProgress,
    targetZoneLabel,
  } = engine;

  const handleResume = () => resumeSession();

  const handleFinish = async () => {
    const { finishWorkout } = useRunningPlayer.getState();
    await finishWorkout();
  };

  return (
    <div
      className="absolute inset-0 z-20 flex flex-col overflow-hidden font-sans pointer-events-none"
      style={{ fontFamily: 'var(--font-simpler)' }}
    >
      {/* HEADER — orange (paused) */}
      <header className="bg-[#FF8C00] text-white h-14 min-h-[3.5rem] flex items-center justify-between px-4 shadow-sm z-30 shrink-0 pointer-events-auto">
        <div className="w-11" />
        <h1 className="text-lg font-bold tracking-wide">מושהה</h1>
        <button
          onClick={onBack}
          className="w-8 h-8 flex items-center justify-center rounded-full active:bg-white/20 transition-colors min-w-[44px] min-h-[44px]"
        >
          <ArrowLeft className="transform rotate-180" size={24} />
        </button>
      </header>

      {/* MAIN */}
      <main className="flex-grow flex flex-col relative overflow-hidden">
        {/* Stats card */}
        <section className="bg-white pt-3 pb-2 px-4 z-20 shadow-sm shrink-0 relative rounded-b-[2rem] pointer-events-auto">
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
          <PlannedCarousel />
        </section>

        {/* Map area — floating buttons */}
        <section className="flex-grow relative w-full h-full overflow-hidden pointer-events-none">
          <div
            className="absolute w-full px-4 md:px-10 flex justify-between items-end z-20 pointer-events-auto"
            dir="ltr"
            style={{
              bottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px) + 2rem)',
            }}
          >
            {/* Resume */}
            <button
              onClick={handleResume}
              className="bg-[#FF8C00] text-white min-w-[44px] min-h-[44px] w-16 h-16 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all"
            >
              <Play size={32} fill="currentColor" className="ml-1" />
            </button>

            {/* Finish / Stop */}
            <button
              onClick={handleFinish}
              className="bg-[#EF4444] text-white min-w-[44px] min-h-[44px] w-16 h-16 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all"
            >
              <RotateCcw size={24} fill="currentColor" />
            </button>
          </div>
        </section>
      </main>

      {/* Bottom nav */}
      <nav
        className="min-h-[4.5rem] bg-white border-t border-gray-200 flex shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] pointer-events-auto"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex-1 flex flex-col items-center justify-center gap-1 bg-orange-50 relative min-h-[44px]">
          <div className="absolute top-0 w-full h-[2px] bg-[#FF8C00]" />
          <span className="text-[#FF8C00] font-medium text-sm">אימון</span>
        </div>
      </nav>
    </div>
  );
}
