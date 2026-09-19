'use client';

/**
 * EquipmentCard — the single presentational card for one gym-equipment item.
 *
 * Extracted verbatim from the park-detail equipment grid so the same visual is
 * reused across three surfaces without duplication:
 *   • Park detail sheet  → layout="tile",  crossBrandFallback={false}, opens EquipmentDetailDrawer
 *   • Add-location picker → layout="row" (default), rightSlot="check", toggles selection
 *   • Approval panel      → layout="row" (default), rightSlot="none", read-only preview
 *
 * Media priority (matches the drawer's fallback chain):
 *   brand product photo (bunnyImg) → equipment SVG icon → generic Dumbbell glyph.
 *
 * Brand resolution: when `brandName` is '' (the user-contribution default — the
 * user never picks a brand), the default (`crossBrandFallback=true`) falls back
 * to the FIRST brand's image, so an un-branded equipment still previews
 * correctly. The park-grid usage opts OUT of this (`crossBrandFallback={false}`)
 * — these are physically-installed machines, so showing another brand's photo
 * would misrepresent what's actually at the park; it falls to the clean
 * icon/glyph placeholder instead. Scoped via the prop so the other two reuse
 * sites (which have no "physically installed" claim to misrepresent) keep the
 * original cross-brand behavior untouched.
 */
import React from 'react';
import { ChevronLeft, Dumbbell, Check } from 'lucide-react';
import { bunnyImg } from '@/lib/bunny-image';
import { MUSCLE_ICON_PATHS, MUSCLE_FALLBACK_ICON } from '@/lib/muscle-icons.const';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';

interface EquipmentCardProps {
  equipment: GymEquipment;
  /** Brand the park advertises for this equipment. '' → see crossBrandFallback. */
  brandName?: string;
  /** Right-side affordance: chevron (open detail) · check (selectable) · none (read-only). Ignored in layout="tile" — the whole tile is already the click target, matching the reference card styles (GroupCard's compact tile). */
  rightSlot?: 'chevron' | 'check' | 'none';
  /** For rightSlot="check": whether this card is currently selected. */
  selected?: boolean;
  /**
   * "row" (default) — the original horizontal thumbnail+text card, used by
   * the add-location picker and approval panel.
   * "tile" — image-top / text-below card matching the home park-card / group
   * card visual language (rounded-2xl, shadow, image with bottom fade into
   * the body). Used by the park-detail equipment grid (2-per-row). Drops the
   * brand-name line and the "סרטון זמין" chip; allows up to 2 title lines.
   */
  layout?: 'row' | 'tile';
  /**
   * When `brandName` doesn't resolve to a specific brand image, fall back to
   * the equipment's first brand's image (true, default) or show the clean
   * icon/glyph placeholder instead of any brand photo (false). See the file
   * doc comment above for why the park grid opts out.
   */
  crossBrandFallback?: boolean;
  onClick?: () => void;
}

export default function EquipmentCard({
  equipment: eq,
  brandName = '',
  rightSlot = 'chevron',
  selected = false,
  layout = 'row',
  crossBrandFallback = true,
  onClick,
}: EquipmentCardProps) {
  // Resolution: brand's image → (crossBrandFallback ? first brand's image : none).
  const brandImage = brandName
    ? eq.brands?.find((b) => b.brandName === brandName)?.imageUrl
    : crossBrandFallback
      ? eq.brands?.[0]?.imageUrl
      : undefined;
  // hasVideo: any brand has a video → the drawer will surface it (QW1 fallback). Row-layout only.
  const hasVideo = !!eq.brands?.some((b) => !!b.videoUrl);
  // Same primaryMuscle resolution EquipmentDetailDrawer uses (falls back to
  // the deprecated muscleGroups[0] when primaryMuscle itself was never set).
  // Tile-layout only — the small icon that sits next to the equipment name.
  const primaryMuscle = eq.primaryMuscle ?? eq.muscleGroups?.[0];

  const mediaFallback = (
    <div data-fallback className={brandImage ? 'hidden' : ''}>
      {eq.iconKey ? (
        <img
          src={`/assets/icons/equipment/${eq.iconKey}.svg`}
          alt=""
          className={layout === 'tile' ? 'w-10 h-10 object-contain opacity-80' : 'w-8 h-8 object-contain'}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <Dumbbell size={layout === 'tile' ? 28 : 22} className="text-cyan-500" />
      )}
    </div>
  );

  if (layout === 'tile') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="group w-full bg-white dark:bg-slate-800/90 rounded-2xl shadow-sm overflow-hidden active:scale-[0.98] transition-transform text-start"
        style={{ border: '0.5px solid #E0E9FF' }}
        aria-label={eq.name}
      >
        <div className="relative w-full h-[90px] overflow-hidden bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
          {brandImage ? (
            <img
              src={bunnyImg(brandImage, 200)}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
              decoding="async"
              onError={(e) => {
                const img = e.currentTarget as HTMLImageElement;
                img.style.display = 'none';
                img.parentElement?.querySelector('[data-fallback]')?.classList.remove('hidden');
              }}
            />
          ) : null}
          {mediaFallback}
          {/* Fade image bottom into card body — matches GroupCard's compact tile. */}
          <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-white dark:from-slate-800/90 to-transparent pointer-events-none" />
        </div>
        <div className="px-2.5 py-2 flex items-center gap-1.5">
          {primaryMuscle && (
            // Fixed square box + object-contain, not a bare sized <img> —
            // the muscle SVGs don't share consistent internal viewBox
            // padding/aspect, so at a plain w-6 h-6 they rendered at
            // visibly different sizes from each other. This box is always
            // the same size; object-contain scales each SVG to fit inside
            // it without stretching, so the icon reads consistently
            // regardless of which muscle it is.
            <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={MUSCLE_ICON_PATHS[primaryMuscle] ?? MUSCLE_FALLBACK_ICON}
                alt=""
                className="max-w-full max-h-full object-contain opacity-90"
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}
          {/* min-h reserves 2 lines' worth of space (13px / leading-[16px] ×
              2) always, whether the name is 1 or 2 lines — otherwise a
              short name's tile was shorter than a wrapped name's tile in
              the same grid row, and centering here keeps a 1-line name
              from sitting top-anchored with dead space below it. The row's
              items-center then aligns the icon against this fixed block
              instead of the icon pinning to the top of whatever height the
              text happened to need. */}
          <div className="flex-1 min-w-0 min-h-[32px] flex items-center">
            <p className="text-[13px] font-bold text-gray-900 dark:text-white leading-[16px] line-clamp-2">
              {eq.name}
            </p>
          </div>
        </div>
      </button>
    );
  }

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
        {mediaFallback}
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
