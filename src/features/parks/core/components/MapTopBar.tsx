"use client";
import React from 'react';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { useSessionStore } from '@/features/workout-engine';

// --- תיקון: הגדרה מקומית (פותר את השגיאה באדום מיד) ---
type RunMode = 'free' | 'plan' | 'my_routes';

// צבע המותג
const BRAND_COLOR = '#00E5FF';

export const MapTopBar = () => {
  const { runMode, setRunMode } = useRunningPlayer();

  const modes = [
    { id: 'free', label: 'חופשי', icon: 'directions_run' },
    { id: 'plan', label: 'תכנון', icon: 'map' },
    { id: 'my_routes', label: 'שלי', icon: 'history' },
  ];

  return (
    // הוספתי w-full כדי שיתפוס את הרוחב בקונטיינר החדש למעלה
    <div className="flex bg-white/95 backdrop-blur-md rounded-2xl p-1 border border-gray-200 shadow-md w-full">
      {modes.map((mode) => {
        const isActive = runMode === mode.id;
        return (
          <button
            key={mode.id}
            onClick={() => setRunMode(mode.id as RunMode)}
            style={{ 
              backgroundColor: isActive ? BRAND_COLOR : 'transparent',
              color: isActive ? 'white' : '#6B7280'
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl transition-all duration-300 ${
              isActive ? 'shadow-sm font-bold' : 'hover:bg-gray-50 font-medium'
            }`}
          >
            <span className="material-icons-round text-sm">{mode.icon}</span>
            <span className="text-xs">{mode.label}</span>
          </button>
        );
      })}
    </div>
  );
};