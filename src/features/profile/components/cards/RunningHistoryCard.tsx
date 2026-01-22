'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { MapPin, Coins, Clock } from 'lucide-react';
import { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';
import { formatPace } from '@/features/workout-engine/core/utils/formatPace';
import dynamic from 'next/dynamic';

// Dynamic import for map to avoid SSR issues
const RunMapBlock = dynamic(
  () => import('@/features/workout-engine/summary/components/running/RunMapBlock'),
  { ssr: false }
);

interface RunningHistoryCardProps {
  workout: WorkoutHistoryEntry;
  onClick: () => void;
}

export default function RunningHistoryCard({ workout, onClick }: RunningHistoryCardProps) {
  // Format date in Hebrew - short format: "יום ה', 22 ינו' • 20:45"
  const formatDate = (date: Date): string => {
    const dayLetters = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
    const dayLetter = dayLetters[date.getDay()];
    const day = date.getDate();
    const monthAbbrs = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];
    const monthAbbr = monthAbbrs[date.getMonth()];
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `יום ${dayLetter}', ${day} ${monthAbbr}' • ${hours}:${minutes}`;
  };

  // Format duration as MM:SS
  const formatDuration = (seconds: number): string => {
    if (!seconds || seconds < 0 || !isFinite(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const workoutDate = workout.date instanceof Date ? workout.date : new Date(workout.date);
  
  // Convert routePath to the format expected by RunMapBlock: number[][]
  // Handle both formats: [{lat, lng}] (new) or [[lat, lng]] (old)
  const routeCoords: number[][] = (() => {
    if (!workout.routePath || !Array.isArray(workout.routePath) || workout.routePath.length === 0) {
      return [];
    }
    
    try {
      return workout.routePath
        .map((coord: any) => {
          // New format: {lat, lng}
          if (coord && typeof coord === 'object' && 'lat' in coord && 'lng' in coord) {
            return [Number(coord.lng), Number(coord.lat)]; // Mapbox expects [lng, lat]
          }
          // Old format: [lat, lng] or [lng, lat]
          if (Array.isArray(coord) && coord.length >= 2) {
            return [Number(coord[0]), Number(coord[1])];
          }
          return null;
        })
        .filter((coord: number[] | null): coord is number[] => 
          coord !== null && !isNaN(coord[0]) && !isNaN(coord[1]) && (coord[0] !== 0 || coord[1] !== 0)
        );
    } catch (error) {
      console.error('[RunningHistoryCard] Error parsing routePath:', error);
      return [];
    }
  })();

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all text-right"
      dir="rtl"
    >
      <div className="flex flex-row gap-4 p-4">
        {/* Left: Map Thumbnail */}
        <div className="w-24 h-24 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
          {routeCoords.length > 1 ? (
            <RunMapBlock
              routeCoords={routeCoords}
              startCoord={routeCoords[0]}
              endCoord={routeCoords[routeCoords.length - 1]}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50">
              <MapPin size={20} className="text-gray-400 mb-1" />
              <span className="text-[9px] text-gray-500 font-medium text-center px-1 leading-tight">
                אין נתוני GPS
              </span>
            </div>
          )}
        </div>

        {/* Right: Workout Details */}
        <div className="flex-1 flex flex-col justify-between min-w-0">
          {/* Top: Date and Type */}
          <div>
            <div className="flex items-center gap-1 mb-1">
              <Clock size={12} className="text-gray-400" />
              <p className="text-sm font-bold text-gray-900">{formatDate(workoutDate)}</p>
            </div>
            <p className="text-sm font-semibold text-gray-700">ריצה חופשית</p>
          </div>

          {/* Bottom: Stats and Coins */}
          <div className="flex items-center justify-between mt-3">
            {/* Stats: Distance and Pace */}
            <div className="flex items-center gap-3">
              {workout.distance > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-sm font-bold text-gray-900">{workout.distance.toFixed(2)} ק"מ</span>
                </div>
              )}
              {workout.pace > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-sm font-bold text-gray-900">{formatPace(workout.pace)}</span>
                </div>
              )}
            </div>

            {/* Coins Badge */}
            {workout.earnedCoins > 0 && (
              <div className="flex items-center gap-1 bg-yellow-50 border border-yellow-200 rounded-lg px-2 py-1">
                <Coins size={14} className="text-yellow-600" />
                <span className="text-xs font-bold text-yellow-700">+{workout.earnedCoins} מטבעות</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.button>
  );
}
