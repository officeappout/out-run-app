'use client';

import React from 'react';
import { useMapMode } from '@/features/parks/core/context/MapModeContext';
import { ActiveDashboard } from '@/features/workout-engine/players/running';
import { useMapLogic } from '@/features/parks';
import { Play, Navigation, MapPin } from 'lucide-react';

type MapLogic = ReturnType<typeof useMapLogic>;

const BRAND_COLOR = '#00E5FF';

interface FreeRunLayerProps {
  logic: MapLogic;
}

export default function FreeRunLayer({ logic }: FreeRunLayerProps) {
  const { setMode } = useMapMode();

  const handleStartFreeRun = () => {
    logic.setWorkoutMode('free');
    logic.startActiveWorkout();
  };

  const handleBackToDiscover = () => {
    logic.setWorkoutMode('discover');
    setMode('discover');
  };

  // Active free run — show GPS tracking dashboard
  if (logic.isWorkoutActive) {
    return (
      <div className="absolute inset-0 z-20 pointer-events-none">
        <ActiveDashboard />
      </div>
    );
  }

  // Pre-run — minimal UI with start button and mode toggle
  return (
    <>
      {/* Mode toggle (discover / free) */}
      <div className="absolute top-[max(1.5rem,env(safe-area-inset-top))] left-0 right-0 z-30 px-4">
        <div className="max-w-xs mx-auto flex bg-white/90 backdrop-blur-sm rounded-2xl shadow-md border border-gray-100 overflow-hidden">
          <button
            onClick={handleBackToDiscover}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <MapPin size={14} />
            <span>גלה</span>
          </button>
          <button
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold bg-[#00E5FF] text-white transition-colors"
          >
            <Navigation size={14} />
            <span>חופשי</span>
          </button>
        </div>
      </div>

      {/* Location button */}
      <div className="absolute right-4 z-40 bottom-40">
        <button onClick={logic.handleLocationClick} className="w-12 h-12 rounded-full shadow-xl flex items-center justify-center bg-white pointer-events-auto active:scale-95 transition-all">
          <Navigation size={20} fill={logic.isFollowing ? BRAND_COLOR : 'none'} color={logic.isFollowing ? BRAND_COLOR : '#6B7280'} />
        </button>
      </div>

      {/* Start Free Run button */}
      <div className="absolute bottom-[max(6rem,env(safe-area-inset-bottom))] left-4 right-4 z-20 flex justify-center">
        <button
          onClick={handleStartFreeRun}
          className="px-10 py-4 rounded-2xl bg-gradient-to-r from-[#00E5FF] to-[#00BAF7] text-white font-black text-lg shadow-2xl active:scale-[0.97] transition-all flex items-center gap-3"
        >
          <Play size={22} fill="white" />
          <span>התחל ריצה חופשית</span>
        </button>
      </div>
    </>
  );
}
