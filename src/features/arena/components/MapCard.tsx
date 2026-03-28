'use client';

import React, { useCallback } from 'react';
import { MapPin, Navigation } from 'lucide-react';

interface MapCardProps {
  lat: number;
  lng: number;
  label?: string;
  className?: string;
}

export default function MapCard({ lat, lng, label, className = '' }: MapCardProps) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
  const staticMapUrl = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-l+F97316(${lng},${lat})/${lng},${lat},15,0/400x180@2x?access_token=${token}&language=he`;

  const handleNavigate = useCallback(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const url = isIOS
      ? `maps://maps.apple.com/?daddr=${lat},${lng}`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    window.open(url, '_blank');
  }, [lat, lng]);

  return (
    <button
      type="button"
      onClick={handleNavigate}
      className={`group relative w-full rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800 active:scale-[0.98] transition-transform ${className}`}
    >
      {token ? (
        <img
          src={staticMapUrl}
          alt={label || 'מפה'}
          className="w-full h-[120px] object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-[120px] bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center">
          <MapPin className="w-8 h-8 text-gray-400" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-3 flex items-center justify-between" dir="rtl">
        <span className="text-xs font-bold text-white truncate max-w-[75%]">
          {label || `${lat.toFixed(4)}, ${lng.toFixed(4)}`}
        </span>
        <div className="w-7 h-7 rounded-full bg-white/90 flex items-center justify-center shadow group-hover:bg-white transition-colors">
          <Navigation className="w-3.5 h-3.5 text-gray-800" />
        </div>
      </div>
    </button>
  );
}
