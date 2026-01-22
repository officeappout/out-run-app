'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Pause, RotateCcw, Map, List, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import GpsIndicator from '@/features/workout-engine/components/GpsIndicator';
import StatsCarousel from './StatsCarousel';
import RunLapsList from './RunLapsList';
import LapSnapshotOverlay from './LapSnapshotOverlay';
import WorkoutSettingsDrawer from './WorkoutSettingsDrawer';

interface FreeRunActiveProps {
  onBack: () => void;
}

export default function FreeRunActive({ onBack }: FreeRunActiveProps) {
  const router = useRouter();
  const { pauseSession, endSession } = useSessionStore();
  const { view: playerView, setView: setPlayerView, gpsAccuracy, gpsStatus } = useRunningPlayer();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Force re-render every second to update timer
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      forceUpdate((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handlePause = () => {
    pauseSession();
  };

  const handleReset = () => {
    endSession();
    router.push('/map');
  };

  return (
    <div
      className="absolute inset-0 z-20 flex flex-col overflow-hidden font-sans pointer-events-none"
      style={{ fontFamily: 'Assistant, sans-serif' }}
    >
      {/* HEADER: Fixed cyan header with back button and settings */}
      <header className="bg-[#00ADEF] text-white h-14 min-h-[3.5rem] flex items-center justify-between px-4 shadow-sm z-30 shrink-0 pointer-events-auto">
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="w-8 h-8 flex items-center justify-center rounded-full active:bg-white/20 transition-colors min-w-[44px] min-h-[44px]"
        >
          <Settings size={24} />
        </button>
        <h1 className="text-lg font-bold tracking-wide">אימון חופשי</h1>
        <button
          onClick={onBack}
          className="w-8 h-8 flex items-center justify-center rounded-full active:bg-white/20 transition-colors min-w-[44px] min-h-[44px]"
        >
          <ArrowLeft className="text-2xl transform rotate-180" size={24} />
        </button>
      </header>

      {/* GPS Indicator: Positioned below header, centered */}
      {playerView === 'main' && (
        <div className="absolute top-16 left-1/2 transform -translate-x-1/2 z-30 pointer-events-none">
          <GpsIndicator accuracy={gpsAccuracy} status={gpsStatus} />
        </div>
      )}

      {/* MAIN: Flex-grow container */}
      <main className="flex-grow flex flex-col relative overflow-hidden">
        {/* STATS SECTION: White card with swipeable carousel (only show on map view) */}
        {playerView === 'main' && (
          <section className="bg-white pt-5 pb-4 px-6 z-20 shadow-sm shrink-0 relative rounded-b-[2rem] pointer-events-auto">
            <StatsCarousel />
          </section>
        )}

        {/* CONTENT SECTION: Map or Laps List based on view */}
        <section className="flex-grow relative w-full h-full overflow-hidden pointer-events-none">
          {/* Laps List View */}
          {playerView === 'laps' && (
            <div className="absolute inset-0 z-10 pointer-events-auto">
              <RunLapsList />
            </div>
          )}
          
          {/* Map View (rendered behind by parent) */}
          {playerView === 'main' && (
            <>
              <div className="absolute inset-0 pointer-events-none">
                {/* Map is rendered by parent component */}
              </div>
              
              {/* Floating Action Buttons: Pause (Orange) and Reset (Cyan) */}
              <div
                className="absolute bottom-8 w-full px-4 md:px-10 flex justify-between items-end z-20 pointer-events-auto"
                dir="ltr"
                style={{
                  bottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px) + 2rem)',
                }}
              >
                <button
                  onClick={handlePause}
                  className="group bg-[#FF8C00] text-white min-w-[44px] min-h-[44px] w-16 h-16 rounded-full flex items-center justify-center shadow-lg transform active:scale-95 transition-all hover:bg-orange-600 hover:shadow-orange-500/50"
                >
                  <Pause size={32} fill="currentColor" />
                </button>
                <button
                  onClick={() => {
                    console.log('Manual Lap Added');
                    useRunningPlayer.getState().addManualLap();
                  }}
                  className="group bg-[#00ADEF] text-white min-w-[44px] min-h-[44px] w-16 h-16 rounded-full flex items-center justify-center shadow-lg transform active:scale-95 transition-all hover:bg-sky-500 hover:shadow-cyan-500/50"
                >
                  <RotateCcw size={24} fill="currentColor" />
                </button>
              </div>

              {/* Map Attribution (bottom-right) */}
              <div className="absolute bottom-2 right-2 text-[10px] text-white/30 pointer-events-none">
                © OpenMapTiles
              </div>
            </>
          )}
        </section>
      </main>

      {/* BOTTOM NAVIGATION: Fixed nav with Map and Laps tabs */}
      <nav
        className="min-h-[4.5rem] bg-white border-t border-gray-200 flex shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] pointer-events-auto"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <button
          onClick={() => setPlayerView('main')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors duration-200 relative min-h-[44px] ${
            playerView === 'main'
              ? 'bg-cyan-50'
              : 'bg-transparent hover:bg-gray-50'
          }`}
        >
          {playerView === 'main' && (
            <div className="absolute top-0 w-full h-[2px] bg-[#00ADEF]"></div>
          )}
          <Map
            size={24}
            className={playerView === 'main' ? 'text-[#00ADEF]' : 'text-gray-400'}
          />
          <span
            className={`font-medium text-sm ${
              playerView === 'main' ? 'text-[#00ADEF]' : 'text-gray-500'
            }`}
          >
            מפה
          </span>
        </button>
        <button
          onClick={() => setPlayerView('laps')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors duration-200 min-h-[44px] ${
            playerView === 'laps'
              ? 'bg-cyan-50'
              : 'bg-transparent hover:bg-gray-50'
          }`}
        >
          <List
            size={24}
            className={`transform rotate-90 ${
              playerView === 'laps' ? 'text-[#00ADEF]' : 'text-gray-400'
            }`}
          />
          <span
            className={`font-medium text-sm ${
              playerView === 'laps' ? 'text-[#00ADEF]' : 'text-gray-500'
            }`}
          >
            הקפות
          </span>
        </button>
      </nav>

      {/* Lap Snapshot Overlay - appears over everything */}
      <LapSnapshotOverlay />

      {/* Settings Drawer */}
      <WorkoutSettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}
