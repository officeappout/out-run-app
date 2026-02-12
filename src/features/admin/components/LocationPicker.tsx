'use client';

import * as React from 'react';
import Map, { Marker, MapLayerMouseEvent } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapPin } from 'lucide-react';

interface LocationPickerProps {
    value: { lat: number; lng: number };
    onChange: (value: { lat: number; lng: number }) => void;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

export default function LocationPicker({ value, onChange }: LocationPickerProps) {

    const handleMapClick = (event: MapLayerMouseEvent) => {
        // עדכון המיקום כשלוחצים על המפה
        if (onChange) {
            onChange({
                lat: event.lngLat.lat,
                lng: event.lngLat.lng
            });
        }
    };

    return (
        <div className="h-64 w-full rounded-xl overflow-hidden border border-gray-300 relative">
            <Map
                initialViewState={{
                    longitude: value?.lng || 34.7818, // ברירת מחדל: תל אביב
                    latitude: value?.lat || 32.0853,
                    zoom: 12
                }}
                style={{ width: '100%', height: '100%' }}
                // סגנון המפה - כהה כמו באפליקציה שלך (או תשנה ל-streets-v12 לבהיר)
                mapStyle="mapbox://styles/mapbox/dark-v11"
                mapboxAccessToken={MAPBOX_TOKEN}
                onClick={handleMapClick}
                cursor="crosshair"
            >
                {/* הסימון האדום על המפה */}
                <Marker
                    longitude={value?.lng || 34.7818}
                    latitude={value?.lat || 32.0853}
                    anchor="bottom"
                >
                    <div className="text-cyan-500 drop-shadow-[0_0_10px_rgba(6,182,212,0.8)]">
                        <MapPin size={40} fill="currentColor" />
                    </div>
                </Marker>
            </Map>

            {/* הגנה למקרה שאין טוקן */}
            {!MAPBOX_TOKEN && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-white p-4 text-center z-50">
                    חסר טוקן Mapbox בקובץ .env.local
                </div>
            )}
        </div>
    );
}
