/**
 * Global Facility Icon Helper
 * 
 * Implements a strict 3-tier rendering hierarchy:
 *   1. Site-Specific Photo — admin uploaded a photo for this exact location
 *   2. Brand Category Icon — the icon uploaded via the Branding Tab
 *   3. System Default — hardcoded emoji
 */

import type { CategoryBrandingConfig, BrandingCategoryKey } from '@/features/admin/services/category-branding.service';
import { SYSTEM_DEFAULT_ICONS } from '@/features/admin/services/category-branding.service';

export interface FacilityIconResult {
  /** 'image' = render as <img>, 'emoji' = render as text */
  type: 'image' | 'emoji';
  /** The URL or emoji string */
  value: string;
  /** Which tier resolved the icon */
  tier: 'site_photo' | 'brand_icon' | 'system_default';
}

/**
 * Resolve the display icon for a facility/location.
 *
 * @param sitePhoto    – URL of the photo uploaded for this specific location
 * @param categoryKey  – The branding category key (e.g. 'basketball', 'stairs', 'gym_park')
 * @param brandingConfig – The cached CategoryBrandingConfig (pass null if not loaded yet)
 */
export function getFacilityIcon(
  sitePhoto: string | undefined | null,
  categoryKey: BrandingCategoryKey | string | undefined | null,
  brandingConfig: CategoryBrandingConfig | null,
): FacilityIconResult {
  // Tier 1: Site-Specific Photo
  if (sitePhoto) {
    return { type: 'image', value: sitePhoto, tier: 'site_photo' };
  }

  // Tier 2: Brand Category Icon
  if (categoryKey && brandingConfig) {
    const entry = brandingConfig[categoryKey];
    if (entry?.iconUrl) {
      return { type: 'image', value: entry.iconUrl, tier: 'brand_icon' };
    }
  }

  // Tier 3: System Default (emoji)
  const emoji = categoryKey
    ? (SYSTEM_DEFAULT_ICONS as Record<string, string>)[categoryKey] || '📍'
    : '📍';

  return { type: 'emoji', value: emoji, tier: 'system_default' };
}

/**
 * Determine the most specific category key for a park/location,
 * checking sub-types first, then the main facilityType.
 */
export function resolveCategoryKey(park: {
  urbanType?: string;
  communityType?: string;
  natureType?: string;
  facilityType?: string;
  courtType?: string;
}): BrandingCategoryKey | string {
  // Sub-types take precedence
  if (park.urbanType) return park.urbanType;
  if (park.communityType) return park.communityType;
  if (park.natureType) return park.natureType;
  if (park.courtType) return park.courtType;
  // Fallback to main facilityType
  return park.facilityType || 'gym_park';
}
