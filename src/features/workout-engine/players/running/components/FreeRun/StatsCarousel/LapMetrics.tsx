'use client';

import { useState, useEffect } from 'react';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { formatPace } from '@/features/workout-engine/core/utils/formatPace';

export default function LapMetrics() {
  // Direct data fetching from stores
  const { laps } = useRunningPlayer();
  const { status } = useSessionStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Defensive formatting functions
  const formatTime = (seconds: number | undefined | null): string => {
    const safeSeconds = seconds ?? 0;
    if (!safeSeconds || safeSeconds < 0 || !isFinite(safeSeconds)) return '00:00';
    const mins = Math.floor(safeSeconds / 60);
    const secs = Math.floor(safeSeconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatPaceValue = (pace: number | undefined | null): string => {
    const safePace = pace ?? 0;
    if (!safePace || safePace === Infinity || safePace <= 0 || !isFinite(safePace)) return '0:00';
    const mins = Math.floor(safePace);
    const secs = Math.round((safePace % 1) * 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // NO-CRASH FALLBACK: Always have a valid lap object
  const fallbackLap = {
    id: '1',
    lapNumber: 1,
    distanceMeters: 0,
    durationSeconds: 0,
    splitPace: 0,
    isActive: true,
  };

  // Defensive lap selection with multiple fallbacks
  const activeLap = 
    (Array.isArray(laps) && laps.length > 0 && laps.find((lap) => lap?.isActive)) ||
    (Array.isArray(laps) && laps.length > 0 && laps[0]) ||
    fallbackLap;

  // Use optional chaining and nullish coalescing for EVERY value
  const currentLapNumber = activeLap?.lapNumber ?? 1;
  const currentLapDistanceMeters = activeLap?.distanceMeters ?? 0;
  const currentLapDistance = ((currentLapDistanceMeters ?? 0) / 1000).toFixed(2);
  const currentLapPace = formatPaceValue(activeLap?.splitPace);
  const currentLapDuration = activeLap?.durationSeconds ?? 0;
  const currentLapTime = formatTime(activeLap?.durationSeconds);

  // Show loading state only during SSR
  if (!mounted) {
    return (
      <div className="w-full min-h-[180px] flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm" style={{ fontFamily: 'Assistant, sans-serif' }}>
        <div className="text-gray-400 text-sm">טוען...</div>
      </div>
    );
  }

  return (
    <div 
      className="w-full min-h-[180px] flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm" 
      style={{ fontFamily: 'Assistant, sans-serif' }}
    >
      {/* Divider with "הקפה נוכחית" */}
      <div className="flex items-center justify-center gap-4 mb-2 w-full">
        <div className="h-[1px] bg-gray-300 flex-grow max-w-[5rem]"></div>
        <span className="text-gray-400 text-sm font-medium">הקפה נוכחית</span>
        <div className="h-[1px] bg-gray-300 flex-grow max-w-[5rem]"></div>
      </div>

      {/* Lap Number */}
      <div className="text-center mb-4 w-full">
        <div className="text-[4.5rem] font-black text-black leading-none tracking-tight">
          {currentLapNumber ?? 1}
        </div>
        <div className="text-gray-500 text-sm mt-1">הקפה</div>
      </div>

      {/* Horizontal Divider */}
      <div className="h-[1px] bg-gray-200 w-full mb-4"></div>

      {/* Three Columns: Distance, Pace, Time */}
      <div className="flex items-center justify-center w-full">
        <div className="flex-1 text-center border-l border-gray-300 pl-2">
          <div className="text-[2rem] font-bold text-black leading-none">
            {currentLapDistance ?? '0.00'}
          </div>
          <div className="text-gray-500 text-xs mt-1">ק"מ</div>
        </div>
        <div className="flex-1 text-center border-l border-gray-300 pl-2">
          <div className="text-[2rem] font-bold text-black leading-none">
            {currentLapPace ?? '0:00'}
          </div>
          <div className="text-gray-500 text-xs mt-1">קצב</div>
        </div>
        <div className="flex-1 text-center pr-2">
          <div className="text-[2rem] font-bold text-black leading-none">
            {currentLapTime ?? '00:00'}
          </div>
          <div className="text-gray-500 text-xs mt-1">זמן</div>
        </div>
      </div>
    </div>
  );
}
