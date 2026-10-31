/**
 * Community Intelligence — User Contribution Types
 * Covers: New Locations, Quick Reports, Suggest Edits, Reviews/Ratings
 */
import type { ParkFacilityCategory, ParkFeatureTag } from '@/features/parks/core/types/park.types';
import type { Park } from '@/features/parks/core/types/park.types';
import type { ParkGymEquipment } from '@/features/content/equipment/gym';

export type ContributionType = 'new_location' | 'report' | 'suggest_edit' | 'review';
export type ContributionStatus = 'pending' | 'approved' | 'rejected';

export const XP_REWARDS: Record<ContributionType, number> = {
  new_location: 50,
  suggest_edit: 15,
  report: 5,
  review: 5,
};

export interface UserContribution {
  id?: string;
  userId: string;
  authorityId?: string;
  type: ContributionType;
  status: ContributionStatus;
  location: { lat: number; lng: number };
  photoUrl?: string;
  createdAt?: Date;
  updatedAt?: Date;

  // ── new_location fields ──
  parkName?: string;
  facilityType?: ParkFacilityCategory;
  featureTags?: ParkFeatureTag[];
  isPointOfInterest?: boolean;
  /**
   * Specific park equipment the user picked (gym_park only). Each entry is
   * { equipmentId, brandName } — brandName is stored as '' because the user
   * never picks a brand; it is resolved by the admin / brand-fallback on
   * approval, where this array is passed straight into createPark.
   */
  gymEquipment?: ParkGymEquipment[];
  /**
   * Camera scan park mapping (enable_equipment_scan_v1): how the list was made. Photos used (no
   * people), each kept item's confidence, what the user removed / added, and objects the catalog
   * doesn't have (description + a crop) for the admin's "new equipment" queue.
   */
  scan?: {
    photos: number;
    items: Array<{ equipmentId: string; confidence: number }>;
    removedByUser: string[];
    addedByUser: string[];
    unknown: Array<{ description: string; photoUrl?: string }>;
    /** Photos that had people in them: used for recognition only, never uploaded (owner 31.10). */
    withPeople?: number;
  };

  // ── suggest_edit fields ──
  linkedParkId?: string;
  editDiff?: Partial<Park>;
  editSummary?: string;

  // ── report fields ──
  issueType?: string;
  description?: string;

  // ── review fields ──
  rating?: number;
  comment?: string;
  routeDifficulty?: 'easy' | 'medium' | 'hard';
  routeQuality?: number;

  // ── set on approval ──
  xpAwarded?: number;
  approvedParkId?: string;
}
