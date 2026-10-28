'use client';

/**
 * ParkCardCompact — the map's floating park card, compact (enable_map_polish_v1):
 * one photo card — the park photo fills it under a dark gradient carrying the
 * name, ONE meta line (rating · city · distance · machines) and at most 3
 * amenity chips (no white body band; owner 23.10.2026). The
 * shelter strip moved to the park page (ParkShelterTag). 24px side insets,
 * v2 tokens. Tap → the park page (the caller's onOpen). Render-only.
 *
 * layout="inline" (enable_where_to_train_v1) is the same card as a carousel item: smaller (200×104,
 * name + one meta line, no chips), in flow (no floating position / slide-in), optional selected
 * ring; the close / navigate buttons render only when their handlers are passed.
 */

import { Navigation, X } from 'lucide-react';
import IconChip from '../park-detail/IconChip';
import { AMENITY_ICON_MAP } from '../park-detail/amenity-icons';
import type { ParkFeatureTag } from '@/features/parks/core/types/park.types';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';

/** The whole card is the photo (gradient + text over it). */
export const COMPACT_CARD_PX = 148;
/** Bottom-up scrim so white text reads on any photo; the top stays clear. */
export const COMPACT_GRADIENT = 'linear-gradient(to top, rgba(9,20,30,0.86) 0%, rgba(9,20,30,0.55) 42%, rgba(9,20,30,0) 78%)';
export const COMPACT_MAX_CHIPS = 3;
/** Carousel item size (layout="inline"): smaller than the map card, no chips (phone test AA5). */
export const COMPACT_INLINE_WIDTH_PX = 200;
export const COMPACT_INLINE_CARD_PX = 104;

export interface ParkCardCompactProps {
  name: string;
  heroSrc: string | null;
  objectPosition?: string;
  rating: { avg: number; count: number } | null;
  /** city · distance · machines, already formatted. */
  metaParts: string[];
  amenityTags: ParkFeatureTag[];
  onOpen: () => void;
  /** Omitted → no close button (carousel items). */
  onClose?: () => void;
  /** Omitted → no navigate button. */
  onNavigate?: () => void;
  /** 'floating' (default) = the map's card over the map; 'inline' = a carousel item. */
  layout?: 'floating' | 'inline';
  /** inline only: accent ring (the picked / best-match park). */
  selected?: boolean;
}

const FLOATING_WRAPPER = 'absolute bottom-[100px] left-6 right-6 z-30 animate-in slide-in-from-bottom-10 fade-in duration-500 cursor-pointer';
const INLINE_WRAPPER = 'relative shrink-0 cursor-pointer snap-start';

export default function ParkCardCompact({
  name, heroSrc, objectPosition, rating, metaParts, amenityTags, onOpen, onClose, onNavigate,
  layout = 'floating', selected = false,
}: ParkCardCompactProps) {
  const t = useT(map);
  const inline = layout === 'inline';
  const chips = inline ? [] : amenityTags.slice(0, COMPACT_MAX_CHIPS);
  return (
    <div
      className={inline ? INLINE_WRAPPER : FLOATING_WRAPPER}
      style={inline ? { width: COMPACT_INLINE_WIDTH_PX } : undefined}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      aria-label={name}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(); } }}
      data-testid="park-card-compact"
    >
      {/* One photo card: the photo fills the whole card and a dark gradient carries
          the text — no white body band under an 84px strip (owner, 23.10.2026).
          The dark base colour means a sub-pixel gap at the rounded edge never reads
          as a white line, and isolation + translateZ makes WebKit (iOS) clip the
          photo to the radius during the slide-in animation. */}
      <div className={`relative overflow-hidden rounded-v2-card ${inline ? (selected ? 'shadow-v2-ring ring-2 ring-v2-accent' : 'shadow-v2-ring') : 'shadow-v2-float'}`} dir="rtl"
        style={{ height: inline ? COMPACT_INLINE_CARD_PX : COMPACT_CARD_PX, background: '#0e1419', isolation: 'isolate', transform: 'translateZ(0)' }}>
        {heroSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroSrc} alt={name} className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition }} loading="lazy" />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-[#0f6d8c] to-[#0e1419]">
            <span className="material-icons-round text-4xl text-white/40">park</span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-0" style={{ background: COMPACT_GRADIENT }} aria-hidden />
        {onClose && (
        <button type="button" aria-label={t('parkCard.close')}
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="absolute left-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/90 shadow-v2-ring backdrop-blur-sm transition-transform duration-150 ease-v2 active:scale-[0.96]">
          <X size={15} className="text-v2-ink" />
        </button>
        )}
        {onNavigate && (
        <button type="button" aria-label={t('parkCard.navigate')}
          onClick={(e) => { e.stopPropagation(); onNavigate(); }}
          className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-v2-accent text-white shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.96]">
          <Navigation size={14} fill="currentColor" />
        </button>
        )}

        <div className={`absolute inset-x-0 bottom-0 z-[1] ${inline ? 'px-3 pb-2.5' : 'px-3.5 pb-3'}`}>
          <h3 className={`truncate ${inline ? 'text-[14px]' : 'text-[16px]'} font-black leading-snug !tracking-[-0.02em] text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.35)]`}>{name}</h3>
          {(rating || metaParts.length > 0) && (
            <div className={`mt-0.5 flex items-center gap-1 truncate ${inline ? 'text-[11.5px]' : 'text-[12.5px]'} font-bold text-white/85`}>
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
