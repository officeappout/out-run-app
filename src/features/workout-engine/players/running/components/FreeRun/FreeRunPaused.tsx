'use client';

import { useState } from 'react';
import { ArrowLeft, Play, RotateCcw, Map, List, Settings } from 'lucide-react';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import StatsCarousel from './StatsCarousel';
import WorkoutSettingsDrawer from './WorkoutSettingsDrawer';

const ORANGE = '#FF8C00';
const CYAN = '#00E5FF';

interface FreeRunPausedProps {
  onBack: () => void;
}

export default function FreeRunPaused({ onBack }: FreeRunPausedProps) {
  const { resumeSession } = useSessionStore();
  const { view: playerView, setView: setPlayerView } = useRunningPlayer();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleResume = () => resumeSession();

  const handleReset = async () => {
    const { finishWorkout } = useRunningPlayer.getState();
    await finishWorkout();
  };

  return (
    <div
      className="absolute inset-0 z-20 overflow-hidden pointer-events-none"
      style={{ fontFamily: 'var(--font-simpler)' }}
    >

      {/* ── GLASS HEADER (orange accent for paused state) ─────────────── */}
      <header
        className="absolute top-0 left-0 right-0 z-30 pointer-events-auto"
        style={{ backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}
      >
        <div className="h-14 bg-black/50 border-b border-white/10 flex items-center justify-between px-4">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center justify-center w-11 h-11 rounded-full active:bg-white/10 transition-colors"
          >
            <Settings size={22} className="text-white/85" />
          </button>

          <div className="flex items-center gap-2">
            {/* Paused indicator — orange, no pulse */}
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: ORANGE, boxShadow: `0 0 8px ${ORANGE}88` }}
            />
            <h1 className="text-[15px] font-bold tracking-wider text-white">מושהה</h1>
          </div>

          <button
            onClick={onBack}
            className="flex items-center justify-center w-11 h-11 rounded-full active:bg-white/10 transition-colors"
          >
            <ArrowLeft size={22} className="text-white/85" />
          </button>
        </div>
      </header>

      {/* ── Floating action buttons — Resume + End ─────────────────────── */}
      <div
        className="absolute left-0 right-0 z-20 flex items-center justify-between px-6 pointer-events-auto"
        dir="ltr"
        style={{
          bottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px) + 180px + 12px)',
        }}
      >
        {/* Resume */}
        <button
          onClick={handleResume}
          className="w-16 h-16 rounded-full flex items-center justify-center active:scale-95 transition-all"
          style={{
            background: ORANGE,
            boxShadow: '0 8px 28px rgba(255,140,0,0.5)',
          }}
        >
          <Play size={30} fill="white" className="text-white ms-1" />
        </button>

        {/* End workout — red ghost button */}
        <button
          onClick={handleReset}
          className="w-14 h-14 rounded-full flex items-center justify-center active:scale-95 transition-all"
          style={{
            background: 'rgba(239,68,68,0.18)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            border: '1.5px solid rgba(239,68,68,0.45)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
          }}
        >
          <RotateCcw size={22} className="text-white" />
        </button>
      </div>

      {/* ── Glass metrics panel ─────────────────────────────────────────── */}
      <div
        className="absolute left-0 right-0 z-20 px-3 pb-3 pointer-events-auto"
        style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div
          className="rounded-3xl overflow-hidden"
          style={{
            background: 'rgba(5, 8, 18, 0.75)',
            backdropFilter: 'blur(22px)',
            WebkitBackdropFilter: 'blur(22px)',
            border: `1px solid rgba(255, 140, 0, 0.18)`,
            boxShadow: '0 -8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          <StatsCarousel />
        </div>
      </div>

      {/* ── GLASS BOTTOM NAV ─────────────────────────────────────────────── */}
      <nav
        className="absolute bottom-0 left-0 right-0 z-30 flex pointer-events-auto"
        style={{
          minHeight: '4.5rem',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          background: 'rgba(5, 8, 18, 0.88)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 -2px 20px rgba(0,0,0,0.45)',
        }}
      >
        <button
          onClick={() => setPlayerView('main')}
          className="relative flex-1 flex flex-col items-center justify-center gap-1 min-h-[44px] active:bg-white/5 transition-colors"
        >
          {playerView === 'main' && (
            <span
              className="absolute top-0 left-[25%] right-[25%] h-[2px] rounded-b-full"
              style={{ background: ORANGE }}
            />
          )}
          <Map size={22} style={{ color: playerView === 'main' ? ORANGE : 'rgba(255,255,255,0.38)' }} />
          <span
            className="font-medium text-xs"
            style={{ color: playerView === 'main' ? ORANGE : 'rgba(255,255,255,0.38)' }}
          >
            מפה
          </span>
        </button>

        <button
          onClick={() => setPlayerView('laps')}
          className="relative flex-1 flex flex-col items-center justify-center gap-1 min-h-[44px] active:bg-white/5 transition-colors"
        >
          {playerView === 'laps' && (
            <span
              className="absolute top-0 left-[25%] right-[25%] h-[2px] rounded-b-full"
              style={{ background: ORANGE }}
            />
          )}
          <List
            size={22}
            className="rotate-90"
            style={{ color: playerView === 'laps' ? ORANGE : 'rgba(255,255,255,0.38)' }}
          />
          <span
            className="font-medium text-xs"
            style={{ color: playerView === 'laps' ? ORANGE : 'rgba(255,255,255,0.38)' }}
          >
            הקפות
          </span>
        </button>
      </nav>

      <WorkoutSettingsDrawer isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}
