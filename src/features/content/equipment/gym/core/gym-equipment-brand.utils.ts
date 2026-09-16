/**
 * gym-equipment-brand.utils — pure brand-selection helpers shared between
 * every consumer of `GymEquipment.brands[]`.
 *
 * Extracted from `EquipmentDetailDrawer.tsx` (16.09.2026 machine-tabata
 * black-screen investigation) so the live player's machine pseudo-exercise
 * (`buildMachinePseudoExercise`) picks a brand — and falls back when that
 * brand has no video — exactly the way the machine-detail page already
 * does, instead of the composer's previous unconditional `brands[0]`. Pure
 * (no React, no Firestore) so both a 'use client' drawer and the isomorphic
 * workout-engine composer can import it.
 */
import type { EquipmentBrand } from './gym-equipment.types';

/**
 * Index of the brand matching `brandName` (case/whitespace-insensitive), or
 * -1 when absent or no name was given.
 */
export function findBrandIndexByName(
  brands: EquipmentBrand[],
  brandName?: string | null,
): number {
  if (!brandName) return -1;
  const normalized = brandName.toLowerCase().trim();
  return brands.findIndex((b) => b.brandName?.toLowerCase().trim() === normalized);
}

/**
 * Resolves which brand to use: an exact `brandName` match, else the first
 * brand on the doc, else `null` when there are none at all.
 */
export function selectBrandByName(
  brands: EquipmentBrand[],
  brandName?: string | null,
): EquipmentBrand | null {
  if (!brands.length) return null;
  const idx = findBrandIndexByName(brands, brandName);
  return (idx >= 0 ? brands[idx] : brands[0]) ?? null;
}

/**
 * Resolves a playable video URL for the selected brand: its own video, else
 * (mixed-brand-park fallback) any OTHER brand's video on the same equipment
 * doc — so the user sees the machine's demo regardless of which brand was
 * actually tagged, matching the detail page's existing behavior. `undefined`
 * only when no brand on the doc has a video at all.
 */
export function resolveBrandVideoUrl(
  brands: EquipmentBrand[],
  brand: EquipmentBrand | null,
): string | undefined {
  if (brand?.videoUrl) return brand.videoUrl;
  return brands.find((b) => b !== brand && !!b.videoUrl)?.videoUrl ?? undefined;
}
