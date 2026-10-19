'use client';

import { MapPin } from 'lucide-react';

interface GroupLocationCardProps {
  hasCoords: unknown;
  destLat: number;
  destLng: number;
  destAddress: string | undefined;
  staticMapUrl: string | null;
  isMilitaryGroup: boolean;
  onOpen: (lat: number, lng: number) => void;
}

/**
 * Location — map thumbnail only. Tapping it opens NavigationSheet when the
 * user is far enough to need turn-by-turn (>2km), or jumps to the in-app map
 * when close (a separate "נווט למיקום" button duplicated that and was
 * removed 07.09.2026). No coords → the address as text; a persona-gated
 * military group with nothing visible gets a reason instead of silence.
 */
export default function GroupLocationCard({ hasCoords, destLat, destLng, destAddress, staticMapUrl, isMilitaryGroup, onOpen }: GroupLocationCardProps) {
  return hasCoords ? (
    <button
      type="button"
      onClick={() => onOpen(destLat, destLng)}
      aria-label={`פתח מפה ל-${destAddress || 'מיקום הקבוצה'}`}
      className="group relative w-full rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800 active:scale-[0.98] transition-transform"
    >
      {staticMapUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={staticMapUrl} alt={destAddress || 'מפה'} className="w-full h-[110px] object-cover" loading="lazy" />
      ) : (
        <div className="w-full h-[110px] bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center">
          <MapPin className="w-8 h-8 text-gray-400" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-3" dir="rtl">
        <span className="text-xs font-bold text-white truncate block max-w-[80%]">
          {destAddress || `${destLat.toFixed(4)}, ${destLng.toFixed(4)}`}
        </span>
      </div>
    </button>
  ) : destAddress ? (
    <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
      <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
      <span className="font-medium">{destAddress}</span>
    </div>
  ) : isMilitaryGroup ? (
    <div className="flex items-start gap-2 text-sm text-gray-500 dark:text-gray-400">
      <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
      <span className="font-medium">הפרטים מיועדים למילואימניקים.</span>
    </div>
  ) : null;
}
