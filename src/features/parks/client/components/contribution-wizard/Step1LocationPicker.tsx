'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import Map, { Marker, MapRef } from 'react-map-gl';
import { MapPin, AlertTriangle, ChevronLeft } from 'lucide-react';
import { checkDuplicateNearby } from '@/features/parks/core/services/contribution.service';
import type { WizardData } from './index';
import type { Park } from '@/features/parks/core/types/park.types';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

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
  const mapRef = useRef<MapRef>(null);
  const [duplicate, setDuplicate] = useState<Park | null>(null);
  const [checking, setChecking] = useState(false);
  const [category, setCategory] = useState<LocationCategory>(data.isPointOfInterest ? 'poi' : 'full_park');
  const [selectedPoi, setSelectedPoi] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLocation(loc);
          if (!data.location) updateData({ location: loc });
        },
        () => {},
        { enableHighAccuracy: true, timeout: 8000 },
      );
    }
  }, []);

  const handleMapClick = useCallback(async (evt: any) => {
    const loc = { lat: evt.lngLat.lat, lng: evt.lngLat.lng };
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

  const center = data.location ?? userLocation ?? { lat: 32.08, lng: 34.78 };

  return (
    <div className="flex flex-col h-full px-4 pb-6">
      {/* Map */}
      <div className="relative rounded-2xl overflow-hidden h-[240px] mb-4 border border-slate-200">
        <Map
          ref={mapRef}
          initialViewState={{ latitude: center.lat, longitude: center.lng, zoom: 15 }}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/streets-v12"
          mapboxAccessToken={MAPBOX_TOKEN}
          onClick={handleMapClick}
          attributionControl={false}
        >
          {data.location && (
            <Marker latitude={data.location.lat} longitude={data.location.lng} anchor="bottom">
              <div className="animate-bounce">
                <MapPin size={32} className="text-[#00E5FF] drop-shadow-lg" fill="#00E5FF" />
              </div>
            </Marker>
          )}
        </Map>
        {!data.location && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60 pointer-events-none">
            <p className="text-slate-500 text-sm font-medium">לחצו על המפה לבחירת מיקום</p>
          </div>
        )}
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
