"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Map, List, Pause, RotateCcw } from 'lucide-react';
import { useSessionStore } from '../../../core/store/useSessionStore';
import { useRunningPlayer } from '../store/useRunningPlayer';
import { formatPace } from '../../../core/utils/formatPace';

interface FreeRunViewProps {
  nextStation?: string;
}

const formatDuration = (totalSeconds: number): string => {
  if (!totalSeconds || totalSeconds <= 0) return '00:00';
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const FreeRunView: React.FC<FreeRunViewProps> = ({ nextStation }) => {
  const router = useRouter();
  const { totalDistance, totalDuration, status, pauseSession, resumeSession, endSession } = useSessionStore();
  const { currentPace, view: playerView, setView: setPlayerView } = useRunningPlayer();

  // Force re-render every second to update timer
  const [, forceUpdate] = React.useState(0);
  React.useEffect(() => {
    if (status === 'active') {
      const interval = setInterval(() => {
        forceUpdate(prev => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [status]);

  const isPaused = status === 'paused';

  const handleBack = () => {
    endSession();
    router.push('/map');
  };

  const handlePause = () => {
    if (isPaused) {
      resumeSession();
    } else {
      pauseSession();
    }
  };

  const handleReset = () => {
    // End the workout session
    endSession();
    router.push('/map');
  };

  // Safe data formatting - handle 0, NaN, or undefined
  const safeDistance = totalDistance && isFinite(totalDistance) ? totalDistance : 0;
  const safeDuration = totalDuration && isFinite(totalDuration) ? totalDuration : 0;
  const safePace = currentPace && isFinite(currentPace) && currentPace > 0 ? currentPace : 0;
  
  const distanceText = safeDistance.toFixed(2);
  const durationText = formatDuration(safeDuration);
  const paceText = formatPace(safePace);

  return (
    <div className="absolute inset-0 z-20 flex flex-col overflow-hidden font-sans pointer-events-none" style={{ fontFamily: 'Rubik, sans-serif' }}>
      {/* HEADER: Fixed cyan header with back button */}
      <header className="bg-[#00ADEF] text-white h-14 min-h-[3.5rem] flex items-center justify-between px-4 shadow-sm z-30 shrink-0 pointer-events-auto">
        <div className="w-8"></div>
        <h1 className="text-lg font-bold tracking-wide">שם אימון חופשי</h1>
        <button
          onClick={handleBack}
          className="w-8 h-8 flex items-center justify-center rounded-full active:bg-white/20 transition-colors"
        >
          <ArrowLeft className="text-2xl transform rotate-180" size={24} />
        </button>
      </header>

      {/* MAIN: Flex-grow container */}
      <main className="flex-grow flex flex-col relative overflow-hidden">
        {/* STATS SECTION: White section with rounded-b-[2rem] */}
        <section className="bg-white pt-5 pb-4 px-6 z-20 shadow-md shrink-0 relative rounded-b-[2rem] pointer-events-auto">
          {/* Divider with "נתונים כלליים" */}
          <div className="flex items-center justify-center gap-4 mb-2">
            <div className="h-[1px] bg-gray-300 flex-grow max-w-[5rem]"></div>
            <span className="text-gray-400 text-sm font-medium">נתונים כלליים</span>
            <div className="h-[1px] bg-gray-300 flex-grow max-w-[5rem]"></div>
          </div>

          {/* Huge Distance */}
          <div className="text-center mb-4">
            <div className="text-[4.5rem] font-black text-black leading-none tracking-tight">
              {distanceText}
            </div>
            <div className="text-gray-500 text-sm mt-1">קילומטר</div>
          </div>

          {/* Horizontal Divider */}
          <div className="h-[1px] bg-gray-200 w-full mb-4"></div>

          {/* Two Columns: Pace (left) and Time (right) */}
          <div className="flex items-center justify-center mb-6">
            <div className="flex-1 text-center border-l border-gray-300 pl-4">
              <div className="text-[2.5rem] font-bold text-black leading-none">
                {paceText}
              </div>
              <div className="text-gray-500 text-xs mt-1">קצב ממוצע</div>
            </div>
            <div className="flex-1 text-center pr-4">
              <div className="text-[2.5rem] font-bold text-black leading-none">
                {durationText}
              </div>
              <div className="text-gray-500 text-xs mt-1">זמן</div>
            </div>
          </div>

          {/* Pagination Dots */}
          <div className="flex justify-center gap-2">
            <div className="w-2 h-2 rounded-full bg-gray-300"></div>
            <div className="w-2 h-2 rounded-full bg-[#00ADEF]"></div>
          </div>
        </section>

        {/* MAP SECTION: Full-height map area (map rendered behind by parent) */}
        <section className="flex-grow relative w-full h-full overflow-hidden pointer-events-none">
          {/* Floating Action Buttons: Pause (Orange) and Reset (Cyan) */}
          <div className="absolute bottom-8 w-full px-10 flex justify-between items-end z-20 pointer-events-auto" dir="ltr">
            <button
              onClick={handlePause}
              className="group bg-[#FF8C00] text-white w-16 h-16 rounded-full flex items-center justify-center shadow-lg transform active:scale-95 transition-all hover:bg-orange-600 hover:shadow-orange-500/50"
            >
              <Pause size={32} fill="currentColor" />
            </button>
            <button
              onClick={handleReset}
              className="group bg-[#00ADEF] text-white w-16 h-16 rounded-full flex items-center justify-center shadow-lg transform active:scale-95 transition-all hover:bg-sky-500 hover:shadow-cyan-500/50"
            >
              <RotateCcw size={24} fill="currentColor" />
            </button>
          </div>

          {/* Map Attribution (bottom-right) */}
          <div className="absolute bottom-2 right-2 text-[10px] text-white/30 pointer-events-none">
            © OpenMapTiles
          </div>
        </section>
      </main>

      {/* BOTTOM NAVIGATION: Fixed nav with Map and Laps tabs */}
      <nav className="h-[4.5rem] bg-white border-t border-gray-200 flex shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] pointer-events-auto">
        <button
          onClick={() => setPlayerView('main')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors duration-200 relative ${
            playerView === 'main' ? 'bg-cyan-50' : 'bg-transparent hover:bg-gray-50'
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
          className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors duration-200 ${
            playerView === 'laps' ? 'bg-cyan-50' : 'bg-transparent hover:bg-gray-50'
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
    </div>
  );
};
