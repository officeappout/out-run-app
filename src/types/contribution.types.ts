/**
 * Community Intelligence — User Contribution Types
 * Covers: New Locations, Quick Reports, Suggest Edits, Reviews/Ratings
 */
import type { ParkFacilityCategory, ParkFeatureTag } from '@/features/parks/core/types/park.types';
import type { Park } from '@/features/parks/core/types/park.types';

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
