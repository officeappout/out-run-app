/**
 * Per-amenity icon mapping for the "פירוט על הפארק" (amenities) chips
 * inside `ParkDetailSheet`. Each `ParkFeatureTag` resolves to a chip
 * source — either a path under `/public/assets/icons/equipment/` (when
 * an existing SVG asset matches the concept) or a lucide-react icon
 * component (vector fallback for tags without a dedicated asset).
 *
 * The Hebrew labels are duplicated from `FacilityCard.FACILITY_TAGS`
 * intentionally; the chip layer doesn't import the FacilityCard module
 * because it doesn't need its big-card variant + color map. Keeping
 * the labels here makes the chip rendering self-contained and lets us
 * reorder / tweak the tag list without touching `FacilityCard.tsx`.
 */

import {
  Sun,
  Lightbulb,
  Droplet,
  Accessibility,
  Bath,
  Zap,
  Dog,
  PersonStanding,
  Mountain,
  Shield,
  Home,
  type LucideIcon,
} from 'lucide-react';
import type { ParkFeatureTag } from '@/features/parks/core/types/park.types';

export interface AmenityIconConfig {
  label: string;
  /** Optional path under `/public` — preferred when set. */
  iconSrc?: string;
  /** Lucide-react fallback when no SVG asset exists yet. */
  IconComponent?: LucideIcon;
}

export const AMENITY_ICON_MAP: Record<ParkFeatureTag, AmenityIconConfig> = {
  // Existing dedicated SVG assets in /assets/icons/equipment/.
  has_benches: {
    label: 'ספסלים',
    iconSrc: '/assets/icons/equipment/street_bench.svg',
  },
  stairs_training: {
    label: 'מדרגות',
    iconSrc: '/assets/icons/equipment/training_steps.svg',
  },

  // No dedicated SVG — fall back to lucide vectors. Per the spec, the
  // shaded amenity uses a temporary sun/shade icon (Sun) until we
  // commission a proper "tree shade" asset.
  shaded: { label: 'הצללה', IconComponent: Sun },
  night_lighting: { label: 'תאורה', IconComponent: Lightbulb },
  water_fountain: { label: 'ברזיית מים', IconComponent: Droplet },
  wheelchair_accessible: { label: 'נגישות', IconComponent: Accessibility },
  has_toilets: { label: 'שירותים', IconComponent: Bath },
  rubber_floor: { label: 'ריצפת גומי', IconComponent: Zap },
  dog_friendly: { label: 'ידידותי לכלבים', IconComponent: Dog },
  parkour_friendly: { label: 'פארקור', IconComponent: PersonStanding },
  near_water: { label: 'קרבה למים', IconComponent: Mountain },
  safe_zone: { label: 'מיגונית', IconComponent: Shield },
  nearby_shelter: { label: 'מקלט קרוב', IconComponent: Home },
};

/**
 * Order in which amenities should render. Puts the visually-strongest
 * features (shade, lighting, benches, water) first so the user sees
 * them before scrolling, then the longer tail. Tags missing from
 * `park.featureTags` are filtered out by the caller.
 */
export const AMENITY_DISPLAY_ORDER: ParkFeatureTag[] = [
  'shaded',
  'night_lighting',
  'has_benches',
  'water_fountain',
  'has_toilets',
  'rubber_floor',
  'wheelchair_accessible',
  'stairs_training',
  'parkour_friendly',
  'dog_friendly',
  'near_water',
  'safe_zone',
  'nearby_shelter',
];
