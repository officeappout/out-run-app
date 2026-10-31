/**
 * Camera scan (enable_equipment_scan_v1, owner 31.10.2026): shared shapes. Pure, zero imports.
 *
 * A candidate is something the model may answer with:
 *   catalog  a gym_equipment doc id, the same id parks store (park.gymEquipment[].equipmentId)
 *            and the engine reads as park inventory, so a detection maps 1:1 to the engine.
 *   urban    a bench or stairs. No catalog doc and no workouts yet (owner 31.10): a park mapping
 *            turns them into the park's featureTags ('has_benches', 'stairs_training').
 */

export type ScanCandidateKind = 'catalog' | 'urban';

export const URBAN_CANDIDATE_IDS = ['urban:bench', 'urban:stairs'] as const;
export type UrbanCandidateId = (typeof URBAN_CANDIDATE_IDS)[number];

/**
 * One manufacturer's version of a catalog item (owner 31.10: most machines come from two
 * makers that look different). From gym_equipment.brands[]; `look` is the visual-index line.
 */
export interface ScanBrand {
  name: string;
  imageUrl?: string;
  /** The owner's reference photos of this (equipment, brand), absolute URLs (public/scan-reference). */
  refImageUrls?: string[];
  look?: string;
}

export interface ScanCandidate {
  id: string;
  kind: ScanCandidateKind;
  name: string;
  nameEn?: string;
  /** Movement pattern / short hint that helps tell look-alikes apart. */
  hint?: string;
  /** The item's makers; the model names one, the compare call shows their photos. */
  brands?: ScanBrand[];
  /** A real catalog photo (first brand image), used only by the compare call. */
  imageUrl?: string;
  /** Known to be at the park the user is standing in. */
  atPark?: boolean;
}

export type ScanQuality = 'ok' | 'dark' | 'blurry' | 'too_far' | 'too_close' | 'no_equipment';

/** Normalized 0..1 box (x, y = top-left). */
export interface ScanBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ScanItem {
  candidateId: string;
  kind: ScanCandidateKind;
  confidence: number;
  /** One of the candidate's brands, exactly as in the catalog; absent when the model couldn't tell. */
  brandName?: string;
  count?: number;
  box?: ScanBox;
}

export interface ScanUnknown {
  description: string;
  box?: ScanBox;
}

export interface ScanPhotoResult {
  quality: ScanQuality;
  hasPeople: boolean;
  items: ScanItem[];
  unknown: ScanUnknown[];
}

/** What the single-item screen does next (thresholds in scan-result.ts). */
export type ScanVerdict =
  | { kind: 'confirm'; candidateId: string; brandName?: string; alternatives: string[] }
  | { kind: 'choose'; candidateId: string; brandName?: string; alternatives: string[] }
  | { kind: 'retake'; reason: ScanQuality | 'unsure' };

export const SCAN_MODES = ['single', 'park'] as const;
export type ScanMode = (typeof SCAN_MODES)[number];
