'use client';

/**
 * EquipmentCard — the single presentational card for one gym-equipment item.
 *
 * Extracted verbatim from the park-detail equipment grid so the same visual is
 * reused across three surfaces without duplication:
 *   • Park detail sheet  → rightSlot="chevron", opens EquipmentDetailDrawer
 *   • Add-location picker → rightSlot="check", toggles selection
 *   • Approval panel      → rightSlot="none", read-only preview
 *
 * Media priority (matches the drawer's fallback chain):
 *   brand product photo (bunnyImg) → equipment SVG icon → generic Dumbbell glyph.
 *
 * Brand resolution: when `brandName` is '' (the user-contribution default — the
 * user never picks a brand), the card falls back to the FIRST brand's image, so
 * an un-branded equipment still previews correctly.
 */
import React from 'react';
import { ChevronLeft, Dumbbell, Check } from 'lucide-react';
import { bunnyImg } from '@/lib/bunny-image';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';

interface EquipmentCardProps {
  equipment: GymEquipment;
  /** Brand the park advertises for this equipment. '' → falls back to first brand's image. */
  brandName?: string;
  /** Right-side affordance: chevron (open detail) · check (selectable) · none (read-only). */
  rightSlot?: 'chevron' | 'check' | 'none';
  /** For rightSlot="check": whether this card is currently selected. */
  selected?: boolean;
  onClick?: () => void;
}

export default function EquipmentCard({
  equipment: eq,
  brandName = '',
  rightSlot = 'chevron',
  selected = false,
  onClick,
}: EquipmentCardProps) {
  // Resolution: brand's image → first brand's image (when brandName='').
  const brandImage = brandName
    ? eq.brands?.find((b) => b.brandName === brandName)?.imageUrl
    : eq.brands?.[0]?.imageUrl;
  // hasVideo: any brand has a video → the drawer will surface it (QW1 fallback).
  const hasVideo = !!eq.brands?.some((b) => !!b.videoUrl);

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'group flex items-center gap-3 p-2.5 rounded-xl bg-white dark:bg-slate-800/90 shadow-sm active:scale-[0.98] transition-transform text-start w-full' +
        (selected ? ' ring-2 ring-[#00E5FF]' : '')
      }
      style={{ border: '0.5px solid #E0E9FF' }}
      aria-label={`${eq.name}${brandName ? ` (${brandName})` : ''}`}
      aria-pressed={rightSlot === 'check' ? selected : undefined}
    >
      {/* Media thumbnail — brand product photo → equipment SVG icon → Dumbbell glyph. */}
      <div className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
        {brandImage ? (
          <img
            src={bunnyImg(brandImage, 200)}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            onError={(e) => {
              const img = e.currentTarget as HTMLImageElement;
              img.style.display = 'none';
              img.parentElement?.querySelector('[data-fallback]')?.classList.remove('hidden');
            }}
          />
        ) : null}
        <div data-fallback className={brandImage ? 'hidden' : ''}>
          {eq.iconKey ? (
            <img
              src={`/assets/icons/equipment/${eq.iconKey}.svg`}
              alt=""
              className="w-8 h-8 object-contain"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <Dumbbell size={22} className="text-cyan-500" />
          )}
        </div>
      </div>

      {/* Text column */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-gray-900 dark:text-white leading-tight line-clamp-2">
          {eq.name}
        </p>
        {brandName && (
          <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
            {brandName}
          </p>
        )}
        {hasVideo && (
          <span className="inline-block mt-1 text-[9px] font-bold text-cyan-600">
            סרטון זמין
          </span>
        )}
      </div>

      {/* Right slot — RTL "forward" arrow points left (ChevronLeft). */}
      {rightSlot === 'chevron' && (
        <ChevronLeft
          size={16}
          className="flex-shrink-0 text-gray-400 group-hover:text-cyan-500 transition-colors"
        />
      )}
      {rightSlot === 'check' && (
        <div
          className={
            'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors ' +
            (selected ? 'bg-[#00E5FF] text-white' : 'bg-slate-100 text-transparent')
          }
        >
          <Check size={14} strokeWidth={3} />
        </div>
      )}
    </button>
  );
}
