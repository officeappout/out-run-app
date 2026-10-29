'use client';

import React, { useState } from 'react';
import { useMapMode } from '@/features/parks/core/context/MapModeContext';
import WorkoutPreferencesModal from '@/features/parks/core/components/WorkoutPreferencesModal';
import { useMapLogic } from '@/features/parks';
import { useSuppressBottomNav } from '@/features/parks/core/hooks/useSuppressBottomNav';
import { Play, X } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import { common } from '@/messages/ns/common';
import { withUnit } from '@/lib/i18n/units';

type MapLogic = ReturnType<typeof useMapLogic>;

interface BuilderLayerProps {
  logic: MapLogic;
}

export default function BuilderLayer({ logic }: BuilderLayerProps) {
  const t = useT(map);
  const tc = useT(common);
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
        <div className="absolute bottom-0 end-0 start-0 z-20 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="mx-4 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-black text-gray-800">{t('mapLayers.builder.title')}</h3>
              <button onClick={() => setMode('discover')} className="p-1 rounded-lg hover:bg-gray-100">
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            {logic.isGenerating ? (
              <div className="flex items-center justify-center py-6">
                <div className="animate-spin w-6 h-6 border-[3px] border-[#00E5FF] border-t-transparent rounded-full" />
                <span className="text-sm text-gray-500 font-bold ms-3">{t('mapLayers.builder.generating')}</span>
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
                    <div className="text-start">
                      <p className="text-sm font-bold text-gray-800">{route.name || t('mapLayers.builder.routeFallback')}</p>
                      <p className="text-[11px] text-gray-500">{withUnit('km', route.distance, tc)} · {withUnit('min', route.duration, tc)}</p>
                    </div>
                    {logic.focusedRoute?.id === route.id && (
                      <div className="w-3 h-3 rounded-full bg-[#00E5FF]" />
                    )}
                  </button>
                ))}
              </div>
            ) : logic.shuffleOutcome === 'error' ? (
              // Honest error state (routes phase 1.2) — generation failed;
              // previously this silently fell back to MOCK_ROUTES.
              <div className="text-center py-4">
                <p className="text-sm text-gray-500 font-bold">{t('mapLayers.builder.error')}</p>
                <button
                  type="button"
                  onClick={() => logic.handleShuffle(logic.preferences.activity)}
                  className="mt-2 px-4 py-1.5 rounded-full border border-gray-200 text-gray-600 font-bold text-xs active:scale-[0.97] transition-transform"
                >
                  {t('mapLayers.builder.retry')}
                </button>
              </div>
            ) : (
              <p className="text-center text-sm text-gray-400 py-4">{t('mapLayers.builder.empty')}</p>
            )}

            {logic.focusedRoute && (
              <button
                onClick={handleStart}
                className="w-full mt-3 py-3.5 rounded-2xl bg-gradient-to-r from-[#00E5FF] to-[#00BAF7] text-white font-black text-base shadow-lg active:scale-[0.97] transition-all flex items-center justify-center gap-2"
              >
                <Play size={18} fill="white" />
                <span>{t('mapLayers.builder.start')}</span>
              </button>
            )}

            <button
              onClick={() => setShowPrefs(true)}
              className="w-full mt-2 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 transition-all"
            >
              {t('mapLayers.builder.changeSettings')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
