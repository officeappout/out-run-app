'use client';

/**
 * ParkCardCompact — the map's floating park card, compact (enable_map_polish_v1):
 * ~2/3 the height of the classic card — an 84px hero, the name, ONE meta line
 * (rating · city · distance · machines) and at most 3 amenity chips. The
 * shelter strip moved to the park page (ParkShelterTag). 24px side insets,
 * v2 tokens. Tap → the park page (the caller's onOpen). Render-only.
 */

import { Navigation, X } from 'lucide-react';
import IconChip from '../park-detail/IconChip';
import { AMENITY_ICON_MAP } from '../park-detail/amenity-icons';
import type { ParkFeatureTag } from '@/features/parks/core/types/park.types';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';

export const COMPACT_HERO_PX = 84;
export const COMPACT_MAX_CHIPS = 3;

export interface ParkCardCompactProps {
  name: string;
  heroSrc: string | null;
  objectPosition?: string;
  rating: { avg: number; count: number } | null;
  /** city · distance · machines, already formatted. */
  metaParts: string[];
  amenityTags: ParkFeatureTag[];
  onOpen: () => void;
  onClose: () => void;
  onNavigate: () => void;
}

export default function ParkCardCompact({
  name, heroSrc, objectPosition, rating, metaParts, amenityTags, onOpen, onClose, onNavigate,
}: ParkCardCompactProps) {
  const t = useT(map);
  const chips = amenityTags.slice(0, COMPACT_MAX_CHIPS);
  return (
    <div
      className="absolute bottom-[100px] left-6 right-6 z-30 animate-in slide-in-from-bottom-10 fade-in duration-500 cursor-pointer"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      aria-label={name}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(); } }}
      data-testid="park-card-compact"
    >
      <div className="overflow-hidden rounded-v2-card bg-white shadow-v2-float" dir="rtl">
        <div className="relative bg-v2-tint" style={{ height: COMPACT_HERO_PX }}>
          {heroSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={heroSrc} alt={name} className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition }} loading="lazy" />
          ) : (
            <div className="absolute inset-0 grid place-items-center">
              <span className="material-icons-round text-3xl text-v2-pill-border">park</span>
            </div>
          )}
          <button type="button" aria-label={t('parkCard.close')}
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="absolute left-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/90 shadow-v2-ring backdrop-blur-sm transition-transform duration-150 ease-v2 active:scale-[0.96]">
            <X size={15} className="text-v2-ink" />
          </button>
          <button type="button" aria-label={t('parkCard.navigate')}
            onClick={(e) => { e.stopPropagation(); onNavigate(); }}
            className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-v2-accent text-white shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.96]">
            <Navigation size={14} fill="currentColor" />
          </button>
        </div>

        <div className="px-3.5 pb-3 pt-2">
          <h3 className="truncate text-[15.5px] font-black leading-snug !tracking-[-0.02em] text-v2-ink">{name}</h3>
          {(rating || metaParts.length > 0) && (
            <div className="mt-0.5 flex items-center gap-1 truncate text-[12.5px] font-bold text-v2-muted">
              {rating && (
                <>
                  <span>{rating.avg}</span>
                  <span className="text-v2-gold">★</span>
                  <span>({rating.count})</span>
                  {metaParts.length > 0 && <span>·</span>}
                </>
              )}
              <span className="truncate">{metaParts.join(' · ')}</span>
            </div>
          )}
          {chips.length > 0 && (
            <div className="mt-2 flex gap-1.5 overflow-hidden">
              {chips.map((tag) => {
                const cfg = AMENITY_ICON_MAP[tag];
                if (!cfg) return null;
                return <IconChip key={tag} label={cfg.label} iconSrc={cfg.iconSrc} IconComponent={cfg.IconComponent} />;
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
