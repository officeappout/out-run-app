'use client';

import { MapPin } from 'lucide-react';
import { useState } from 'react';
import { PARK_FALLBACK_IMAGE, type NearbyParkCard } from '@/features/parks/core/hooks/useNearbyParks';

/** "פארקים ומגרשים בקרבת מקום" — the legacy drawer's nearby-park row, in v2 cards. */
export default function RunNearbyParks({ parks }: { parks: readonly NearbyParkCard[] }) {
  if (!parks.length) return null;
  return (
    <section>
      <h3 className="text-[13px] font-extrabold text-v2-deep">פארקים ומגרשים בקרבת מקום</h3>
      <div className="no-scrollbar -mx-5 mt-2 flex gap-2.5 overflow-x-auto px-5 pb-1">
        {parks.map((p, i) => (
          <div key={p.id} className="w-[180px] shrink-0 overflow-hidden rounded-[18px] bg-white shadow-v2-ring">
            <ParkImage src={p.imageUrl} alt={p.name} eager={i < 2} />
            <div className="p-2.5">
              <p className="truncate whitespace-nowrap text-[13px] font-black text-v2-ink">{p.name}</p>
              <p className="mt-1 flex items-center gap-1 whitespace-nowrap text-[12px] font-bold text-v2-muted">
                <MapPin size={12} strokeWidth={2.4} className="shrink-0" aria-hidden />
                {p.walkingMinutes <= 1 ? 'דקה הליכה ממך' : `${p.walkingMinutes} דקות הליכה ממך`}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ParkImage({ src, alt, eager }: { src?: string; alt: string; eager: boolean }) {
  const [errored, setErrored] = useState(false);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={errored || !src ? PARK_FALLBACK_IMAGE : src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      onError={() => setErrored(true)}
      className="h-[90px] w-full bg-v2-surface object-cover"
    />
  );
}
