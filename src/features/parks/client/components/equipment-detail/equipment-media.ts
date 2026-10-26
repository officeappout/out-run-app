/**
 * An equipment's real picture (pure) — the same chain the equipment drawer
 * uses: the park's brand (else the first brand) → its photo, else another
 * brand's photo (resolveBrandImageUrl), else a still from the brand's Bunny
 * demo video. null = there is truly no picture; the caller shows the icon.
 */

import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';
import {
  resolveBrandImageUrl,
  resolveBrandVideoUrl,
  selectBrandByName,
} from '@/features/content/equipment/gym/core/gym-equipment-brand.utils';
import { buildBunnyThumbnailUrl, extractBunnyVideoId } from '@/lib/bunny/bunny.config';

export function equipmentImageUrl(
  eq: Pick<GymEquipment, 'brands'>,
  brandName?: string | null,
): string | null {
  const brands = eq.brands ?? [];
  if (brands.length === 0) return null;
  const active = selectBrandByName(brands, brandName);
  const image = resolveBrandImageUrl(brands, active);
  if (image) return image;
  const videoId = extractBunnyVideoId(resolveBrandVideoUrl(brands, active));
  return videoId ? buildBunnyThumbnailUrl(videoId) : null;
}
