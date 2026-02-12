/**
 * UnifiedLocation — Shared Types & Interfaces
 * All type definitions used across the location step modules.
 */

import { Park } from '@/types/admin-types';
import { Route } from '@/features/parks';
import type { CategoryBrandingConfig } from '@/features/admin/services/category-branding.service';
import type { LocationType } from '@/lib/data/israel-locations';

// ── Component Props ──────────────────────────────────────

export interface UnifiedLocationStepProps {
  onNext: () => void;
}

// ── Lifestyle / Persona ──────────────────────────────────

export interface LifestyleOption {
  id: string;
  labelHeMale: string;
  labelHeFemale: string;
  labelEn: string;
}

// ── Facility Types ───────────────────────────────────────

export interface ParkWithDistance extends Park {
  distanceMeters: number;
  formattedDistance: string;
}

/** A route enriched with distance-from-user + formatted distance */
export interface RouteWithDistance extends Route {
  distanceMeters: number;
  formattedDistance: string;
}

/**
 * Unified nearby facility — can be either a Park (point) or a Route (polyline).
 * The `kind` discriminator lets UI code branch easily.
 */
export type NearbyFacility =
  | (ParkWithDistance & { kind: 'park' })
  | (RouteWithDistance & { kind: 'route' });

// ── City Data ────────────────────────────────────────────

export interface CityData {
  id: string;
  name: string;
  displayName: string;
  type: LocationType;
  lat: number;
  lng: number;
  trainers: number;
  gyms: number;
  isMapped: boolean;
  population: number;
  parentId?: string;
  parentName?: string;
  parentAuthorityId?: string;
}

// ── State Machine ────────────────────────────────────────

export enum LocationStage {
  INITIAL = 'INITIAL',
  LOCATING = 'LOCATING',
  CONFIRMING = 'CONFIRMING',
  SEARCHING = 'SEARCHING',
}

// ── Identity Hook (Copy Matrix) ──────────────────────────

export interface IdentityHookResult {
  /** Pain-point intro — displayed in Brand Blue */
  intro: string;
  /** Solution value — displayed as subtext below */
  value: string;
}

// ── Smart Badge ──────────────────────────────────────────

export interface SmartBadge {
  icon: string;
  label: string;
  value: string | number;
}

// ── Sport Context ────────────────────────────────────────

export interface SportContext {
  /** Route activity types to match in curated_routes */
  activities: string[];
  /** Prefer hybrid (cardio + strength pit-stops) routes */
  prefersHybrid: boolean;
  /** Spot/Facility focus — hero route should be NULL (no polylines).
   *  TRUE for ANY non-cardio sport: Strength, Ball Games, Climbing, Body & Mind, Martial Arts */
  isSpotFocus: boolean;
  /** Body & Mind — scenic focus, hero route NULL unless also has Cardio */
  isScenicFocus: boolean;
  /** Show benches in facility list (only Walking, Body&Mind, or Hybrid) */
  showBenches: boolean;
  /** Climbing fallback — show calisthenics/fitness_station when no climbing walls */
  climbingFallback: boolean;
}

// ── Training Context ─────────────────────────────────────

/** Training context from the user's questionnaire assignment */
export interface TrainingContext {
  programTemplateId: string | null;
  level: number;
}

// ── Settlement Naming ────────────────────────────────────

export type SettlementType = 'city' | 'regional_council' | 'local_council' | 'neighborhood' | 'settlement' | 'kibbutz' | 'moshav' | 'unknown';

export interface SettlementNaming {
  shortLabel: string;
  mediumLabel: string;
  longLabel: string;
  statsPrefix: string;
}

// ── Activity / Persona Groups ────────────────────────────

export type ActivityGroup = 'zen' | 'cardio_run' | 'cardio_bike' | 'cardio_walk' | 'power' | 'ball' | 'climb_move' | 'hybrid' | 'martial';

export type PersonaGroup = 'student' | 'mom' | 'dad' | 'senior' | 'reservist' | 'careerist' | 'single_young' | 'highschooler' | 'default';

// ── Sub-Component Props ──────────────────────────────────

export interface InitialCardProps {
  gender: 'male' | 'female';
  t: (male: string, female: string) => string;
  locationError: string | null;
  onFindLocation: () => void;
  onSearchManually: () => void;
}

export interface ConfirmationCardProps {
  displayName: string;
  detectedNeighborhood: string | null;
  detectedCity: string | null;
  nearbyFacilities: NearbyFacility[];
  isLoadingParks: boolean;
  isLoadingCurated: boolean;
  isUpdatingLocation: boolean;
  onConfirm: () => void;
  onSearchOther: () => void;
  brandingConfig: CategoryBrandingConfig | null;
  infraStats: { totalKm: number; segmentCount: number } | null;
  cityAssetCounts: { gyms: number; courts: number; nature: number } | null;
  settlementNaming: SettlementNaming | null;
  curatedRouteCount: number;
  heroRoute: RouteWithDistance | null;
  sportContext: SportContext;
  bestMatchIndex: number;
  trainingContext: TrainingContext | null;
}

export interface SearchOverlayProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filteredCities: CityData[];
  onCitySelect: (city: CityData) => void;
  onBack: () => void;
}

export interface RadarPulseProps {
  center: { lat: number; lng: number };
}

// ── Pioneer + Plan B Fallback ────────────────────────────

export interface PioneerFallbackResult {
  /** Whether the Pioneer card should be shown (no sport-specific match found) */
  showPioneer: boolean;
  /** The Pioneer message (Part A — "The Goal") */
  pioneerMessage: string;
  /** Emoji for the Pioneer card header */
  pioneerEmoji: string;
  /** Plan B bridge text connecting Pioneer → fallback asset (Part B — "The Action") */
  planBBridge: string;
  /** The highest-rated fallback gym/park within the radius */
  fallbackAsset: NearbyFacility | null;
}
