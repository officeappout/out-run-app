'use client';

/**
 * LocationPickMap — the reusable map-pick core (tap the map to drop a pin).
 *
 * Extracted from Step1LocationPicker so the contribution wizard AND the
 * intent-first start-point sheet share ONE picker (app-facing react-map-gl,
 * not the admin MiniLocationPicker). Centering falls back to the shared GPS
 * store. Pure presentation: it calls `onPick(loc)`; the caller decides what to
 * do (wizard runs a duplicate check, intent flow sets the run origin).
 */
import React, { useRef } from 'react';
import Map, { Marker, type MapRef } from 'react-map-gl';
import { MapPin } from 'lucide-react';
import { useGPSStore } from '@/features/parks/core/store/useGPSStore';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

interface LocationPickMapProps {
  value: { lat: number; lng: number } | null;
  onPick: (loc: { lat: number; lng: number }) => void;
  /** Used only for the initial center when there's no value + no GPS fix. */
  fallbackCenter?: { lat: number; lng: number };
  /** Tailwind height class for the map box. Default h-[240px]. */
  heightClass?: string;
  emptyHint?: string;
}

export default function LocationPickMap({
  value, onPick, fallbackCenter = { lat: 32.08, lng: 34.78 }, heightClass = 'h-[240px]', emptyHint = 'לחצו על המפה לבחירת מיקום',
}: LocationPickMapProps) {
  const mapRef = useRef<MapRef>(null);
  const gps = useGPSStore((s) => s.coords);
  const center = value ?? gps ?? fallbackCenter;

  return (
    <div className={`relative rounded-2xl overflow-hidden ${heightClass} border border-slate-200`}>
      <Map
        ref={mapRef}
        initialViewState={{ latitude: center.lat, longitude: center.lng, zoom: 15 }}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        mapboxAccessToken={MAPBOX_TOKEN}
        onClick={(evt: any) => onPick({ lat: evt.lngLat.lat, lng: evt.lngLat.lng })}
        attributionControl={false}
      >
        {value && (
          <Marker latitude={value.lat} longitude={value.lng} anchor="bottom">
            <div className="animate-bounce">
              <MapPin size={32} className="text-[#00E5FF] drop-shadow-lg" fill="#00E5FF" />
            </div>
          </Marker>
        )}
      </Map>
      {!value && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/60 pointer-events-none">
          <p className="text-slate-500 text-sm font-medium">{emptyHint}</p>
        </div>
      )}
    </div>
  );
}
