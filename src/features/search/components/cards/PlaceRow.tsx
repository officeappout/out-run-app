'use client';

import { Dumbbell, Route as RouteIcon, ChevronLeft } from 'lucide-react';
import { BrandCard, BRAND_TILE_BG } from '@/components/ui/v2';
import Highlight from '../Highlight';
import type { ParkHit, RouteHit } from '../../core/types';

export const formatKm = (km: number | null | undefined) =>
  km == null || !Number.isFinite(km) ? null : km < 1 ? `${Math.round(km * 1000)} מ׳` : `${km.toFixed(1)} ק״מ`;

/** A park or a route row: brand tile icon, name (match in bold), city / length, distance. */
export default function PlaceRow({ hit, query, onOpen }: { hit: ParkHit | RouteHit; query?: string; onOpen: () => void }) {
  const isPark = hit.kind === 'park';
  const dist = formatKm(hit.distanceKm);
  return (
    <BrandCard as="button" radius={16} onClick={onOpen} className="flex items-center gap-3 p-3" aria-label={`${isPark ? 'גינה' : 'מסלול'}: ${hit.title}${dist ? `, ${dist} ממך` : ''}`}>
      <span
        aria-hidden
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
        style={isPark ? { background: BRAND_TILE_BG } : { background: '#c7f3ee' }}
      >
        {isPark ? <Dumbbell size={18} strokeWidth={2.2} className="text-white" /> : <RouteIcon size={18} strokeWidth={2.2} className="text-[#04222b]" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-bold text-[#171717]"><Highlight text={hit.title} query={query} /></span>
        {hit.subtitle && <span className="truncate text-[12px] text-[#6b7280]">{hit.subtitle}</span>}
      </span>
      {dist && <span className="shrink-0 whitespace-nowrap text-[12px] font-bold text-[#007399]">{dist}</span>}
      <ChevronLeft size={16} className="shrink-0 text-[#9ca3af]" aria-hidden />
    </BrandCard>
  );
}
