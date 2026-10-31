/**
 * Camera scan, park mapping (phase 2): the merged photo results → what the add-park wizard
 * prefills and what the contribution records for the admin. Pure.
 *
 *   catalog items at CHOOSE_AT or more → gymEquipment, pre-selected, tagged "זוהה" / "לא בטוח"
 *   urban:bench / urban:stairs         → featureTags 'has_benches' / 'stairs_training'
 *   unknown objects                    → the admin's "מתקן חדש להוסיף לקטלוג" queue (with a crop)
 */
import { isUnsure, mergeParkScans, reviewItems, type MergedParkScan } from '@/lib/ai/scan/scan-merge';
import type { ScanBox, ScanPhotoResult } from '@/lib/ai/scan/scan-types';
import type { ParkFeatureTag } from '@/features/parks/core/types/park.types';

export const URBAN_FEATURE_TAG: Record<string, ParkFeatureTag> = {
  'urban:bench': 'has_benches',
  'urban:stairs': 'stairs_training',
};

export interface ParkScanPrefill {
  equipmentIds: string[];
  unsureIds: string[];
  featureTags: ParkFeatureTag[];
  unknown: Array<{ description: string; shot: number; box?: ScanBox }>;
}

export function prefillFromScan(results: readonly ScanPhotoResult[]): ParkScanPrefill & { merged: MergedParkScan } {
  const merged = mergeParkScans(results);
  const items = reviewItems(merged);
  return {
    merged,
    equipmentIds: items.filter((i) => i.kind === 'catalog').map((i) => i.candidateId),
    unsureIds: items.filter(isUnsure).map((i) => i.candidateId),
    featureTags: Array.from(new Set(items.map((i) => URBAN_FEATURE_TAG[i.candidateId]).filter((t): t is ParkFeatureTag => !!t))),
    unknown: merged.unknown,
  };
}

/** What the contribution stores for the admin (approval card badges + the new-equipment queue). */
export interface ContributionScanMeta {
  photos: number;
  items: Array<{ equipmentId: string; confidence: number }>;
  /** Detected ids the user removed before sending. */
  removedByUser: string[];
  /** Ids the user added by hand on top of the detection. */
  addedByUser: string[];
  unknown: Array<{ description: string; photoUrl?: string }>;
}

export function scanMetaFor(
  merged: MergedParkScan,
  sentIds: readonly string[],
  unknownPhotos: ReadonlyArray<{ description: string; photoUrl?: string }>,
): ContributionScanMeta {
  const detected = merged.items.filter((i) => i.kind === 'catalog');
  const detectedIds = new Set(reviewItems(merged).filter((i) => i.kind === 'catalog').map((i) => i.candidateId));
  const sent = new Set(sentIds);
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    photos: merged.usableShots,
    items: detected.filter((i) => sent.has(i.candidateId)).map((i) => ({ equipmentId: i.candidateId, confidence: round2(i.confidence) })),
    removedByUser: Array.from(detectedIds).filter((id) => !sent.has(id)),
    addedByUser: sentIds.filter((id) => !detectedIds.has(id)),
    unknown: unknownPhotos.map((u) => ({ description: u.description, ...(u.photoUrl ? { photoUrl: u.photoUrl } : {}) })),
  };
}

/**
 * The street part of the suggested name ("{street}" in wizard.scan.place.suggestion): Mapbox's
 * street without the generic Hebrew "street" word in front (\u05E8\u05D7\u05D5\u05D1). Boulevards
 * and the like keep their word. null = no street; the user types a name.
 */
export function streetForName(street: string | null | undefined): string | null {
  const s = street?.trim().replace(/^\u05E8\u05D7\u05D5\u05D1\s+/, '').trim();
  return s ? s : null;
}
