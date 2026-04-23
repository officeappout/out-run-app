'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Pause, RotateCcw, Map, List, Settings } from 'lucide-react';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import GpsIndicator from '@/features/workout-engine/components/GpsIndicator';
import StatsCarousel from './StatsCarousel';
import RunLapsList from './RunLapsList';
import LapSnapshotOverlay from './LapSnapshotOverlay';
import WorkoutSettingsDrawer from './WorkoutSettingsDrawer';

const CYAN = '#00E5FF';

interface FreeRunActiveProps {
  onBack: () => void;
}

export default function FreeRunActive({ onBack }: FreeRunActiveProps) {
  const { pauseSession } = useSessionStore();
  const { view: playerView, setView: setPlayerView, gpsAccuracy, gpsStatus } = useRunningPlayer();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Force re-render each second to keep the timer display live
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      className="absolute inset-0 z-20 overflow-hidden pointer-events-none"
      style={{ fontFamily: 'var(--font-simpler)' }}
    >

      {/* ── GLASS HEADER ──────────────────────────────────────────────── */}
      <header
        className="absolute top-0 left-0 right-0 z-30 pointer-events-auto"
        style={{ backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}
      >
        <div className="h-14 bg-black/50 border-b border-white/10 flex items-center justify-between px-4">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="relative flex items-center justify-center w-11 h-11 rounded-full active:bg-white/10 transition-colors"
          >
            <Settings size={22} className="text-white/85" />
          </button>

          <div className="flex items-center gap-2">
            {/* Pulsing live indicator */}
            <span
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ background: CYAN, boxShadow: `0 0 8px ${CYAN}88` }}
            />
            <h1 className="text-[15px] font-bold tracking-wider text-white">אימון חופשי</h1>
          </div>

          <button
            onClick={onBack}
            className="flex items-center justify-center w-11 h-11 rounded-full active:bg-white/10 transition-colors"
          >
            <ArrowLeft size={22} className="text-white/85" />
          </button>
        </div>
      </header>

      {/* ── GPS accuracy pill ─────────────────────────────────────────── */}
      {playerView === 'main' && (
        <div className="absolute top-[3.75rem] left-1/2 -translate-x-1/2 z-30 pointer-events-none">
          <GpsIndicator accuracy={gpsAccuracy} status={gpsStatus} />
        </div>
      )}

      {/* ── LAPS LIST (dark overlay, scrollable) ─────────────────────── */}
      {playerView === 'laps' && (
        <div
          className="absolute inset-0 z-10 pt-14 pointer-events-auto"
          style={{
            paddingBottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px))',
            background: 'rgba(0, 0, 0, 0.80)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
          }}
        >
          <RunLapsList />
        </div>
      )}

      {/* ── MAP VIEW: FABs + glass metrics panel ─────────────────────── */}
      {playerView === 'main' && (
        <>
          {/* Floating action buttons — above the metrics panel */}
          <div
            className="absolute left-0 right-0 z-20 flex items-center justify-between px-6 pointer-events-auto"
            dir="ltr"
            style={{
              bottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px) + 180px + 12px)',
            }}
          >
            {/* Pause */}
            <button
              onClick={pauseSession}
              className="w-16 h-16 rounded-full flex items-center justify-center active:scale-95 transition-all"
              style={{
                background: '#FF8C00',
                boxShadow: '0 8px 28px rgba(255,140,0,0.5)',
              }}
            >
              <Pause size={30} fill="white" className="text-white" />
            </button>

            {/* Manual Lap — glass ghost button */}
            <button
              onClick={() => useRunningPlayer.getState().addManualLap()}
              className="w-14 h-14 rounded-full flex items-center justify-center active:scale-95 transition-all"
              style={{
                background: 'rgba(255,255,255,0.14)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                border: `1.5px solid rgba(0,229,255,0.35)`,
                boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
              }}
            >
              <RotateCcw size={22} className="text-white" />
            </button>
          </div>

          {/* Glass metrics panel */}
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
                border: `1px solid rgba(0, 229, 255, 0.18)`,
                boxShadow: '0 -8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
              }}
            >
              <StatsCarousel />
            </div>
          </div>
        </>
      )}

      {/* ── GLASS BOTTOM NAV ─────────────────────────────────────────── */}
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
        {/* Map tab */}
        <button
          onClick={() => setPlayerView('main')}
          className="relative flex-1 flex flex-col items-center justify-center gap-1 min-h-[44px] active:bg-white/5 transition-colors"
        >
          {playerView === 'main' && (
            <span
              className="absolute top-0 left-[25%] right-[25%] h-[2px] rounded-b-full"
              style={{ background: CYAN }}
            />
          )}
          <Map size={22} style={{ color: playerView === 'main' ? CYAN : 'rgba(255,255,255,0.38)' }} />
          <span
            className="font-medium text-xs"
            style={{ color: playerView === 'main' ? CYAN : 'rgba(255,255,255,0.38)' }}
          >
            מפה
          </span>
        </button>

        {/* Laps tab */}
        <button
          onClick={() => setPlayerView('laps')}
          className="relative flex-1 flex flex-col items-center justify-center gap-1 min-h-[44px] active:bg-white/5 transition-colors"
        >
          {playerView === 'laps' && (
            <span
              className="absolute top-0 left-[25%] right-[25%] h-[2px] rounded-b-full"
              style={{ background: CYAN }}
            />
          )}
          <List
            size={22}
            className="rotate-90"
            style={{ color: playerView === 'laps' ? CYAN : 'rgba(255,255,255,0.38)' }}
          />
          <span
            className="font-medium text-xs"
            style={{ color: playerView === 'laps' ? CYAN : 'rgba(255,255,255,0.38)' }}
          >
            הקפות
          </span>
        </button>
      </nav>

      {/* Global overlays */}
      <LapSnapshotOverlay />
      <WorkoutSettingsDrawer isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}
