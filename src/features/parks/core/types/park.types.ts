/**
 * Park Management Types
 * Unified types for Parks (formerly Park + MapPark)
 */
import { ParkGymEquipment } from '@/features/content/equipment/gym';

export type ParkFacilityType = 'static' | 'cardio' | 'machine';

export interface ParkFacility {
  name: string;       // e.g., "מתח", "מקבילים"
  type: ParkFacilityType;
  image?: string;
  video?: string;
}

export interface ParkAmenities {
  hasShadow: boolean;    // יש צל
  hasLighting: boolean;  // יש תאורה
  hasToilets: boolean;   // יש שירותים
  hasWater: boolean;     // יש מים
}

export type ParkStatus = 'open' | 'under_repair' | 'closed';

/**
 * Editorial lifecycle status for content approval workflow.
 * Authority managers create content as 'pending_review'.
 * Super admins approve → 'published'. End users only see 'published' parks.
 * Super/system admins writing directly always set 'published'.
 */
export type ParkContentStatus = 'draft' | 'pending_review' | 'published';

/**
 * Facility Type - determines what kind of location this is
 * Used by the Hybrid Onboarding Matrix for filtering & personalized copy
 */
export type ParkFacilityCategory = 'gym_park' | 'court' | 'route' | 'zen_spot' | 'urban_spot' | 'nature_community';

/**
 * Sub-type for Nature & Community locations
 */
export type NatureType = 'spring' | 'observation_point';
export type CommunityType = 'dog_park';

/**
 * Sub-type for Urban Infrastructure locations
 * Includes both "movement" infrastructure (stairs, benches, skateparks)
 * and "asset" infrastructure (water fountains, toilets, parking, bike racks)
 */
export type UrbanType = 'stairs' | 'bench' | 'skatepark' | 'water_fountain' | 'toilets' | 'parking' | 'bike_rack';

/**
 * Stairs-specific details for Urban Infrastructure
 */
export interface StairsDetails {
  numberOfSteps?: number;
  steepness?: 'low' | 'medium' | 'high';
  hasShade?: boolean;
}

/**
 * Bench-specific details for Urban Infrastructure
 */
export interface BenchDetails {
  quantity?: number;
  hasShade?: boolean;
  material?: 'wood' | 'metal' | 'concrete' | 'plastic';
}

/**
 * Parking-specific details for Urban Infrastructure
 */
export type ParkingPaymentType = 'free' | 'paid' | 'resident_only';

export interface ParkingDetails {
  paymentType?: ParkingPaymentType;
  hasShade?: boolean;
}

/**
 * Sport types that can be practiced at a location
 * Maps to the sub-category IDs from PersonalStatsStep's SPORT_HIERARCHY
 */
export type ParkSportType =
  // Cardio
  | 'running' | 'walking' | 'cycling'
  // Strength
  | 'calisthenics' | 'crossfit' | 'functional' | 'movement'
  // Ball Games
  | 'basketball' | 'football' | 'tennis_padel'
  // Mind & Body
  | 'yoga' | 'pilates' | 'stretching'
  // Martial Arts
  | 'boxing' | 'mma' | 'self_defense'
  // Extreme
  | 'climbing' | 'skateboard';

/**
 * Feature tags for location characteristics
 * Allows granular filtering in the onboarding map and discovery screens
 * NOTE: This is the SINGLE source of truth for park amenities/features.
 *       The old ParkAmenities (hasShadow, hasLighting, etc.) is deprecated.
 */
export type ParkFeatureTag =
  | 'parkour_friendly'
  | 'shaded'
  | 'night_lighting'
  | 'stairs_training'
  | 'rubber_floor'
  | 'near_water'
  | 'water_fountain'
  | 'has_toilets'
  | 'has_benches'
  | 'dog_friendly'
  | 'wheelchair_accessible'
  | 'safe_zone'
  | 'nearby_shelter';

/**
 * ============================================
 * AUTOMATED SPORT MAPPING — "The System Brain"
 * ============================================
 * Auto-assigns sport tags based on facilityType, natureType, or communityType.
 * Used when saving locations to auto-populate sportTypes without manual tagging.
 * Also enables future GIS data imports to be categorized automatically.
 */
export const FACILITY_SPORT_MAPPING: Record<string, ParkSportType[]> = {
  // Facility types
  gym_park: ['calisthenics', 'crossfit', 'functional', 'movement'],
  court: ['basketball', 'football', 'tennis_padel'],
  // Court sub-types (specific)
  basketball: ['basketball'],
  football: ['football'],
  tennis: ['tennis_padel'],
  padel: ['tennis_padel'],
  multi: ['basketball', 'football', 'tennis_padel'],
  route: ['running', 'walking', 'cycling'],
  zen_spot: ['yoga', 'pilates', 'stretching'],
  urban_spot: ['climbing', 'skateboard'],
  nature_community: ['walking', 'yoga', 'stretching'],

  // Nature sub-types
  spring: ['walking', 'yoga', 'stretching'],
  observation_point: ['yoga', 'stretching', 'walking'],

  // Community sub-types
  dog_park: ['walking'],

  // Urban Infrastructure sub-types — Movement
  stairs: ['crossfit', 'functional', 'running'],   // HIIT + Cardio
  bench: ['functional', 'calisthenics'],             // Functional + Strength
  skatepark: ['skateboard', 'climbing'],
  // Urban Infrastructure sub-types — Assets (no sport mapping, they are support assets)
  water_fountain: [],
  toilets: [],
  parking: [],
  bike_rack: ['cycling'],
};

/**
 * Route sub-sport mapping based on terrain × environment.
 * Automatically determines which sports a route supports.
 * Key format: `${terrainType}_${environment}`
 */
export type RouteTerrainType = 'asphalt' | 'dirt' | 'mixed';
export type RouteEnvironment = 'urban' | 'nature' | 'park' | 'beach';

export const ROUTE_SUB_SPORT_MAPPING: Record<string, { sports: ParkSportType[]; label: string }> = {
  'asphalt_urban':  { sports: ['running', 'cycling'],  label: 'ריצת כביש / רכיבה עירונית' },
  'asphalt_park':   { sports: ['running', 'walking', 'cycling'], label: 'ריצה / הליכה / רכיבה בפארק' },
  'asphalt_nature': { sports: ['running', 'cycling'],  label: 'ריצה / רכיבה בטבע (סלול)' },
  'asphalt_beach':  { sports: ['running', 'walking'],  label: 'ריצה / הליכה לאורך החוף' },
  'dirt_urban':     { sports: ['running', 'walking'],  label: 'ריצת שטח עירונית' },
  'dirt_nature':    { sports: ['running', 'cycling', 'walking'], label: 'טרייל ראנינג / אופני הרים' },
  'dirt_park':      { sports: ['running', 'walking'],  label: 'ריצת שטח / הליכה בפארק' },
  'dirt_beach':     { sports: ['running', 'walking'],  label: 'ריצת חוף' },
  'mixed_urban':    { sports: ['running', 'walking', 'cycling'], label: 'מסלול מעורב עירוני' },
  'mixed_nature':   { sports: ['running', 'walking', 'cycling'], label: 'מסלול מעורב בטבע' },
  'mixed_park':     { sports: ['running', 'walking', 'cycling'], label: 'מסלול מעורב בפארק' },
  'mixed_beach':    { sports: ['running', 'walking'],  label: 'מסלול מעורב חופי' },
};

/**
 * Resolves auto-assigned sport types for a location based on its classification.
 * Combines facilityType, natureType, and communityType mappings (deduplicated).
 */
export function getAutoSportTypes(
  facilityType?: ParkFacilityCategory,
  natureType?: NatureType,
  communityType?: CommunityType,
  terrainType?: RouteTerrainType,
  environment?: RouteEnvironment,
  urbanType?: UrbanType,
  courtType?: string,
): ParkSportType[] {
  const sports = new Set<ParkSportType>();

  // Map from facilityType
  if (facilityType && FACILITY_SPORT_MAPPING[facilityType]) {
    FACILITY_SPORT_MAPPING[facilityType].forEach(s => sports.add(s));
  }

  // Map from courtType — overrides generic 'court' mapping with specific sport
  if (courtType && FACILITY_SPORT_MAPPING[courtType]) {
    if (facilityType === 'court') sports.clear(); // Replace generic with specific
    FACILITY_SPORT_MAPPING[courtType].forEach(s => sports.add(s));
  }

  // Map from natureType (overrides/extends)
  if (natureType && FACILITY_SPORT_MAPPING[natureType]) {
    FACILITY_SPORT_MAPPING[natureType].forEach(s => sports.add(s));
  }

  // Map from communityType
  if (communityType && FACILITY_SPORT_MAPPING[communityType]) {
    FACILITY_SPORT_MAPPING[communityType].forEach(s => sports.add(s));
  }

  // Map from urbanType (Stairs → HIIT/Cardio, Bench → Functional/Strength)
  if (urbanType && FACILITY_SPORT_MAPPING[urbanType]) {
    FACILITY_SPORT_MAPPING[urbanType].forEach(s => sports.add(s));
  }

  // Route-specific: terrain × environment
  if (facilityType === 'route' && terrainType && environment) {
    const key = `${terrainType}_${environment}`;
    const mapping = ROUTE_SUB_SPORT_MAPPING[key];
    if (mapping) {
      // Replace route sports with the specific mapping
      sports.clear();
      mapping.sports.forEach(s => sports.add(s));
    }
  }

  return Array.from(sports);
}

/**
 * Unified Park Interface
 * Combines admin Park and client MapPark into single type
 */
export interface Park {
  id: string;
  name: string;
  city?: string;       // Optional for MapPark compatibility
  address?: string;    // From MapPark
  description?: string; // Optional for MapPark compatibility
  
  // Location (dual format for backward compatibility)
  location: { lat: number; lng: number };
  lat?: number;  // Deprecated: use location.lat
  lng?: number;  // Deprecated: use location.lng
  
  // Hybrid Onboarding Classification
  facilityType?: ParkFacilityCategory;  // What kind of location (gym, court, route, etc.)
  sportTypes?: ParkSportType[];          // Which sports can be practiced here
  featureTags?: ParkFeatureTag[];        // Special characteristics
  natureType?: NatureType;               // Sub-type for Nature locations (springs, observation points)
  communityType?: CommunityType;         // Sub-type for Community locations (dog parks)
  urbanType?: UrbanType;                 // Sub-type for Urban Infrastructure (stairs, benches, skateparks, water fountains, toilets, parking, bike racks)
  stairsDetails?: StairsDetails;         // Stairs-specific details
  benchDetails?: BenchDetails;           // Bench-specific details
  parkingDetails?: ParkingDetails;       // Parking-specific details
  isDogFriendly?: boolean;               // Dog-friendly location
  courtType?: string;                    // Sub-type for Courts (basketball, football, tennis, padel, multi)
  
  // Equipment & Facilities
  image?: string;     // Main park image (legacy single)
  images?: string[];  // Multi-image support (first = cover photo)
  facilities?: ParkFacility[]; // Optional for MapPark compatibility
  gymEquipment?: ParkGymEquipment[];
  amenities?: ParkAmenities;

  // Catalog-computed flags (SPEC-07, 16.09.2026) — present ONLY on objects
  // sourced from fetchRealParks()/the /api/catalog/parks response, which
  // carries these precomputed instead of the raw gymEquipment/sportTypes
  // arrays. Absent (undefined) on a full record from getPark() — that path
  // still has the raw fields above, computed live where needed.
  /** At least one gymEquipment entry has a real (non-empty) equipmentId — the
   *  actual, complete condition under which normalizeGearId's translation can
   *  ever come back empty (traced in park-equipment.util.ts / gear-mapping.utils.ts:
   *  the alias/cache lookups only affect WHICH canonical id comes out, never
   *  WHETHER one does — its unconditional fallback echoes the raw id). NOT a
   *  bare `gymEquipment.length > 0` check. */
  hasUsableEquipment?: boolean;
  /** sportTypes includes a fitness-relevant type, OR facilityType === 'gym_park'
   *  — mirrors park-fitness.util.ts's isPrimaryFitness(), computed server-side
   *  since the catalog doesn't carry the raw sportTypes array. */
  isPrimaryFitness?: boolean;
  /** urbanType is one of MINOR_URBAN_TYPES (water_fountain/toilets/parking/
   *  bike_rack/bench) — replaces the raw urbanType field in the catalog
   *  (David, 16.09.2026: "option b — precompute isMinor instead of the raw
   *  field"), same pattern as hasUsableEquipment/isPrimaryFitness. Always
   *  false today (urbanType is null on every published park — a pending
   *  product decision, untouched); the catalog build picks this up
   *  automatically once that field is populated. */
  isMinor?: boolean;
  /** Generic hybrid-route stop classification (stretch/viewpoint, core/bench,
   *  etc.) — mirrors route-stops.service.ts's mapParkToStop, computed
   *  server-side from natureType/urbanType/facilityType at catalog-build
   *  time via the shared src/lib/park-stop-role.ts classifier (SPEC-07
   *  redesign, 17.09.2026). Equipment/gym_park is NOT part of this — read
   *  hasUsableEquipment/facilityType directly for that. `null` means
   *  "not a stop" (a real, meaningful classification, not "unset"). */
  stopRole?: import('@/lib/park-stop-role').ParkStopRole | null;

  // Admin metadata
  authorityId?: string; // Link to authority (for Authority Manager access) — always the TOP authority (city / regional_council)
  /** Leaf sub-location: the neighborhood/settlement Authority doc id this park physically sits in.
   *  `authorityId` is derived from `neighborhood.parentAuthorityId`. Optional (hybrid backfill). */
  neighborhoodId?: string;
  /** Denormalized neighborhood/settlement name — lets the table show the leaf without a join. */
  neighborhoodName?: string;
  status?: ParkStatus;
  contentStatus?: ParkContentStatus; // Editorial lifecycle: pending_review → published
  /** Approval workflow — mirrors Route.published for consistency across all entities */
  published?: boolean;
  publishedAt?: Date | null;
  /** UID of the user who created this park — used for attribution in admin inventory */
  createdByUser?: string;
  /** Origin of the park record — 'authority_admin' = pending review, 'super_admin' = published directly */
  origin?: 'authority_admin' | 'super_admin';

  /** Set by `onOsmAmenityWrite` (functions/src) on a park it auto-created or
   *  auto-linked from an approved fitness_station osm_amenity — the park is
   *  `published` immediately (amenities-approval-to-data-roadmap.md's "no
   *  pending_review" decision), this is the "review when you have a minute"
   *  nudge instead: facilityType/gymEquipment weren't set by a human. Admin
   *  clears it manually once reviewed — no code path unsets it automatically. */
  needsFacilityDetails?: boolean;
  /** osm_amenities doc ids (fitness_station) linked to this EXISTING park by
   *  the same trigger, when found within PARK_LINK_RADIUS_METERS instead of
   *  spawning a new park doc. Traceability only — does not affect gymEquipment,
   *  which still needs a human to translate OSM presence into real gear entries. */
  linkedOsmAmenityIds?: string[];

  // Route classification fields
  terrainType?: RouteTerrainType;
  environment?: RouteEnvironment;
  
  // GIS Preparedness - external source tracking
  externalSourceId?: string;
  
  // Display metadata (from MapPark)
  /**
   * Legacy admin-settable star rating (1–5) — still written/edited manually
   * via /admin/locations for parks with no organic reviews. NOT read by the
   * park page anymore (17.09.2026) — see ratingAvg/reviewCount below, the
   * organic-review-derived fields the park page actually renders.
   */
  rating?: number;
  /**
   * Denormalized aggregate computed by computeParkRatingSummary()
   * (park-rating.utils.ts) from user_contributions (type:'review',
   * linkedParkId===this park's id) — kept current by
   * recomputeAndSaveParkRating() on every review submit, and by the
   * one-time backfill script for parks with pre-existing reviews.
   * `null`/absent = no rated reviews yet; render no stars, not a
   * fabricated number. Deliberately independent of the legacy `rating`
   * field above — no fallback between the two.
   */
  ratingAvg?: number | null;
  /** Count of rated reviews backing `ratingAvg`. 0/absent alongside `ratingAvg` null. */
  reviewCount?: number;
  adminQualityScore?: number;
  imageUrl?: string;  // Alternative to 'image'
  whatsappLink?: string;
  isVerified?: boolean;
  distance?: number;  // Runtime field - distance from user
  
  // Functional classification (from equipment import)
  isFunctional?: boolean;

  // MapPark-specific features
  hasDogPark?: boolean;
  hasWaterFountain?: boolean;
  hasLights?: boolean;
  isShaded?: boolean;
  hasNaturalShade?: boolean;
  hasBikeRacks?: boolean;
  hasNearbyShelter?: boolean;

  // Brand identity — the dominant equipment brand installed in this park.
  // Resolved from equipment majority when primaryBrand is absent (see migration script).
  // Per-equipment override: ParkGymEquipment.brandName takes precedence when set.
  primaryBrand?: string;

  // Hero image focal point — CSS object-position value (e.g. "center", "top", "left center").
  // Set per-park in admin; ParkPreview reads it for object-position on the hero img.
  imagePosition?: string;

  // Timestamps
  createdAt?: Date;
  updatedAt?: Date;
  
  // Legacy support
  maximumTime?: {
    [key: number]: number;
  };
  
  // Linear park support
  segmentEndpoints?: {
    start: { lat: number; lng: number };
    end: { lat: number; lng: number };
  };
}

/**
 * @deprecated Use Park instead. MapPark is kept for backward compatibility.
 */
export type MapPark = Park;
