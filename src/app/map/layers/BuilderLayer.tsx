'use client';

import React, { useState } from 'react';
import { useMapMode } from '@/features/parks/core/context/MapModeContext';
import WorkoutPreferencesModal from '@/features/parks/core/components/WorkoutPreferencesModal';
import { useMapLogic } from '@/features/parks';
import { useSuppressBottomNav } from '@/features/parks/core/hooks/useSuppressBottomNav';
import { Play, X } from 'lucide-react';

type MapLogic = ReturnType<typeof useMapLogic>;

interface BuilderLayerProps {
  logic: MapLogic;
}

export default function BuilderLayer({ logic }: BuilderLayerProps) {
  // Hide the global BottomNavbar — both the preferences modal and the
  // route-picker card own the full bottom of the map.
  useSuppressBottomNav();

  const { setMode } = useMapMode();
  const [showPrefs, setShowPrefs] = useState(true);

  const handleUpdate = (newPrefs: any) => {
    logic.setSmartPaths({});
    logic.setFocusedRoute(null);
    logic.setRouteGenerationIndex(0);
    logic.updateFilter(newPrefs);
    logic.handleShuffle(newPrefs.activity);
    setShowPrefs(false);
  };

  const handleStart = () => {
    logic.startActiveWorkout();
  };

  return (
    <>
      {/* Preferences modal — auto-open in builder mode */}
      <WorkoutPreferencesModal
        isOpen={showPrefs}
        onClose={() => setMode('discover')}
        onUpdate={handleUpdate}
      />

      {/* Route picker — shown after preferences are set */}
      {!showPrefs && (
        <div className="absolute bottom-0 left-0 right-0 z-20 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="mx-4 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-gray-100 p-4" dir="rtl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-black text-gray-800">בחר מסלול</h3>
              <button onClick={() => setMode('discover')} className="p-1 rounded-lg hover:bg-gray-100">
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            {logic.isGenerating ? (
              <div className="flex items-center justify-center py-6">
                <div className="animate-spin w-6 h-6 border-[3px] border-[#00E5FF] border-t-transparent rounded-full" />
                <span className="text-sm text-gray-500 font-bold mr-3">מייצר מסלולים...</span>
              </div>
            ) : logic.routesToDisplay.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {logic.routesToDisplay.map((route) => (
                  <button
                    key={route.id}
                    onClick={() => { logic.setFocusedRoute(route); logic.setSelectedRoute(route); }}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                      logic.focusedRoute?.id === route.id
                        ? 'border-[#00E5FF] bg-cyan-50'
                        : 'border-gray-100 hover:border-gray-200'
                    }`}
                  >
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-800">{route.name || 'מסלול'}</p>
                      <p className="text-[11px] text-gray-500">{route.distance} ק״מ · {route.duration} דק׳</p>
                    </div>
                    {logic.focusedRoute?.id === route.id && (
                      <div className="w-3 h-3 rounded-full bg-[#00E5FF]" />
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-center text-sm text-gray-400 py-4">אין מסלולים זמינים. נסה להגדיר מחדש.</p>
            )}

            {logic.focusedRoute && (
              <button
                onClick={handleStart}
                className="w-full mt-3 py-3.5 rounded-2xl bg-gradient-to-r from-[#00E5FF] to-[#00BAF7] text-white font-black text-base shadow-lg active:scale-[0.97] transition-all flex items-center justify-center gap-2"
              >
                <Play size={18} fill="white" />
                <span>התחל מסלול</span>
              </button>
            )}

            <button
              onClick={() => setShowPrefs(true)}
              className="w-full mt-2 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 transition-all"
            >
              שנה הגדרות
            </button>
          </div>
        </div>
      )}
    </>
  );
}
