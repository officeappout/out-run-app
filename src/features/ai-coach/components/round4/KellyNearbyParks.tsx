'use client';

/**
 * Kelly round 4 — up to 3 nearby outdoor gyms under a Kelly reply (find_nearby_parks). A tap opens
 * the park on the map (/map?openPark=<id>, the push deep link the map already handles).
 */
import React from 'react';
import { ChevronLeft, MapPin } from 'lucide-react';
import type { ParkCardView } from '@/lib/ai/coach/round4/types';

export default function KellyNearbyParks({ parks, onOpen }: { parks: ParkCardView[]; onOpen: (parkId: string) => void }) {
  if (!parks.length) return null;
  return (
    <div className="mt-2 flex w-[min(300px,82vw)] flex-col overflow-hidden rounded-[22px] bg-white shadow-[0_24px_50px_-36px_rgba(9,30,50,0.45),0_0_0_1px_rgba(14,27,42,0.06)]" dir="rtl" data-ai-parks>
      {parks.map((p, i) => (
        <button
          key={p.parkId}
          type="button"
          onClick={() => onOpen(p.parkId)}
          className={`flex min-h-[56px] items-center gap-2.5 px-3 py-2 text-right active:bg-v2-tint ${i ? 'border-t border-gray-100' : ''}`}
          aria-label={`פתח במפה: ${p.name}, ${p.distanceKm} ק״מ${p.equipment.length ? `, ${p.equipment.join(', ')}` : ''}`}
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-v2-tint text-v2-deep">
            <MapPin className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-black text-v2-ink">{p.name}</span>
            <span className="block truncate text-[11.5px] font-semibold text-v2-muted">
              {`${p.distanceKm} ק״מ`}
              {p.equipment.length ? ` · ${p.equipment.join(', ')}` : ''}
            </span>
          </span>
          <ChevronLeft className="h-4 w-4 shrink-0 text-v2-muted" aria-hidden />
        </button>
      ))}
    </div>
  );
}
