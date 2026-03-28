'use client';

import * as React from 'react';
import Map, { Marker, MapLayerMouseEvent } from 'react-map-gl';
import type { MapRef } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapPin } from 'lucide-react';

interface MiniLocationPickerProps {
  value: { lat: number; lng: number };
  onChange: (value: { lat: number; lng: number }) => void;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

function setMapHebrew(map: mapboxgl.Map) {
  const style = map.getStyle();
  if (!style?.layers) return;
  for (const layer of style.layers) {
    if (layer.type === 'symbol' && (layer.layout as any)?.['text-field']) {
      map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name_he'], ['get', 'name']]);
    }
  }
}

export default function MiniLocationPicker({ value, onChange }: MiniLocationPickerProps) {
  const mapRef = React.useRef<MapRef>(null);

  const handleMapClick = (event: MapLayerMouseEvent) => {
    onChange({ lat: event.lngLat.lat, lng: event.lngLat.lng });
  };

  const handleLoad = React.useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map) setMapHebrew(map);
  }, []);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="h-40 w-full rounded-xl bg-gray-100 border border-gray-300 flex items-center justify-center text-sm text-gray-400 font-bold">
        חסר טוקן Mapbox
      </div>
    );
  }

  return (
    <div className="h-40 w-full rounded-xl overflow-hidden border border-gray-300 relative cursor-crosshair">
      <Map
        ref={mapRef}
        initialViewState={{
          longitude: value.lng,
          latitude: value.lat,
          zoom: 14,
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        mapboxAccessToken={MAPBOX_TOKEN}
        onClick={handleMapClick}
        onLoad={handleLoad}
        cursor="crosshair"
      >
        <Marker longitude={value.lng} latitude={value.lat} anchor="bottom">
          <div className="text-cyan-500 drop-shadow-md">
            <MapPin size={28} fill="currentColor" />
          </div>
        </Marker>
      </Map>
      <div className="absolute bottom-1.5 left-1.5 bg-white/80 backdrop-blur-sm text-[10px] text-gray-500 font-mono px-2 py-0.5 rounded-md">
        {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
      </div>
    </div>
  );
}
