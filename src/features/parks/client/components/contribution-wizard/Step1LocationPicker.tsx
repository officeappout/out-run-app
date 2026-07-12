'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import LocationPickMap from '../LocationPickMap';
import { checkDuplicateNearby } from '@/features/parks/core/services/contribution.service';
import { useGPSStore } from '@/features/parks/core/store/useGPSStore';
import type { WizardData } from './index';
import type { Park } from '@/features/parks/core/types/park.types';

interface Props {
  data: WizardData;
  updateData: (partial: Partial<WizardData>) => void;
  onNext: () => void;
}

type LocationCategory = 'full_park' | 'poi';

const POI_OPTIONS = [
  { id: 'bench', label: 'ספסל', icon: '🪑' },
  { id: 'dog_park', label: 'גינת כלבים', icon: '🐕' },
  { id: 'water_fountain', label: 'ברזיית מים', icon: '🚰' },
] as const;

export default function Step1LocationPicker({ data, updateData, onNext }: Props) {
  const [duplicate, setDuplicate] = useState<Park | null>(null);
  const [checking, setChecking] = useState(false);
  const [category, setCategory] = useState<LocationCategory>(data.isPointOfInterest ? 'poi' : 'full_park');
  const [selectedPoi, setSelectedPoi] = useState<string | null>(null);
  // Map center comes from the shared GPS store (driven by useGPS); no local
  // watcher or prompt here.
  const userLocation = useGPSStore((s) => s.coords);
  const seededRef = useRef(false);

  // Seed the wizard's location once from the first available GPS fix, so a
  // fresh contribution starts centered on the user without overwriting any
  // location they later pick on the map.
  useEffect(() => {
    if (!seededRef.current && userLocation && !data.location) {
      seededRef.current = true;
      updateData({ location: userLocation });
    }
  }, [userLocation, data.location, updateData]);

  const handleMapClick = useCallback(async (loc: { lat: number; lng: number }) => {
    updateData({ location: loc });
    setChecking(true);
    try {
      const dup = await checkDuplicateNearby(loc.lat, loc.lng, 50);
      setDuplicate(dup);
    } catch {
      setDuplicate(null);
    } finally {
      setChecking(false);
    }
  }, [updateData]);

  const handleCategoryChange = (cat: LocationCategory) => {
    setCategory(cat);
    updateData({ isPointOfInterest: cat === 'poi' });
    if (cat === 'full_park') {
      setSelectedPoi(null);
      updateData({ facilityType: undefined });
    }
  };

  const handlePoiSelect = (poiId: string) => {
    setSelectedPoi(poiId);
    if (poiId === 'bench') {
      updateData({ facilityType: 'urban_spot', isPointOfInterest: true });
    } else if (poiId === 'dog_park') {
      updateData({ facilityType: 'nature_community', isPointOfInterest: true });
    } else if (poiId === 'water_fountain') {
      updateData({ facilityType: 'urban_spot', isPointOfInterest: true });
    }
  };

  const canProceed = data.location && !duplicate && !checking;

  return (
    <div className="flex flex-col h-full px-4 pb-6">
      {/* Map — shared pick core (also used by the intent start-point sheet) */}
      <div className="mb-4">
        <LocationPickMap value={data.location ?? null} onPick={handleMapClick} />
      </div>

      {/* Duplicate warning */}
      {duplicate && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-3 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-amber-700 text-xs font-bold">מיקום קרוב כבר קיים</p>
            <p className="text-amber-600 text-[11px] mt-0.5">
              &quot;{duplicate.name}&quot; נמצא פחות מ-50 מטר. נסו מיקום אחר.
            </p>
          </div>
        </div>
      )}

      {/* Category Selection */}
      <div className="mb-4">
        <p className="text-slate-500 text-xs font-bold mb-2">סוג המיקום</p>
        <div className="flex gap-2">
          <button
            onClick={() => handleCategoryChange('full_park')}
            className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all border ${
              category === 'full_park'
                ? 'bg-[#00E5FF] text-white border-[#00E5FF] shadow-md shadow-cyan-500/20'
                : 'bg-slate-50 text-slate-500 border-slate-200'
            }`}
          >
            🏋️ פארק / גינת כושר
          </button>
          <button
            onClick={() => handleCategoryChange('poi')}
            className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all border ${
              category === 'poi'
                ? 'bg-[#00E5FF] text-white border-[#00E5FF] shadow-md shadow-cyan-500/20'
                : 'bg-slate-50 text-slate-500 border-slate-200'
            }`}
          >
            📍 נקודת עניין
          </button>
        </div>
      </div>

      {/* POI Sub-options */}
      {category === 'poi' && (
        <div className="flex gap-2 mb-4">
          {POI_OPTIONS.map((poi) => (
            <button
              key={poi.id}
              onClick={() => handlePoiSelect(poi.id)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-1 border ${
                selectedPoi === poi.id
                  ? 'bg-emerald-50 text-emerald-600 border-emerald-300'
                  : 'bg-slate-50 text-slate-500 border-slate-200'
              }`}
            >
              <span className="text-lg">{poi.icon}</span>
              <span>{poi.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* CTA */}
      <button
        onClick={onNext}
        disabled={!canProceed}
        className={`w-full py-3.5 rounded-2xl text-sm font-bold transition-all mt-auto ${
          canProceed
            ? 'bg-[#00E5FF] text-slate-900 active:scale-[0.97] shadow-lg shadow-cyan-500/25'
            : 'bg-slate-100 text-slate-300 cursor-not-allowed'
        }`}
      >
        {checking ? 'בודק...' : 'המשך'}
      </button>
    </div>
  );
}
