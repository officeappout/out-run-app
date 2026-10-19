'use client';

import { Star, Navigation, MapPin } from 'lucide-react';
import type { Park } from '@/features/parks/core/types/park.types';
import { metaChipClass } from './section-styles';

interface ParkMetaRowProps {
  park: Park;
  v2: boolean;
  avgRating: number | null;
  ratedCount: number;
  distText: string | null;
}

/** Rating + distance + city + status row. */
export default function ParkMetaRow({ park, v2, avgRating, ratedCount, distText }: ParkMetaRowProps) {
  return (
    <div className="flex items-center gap-4 mb-4 flex-wrap">
      {avgRating && (
        <div className="flex items-center gap-1.5">
          <Star size={16} className="text-amber-400" fill="#FBBF24" />
          <span className="font-black text-gray-900 dark:text-white">{avgRating.toFixed(1)}</span>
          <span className="text-xs text-gray-400">({ratedCount})</span>
        </div>
      )}
      {distText && (
        <span className={metaChipClass(v2)}>
          <Navigation size={12} />{distText}
        </span>
      )}
      {park.city && (
        <span className={metaChipClass(v2)}>
          <MapPin size={12} />{park.city}
        </span>
      )}
      {park.status && park.status !== 'open' && (
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
          park.status === 'under_repair' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
        }`}>
          {park.status === 'under_repair' ? 'בתיקון' : 'סגור'}
        </span>
      )}
    </div>
  );
}
