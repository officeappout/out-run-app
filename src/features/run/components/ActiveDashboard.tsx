import React, { useEffect, useState } from 'react';
import { ActivityType } from '@/features/map/types/map-objects.type';
import { Navigation, Flame, Clock, MapPin } from 'lucide-react';

interface Props {
  mode: ActivityType; // 'run' | 'walk' | 'cycling'
  startTime: number;
  distance: number;
  averagePace: number;
  calories: number;
  nextStation?: string;
}

// Transparent Glassmorphism Dashboard
export const ActiveDashboard: React.FC<Props> = ({
  mode,
  startTime,
  distance,
  averagePace,
  calories,
  nextStation
}) => {
  const [duration, setDuration] = useState('00:00');
  const isWalk = mode === 'walking';

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      const diff = Math.floor((now - startTime) / 1000);
      const minutes = Math.floor(diff / 60).toString().padStart(2, '0');
      const seconds = (diff % 60).toString().padStart(2, '0');
      setDuration(`${minutes}:${seconds}`);
    }, 1000);
    return () => clearInterval(timer);
  }, [startTime]);

  const formatPace = (paceMinutes: number): string => {
    if (paceMinutes === 0 || !isFinite(paceMinutes)) return '00:00';
    const minutes = Math.floor(paceMinutes);
    const seconds = Math.floor((paceMinutes - minutes) * 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="absolute top-0 left-0 right-0 p-4 pt-4 z-20 pointer-events-none">
      {/* Glass Card */}
      <div className="pointer-events-auto rounded-[2rem] bg-white/10 backdrop-blur-md border border-white/20 text-white shadow-xl p-6 mx-auto w-full max-w-md">

        {/* Top Row: Main Stats */}
        <div className="flex justify-between items-end mb-4">

          {/* Time */}
          <div className="flex flex-col">
            <div className="flex items-center gap-1 mb-1 opacity-80">
              <Clock size={14} className="text-cyan-300" />
              <span className="text-xs font-bold text-cyan-100">ZMAN</span>
            </div>
            <span className="text-4xl font-black font-mono tracking-tight text-white drop-shadow-md">{duration}</span>
          </div>

          {/* Distance */}
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1 mb-1 opacity-80">
              <MapPin size={14} className="text-emerald-300" />
              <span className="text-xs font-bold text-emerald-100">MERHAK</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-black text-white drop-shadow-md">{distance.toFixed(2)}</span>
              <span className="text-sm font-bold opacity-80">KM</span>
            </div>
          </div>

          {/* Pace */}
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-1 mb-1 opacity-80">
              <Flame size={14} className="text-orange-300" />
              <span className="text-xs font-bold text-orange-100">KEMEV</span>
            </div>
            <span className="text-3xl font-black text-white drop-shadow-md">{formatPace(averagePace)}</span>
          </div>
        </div>

        {/* Divider */}
        {calories > 0 && <div className="h-[1px] bg-white/10 w-full mb-3"></div>}

        {/* Bottom Row / Calories */}
        {calories > 0 && (
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-2 bg-white/20 px-3 py-1 rounded-full backdrop-blur-sm">
              <span className="text-[10px] font-bold uppercase text-yellow-300">CALORIES</span>
              <span className="text-sm font-black text-white">{calories}</span>
            </div>
          </div>
        )}

        {/* Next Station (Guided Mode) */}
        {nextStation && (
          <div className="mt-4 p-3 rounded-xl flex items-center gap-3 bg-black/40 text-cyan-400 border border-cyan-500/30">
            <div className="p-2 rounded-full bg-cyan-500/20">
              <Navigation size={18} className="fill-current" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] opacity-70 uppercase tracking-wider font-bold">NEXT STOP</span>
              <span className="font-bold text-sm line-clamp-1 text-white">{nextStation}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};