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
import type { VideoLanguage } from '../../../shared/video-locale';

/**
 * A single brand's video in the given language: `videoUrlEn` when the video
 * language is 'en' and it is non-empty, else `videoUrl`. With 'he' (the
 * default) this is exactly `brand.videoUrl`, so Hebrew is unchanged.
 */
export function brandVideoUrlForLang(
  brand: Pick<EquipmentBrand, 'videoUrl' | 'videoUrlEn'> | null | undefined,
  lang: VideoLanguage = 'he',
): string | undefined {
  if (!brand) return undefined;
  if (lang === 'en' && brand.videoUrlEn?.trim()) return brand.videoUrlEn.trim();
  return brand.videoUrl;
}

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
 * only when no brand on the doc has a video at all. `lang` (getVideoLanguage /
 * useVideoLanguage) picks `videoUrlEn` per brand; 'he' (default) = as before.
 */
export function resolveBrandVideoUrl(
  brands: EquipmentBrand[],
  brand: EquipmentBrand | null,
  lang: VideoLanguage = 'he',
): string | undefined {
  const own = brandVideoUrlForLang(brand, lang);
  if (own) return own;
  const other = brands.find((b) => b !== brand && !!brandVideoUrlForLang(b, lang));
  return brandVideoUrlForLang(other, lang) || undefined;
}

/**
 * Resolves a displayable image URL for the selected brand: its own image,
 * else (the "Ludos" case — a matched brand with no photo of its own, on
 * equipment where another tagged brand does have one) any OTHER brand's
 * image on the same equipment doc. `undefined` only when no brand on the
 * doc has an image at all.
 *
 * Same fallback shape as resolveBrandVideoUrl above, deliberately — showing
 * *a* real photo of the machine beats a placeholder regardless of which
 * brand it's tagged to. Until 23.09.2026 the park-grid tile (EquipmentCard's
 * `crossBrandFallback={false}`) opted out of this same fallback for its own
 * different reason (see EquipmentCard.tsx's header comment) — that's been
 * reverted, so the tile and this drawer now agree on the same policy.
 */
export function resolveBrandImageUrl(
  brands: EquipmentBrand[],
  brand: EquipmentBrand | null,
): string | undefined {
  if (brand?.imageUrl) return brand.imageUrl;
  return brands.find((b) => b !== brand && !!b.imageUrl)?.imageUrl ?? undefined;
}
