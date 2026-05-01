'use client';

import React from 'react';
import { useMapMode } from '@/features/parks/core/context/MapModeContext';
import { useMapLogic } from '@/features/parks';
import { useSuppressBottomNav } from '@/features/parks/core/hooks/useSuppressBottomNav';
import { ArrowRight, Play, Footprints, Activity, Bike } from 'lucide-react';
import type { ActivityType } from '@/features/parks/core/types/route.types';

type MapLogic = ReturnType<typeof useMapLogic>;

interface NavigateLayerProps {
  logic: MapLogic;
}

const ACTIVITY_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  walking: { label: 'הליכה', icon: <Footprints size={16} /> },
  running: { label: 'ריצה', icon: <Activity size={16} /> },
  cycling: { label: 'אופניים', icon: <Bike size={16} /> },
};

export default function NavigateLayer({ logic }: NavigateLayerProps) {
  // Hide the global BottomNavbar — the destination + activity selector card
  // sits at the bottom of the map and needs the full safe-area to itself.
  useSuppressBottomNav();

  const { setMode } = useMapMode();

  const handleBack = () => {
    logic.setNavState('idle');
    setMode('discover');
  };

  const handleStart = () => {
    logic.startActiveWorkout();
  };

  const selectedRoute = logic.navigationRoutes[logic.selectedNavActivity];

  return (
    <>
      {/* Back button */}
      <div className="absolute top-[max(1.5rem,env(safe-area-inset-top))] right-4 z-30">
        <button
          onClick={handleBack}
          className="h-10 px-4 rounded-xl bg-white/90 backdrop-blur-sm shadow-md border border-gray-100 flex items-center gap-2 text-gray-700 active:scale-95 transition-all"
          dir="rtl"
        >
          <ArrowRight size={16} />
          <span className="text-sm font-bold">חזרה</span>
        </button>
      </div>

      {/* Destination + Route options */}
      <div className="absolute bottom-0 left-0 right-0 z-20 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-4 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-gray-100 p-4" dir="rtl">
          {logic.selectedAddress && (
            <p className="text-xs text-gray-500 font-medium mb-3 truncate">יעד: {logic.selectedAddress.text}</p>
          )}

          {/* Activity selector */}
          <div className="flex gap-2 mb-3">
            {(['walking', 'running', 'cycling'] as ActivityType[]).map((act) => {
              const route = logic.navigationRoutes[act];
              const info = ACTIVITY_LABELS[act];
              return (
                <button
                  key={act}
                  onClick={() => {
                    logic.setSelectedNavActivity(act);
                    if (route) { logic.setFocusedRoute(route); logic.setSelectedRoute(route); }
                  }}
                  className={`flex-1 py-2.5 rounded-xl border text-center transition-all ${
                    logic.selectedNavActivity === act
                      ? 'border-[#00E5FF] bg-cyan-50 text-[#00BAF7]'
                      : 'border-gray-100 text-gray-500 hover:border-gray-200'
                  }`}
                >
                  <div className="flex flex-col items-center gap-1">
                    {info.icon}
                    <span className="text-[11px] font-bold">{info.label}</span>
                    {route && <span className="text-[10px]">{route.distance} ק״מ · {route.duration} דק׳</span>}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Start button */}
          {selectedRoute && (
            <button
              onClick={handleStart}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#00E5FF] to-[#00BAF7] text-white font-black text-base shadow-lg active:scale-[0.97] transition-all flex items-center justify-center gap-2"
            >
              <Play size={18} fill="white" />
              <span>התחל ניווט</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
}
