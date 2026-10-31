/**
 * Camera scan, park mapping (phase 2): merge the per-photo results and decide the next shot. Pure.
 *
 * Guided capture: 3 fixed angles first (wide from the entrance, from the side, from the other
 * side), then up to 2 "closer" shots aimed at whatever is still unsure, 5 photos at most. A photo
 * with people counts like any other (owner 31.10); only the cover-photo choice avoids it.
 */
import { CONFIRM_AT, CHOOSE_AT } from './scan-result';
import type { ScanBox, ScanCandidateKind, ScanPhotoResult, ScanUnknown } from './scan-types';

export const PARK_MIN_SHOTS = 3;
export const PARK_MAX_SHOTS = 5;
const SEEN_TWICE_BONUS = 0.1;

export interface MergedScanItem {
  candidateId: string;
  kind: ScanCandidateKind;
  confidence: number;
  /** The brand named in its best photo, else in any photo that named one. */
  brandName?: string;
  /** Photos it was seen in (at CHOOSE_AT or more). */
  seenIn: number;
  count?: number;
  /** The box in the photo it was seen best in, with that photo's index. */
  best?: { shot: number; box?: ScanBox };
}

export interface MergedParkScan {
  items: MergedScanItem[];
  unknown: Array<ScanUnknown & { shot: number }>;
  usableShots: number;
}

export function mergeParkScans(results: readonly ScanPhotoResult[]): MergedParkScan {
  const items = new Map<string, MergedScanItem>();
  const unknown: MergedParkScan['unknown'] = [];
  let usableShots = 0;
  results.forEach((r, shot) => {
    usableShots++;
    for (const it of r.items) {
      const prev = items.get(it.candidateId);
      const seen = it.confidence >= CHOOSE_AT ? 1 : 0;
      if (!prev) {
        items.set(it.candidateId, {
          candidateId: it.candidateId,
          kind: it.kind,
          confidence: it.confidence,
          ...(it.brandName ? { brandName: it.brandName } : {}),
          seenIn: seen,
          ...(it.count ? { count: it.count } : {}),
          best: { shot, ...(it.box ? { box: it.box } : {}) },
        });
        continue;
      }
      prev.seenIn += seen;
      if (it.count) prev.count = Math.max(prev.count ?? 0, it.count);
      if (it.confidence > prev.confidence) {
        prev.confidence = it.confidence;
        prev.best = { shot, ...(it.box ? { box: it.box } : {}) };
        if (it.brandName) prev.brandName = it.brandName;
      } else if (!prev.brandName && it.brandName) {
        prev.brandName = it.brandName;
      }
    }
    for (const u of r.unknown) unknown.push({ ...u, shot });
  });
  const merged = Array.from(items.values()).map((i) =>
    i.seenIn >= 2 ? { ...i, confidence: Math.min(1, Math.round((i.confidence + SEEN_TWICE_BONUS) * 100) / 100) } : i,
  );
  merged.sort((a, b) => b.confidence - a.confidence);
  return { items: merged, unknown: dedupeUnknown(unknown), usableShots };
}

/** Same description from two angles is one object. */
function dedupeUnknown(list: MergedParkScan['unknown']): MergedParkScan['unknown'] {
  const seen = new Set<string>();
  return list.filter((u) => {
    const key = u.description.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** An item the review list tags "לא בטוח". Urban items are never shown as unsure. */
export function isUnsure(item: MergedScanItem): boolean {
  return item.kind === 'catalog' && item.confidence < CONFIRM_AT;
}

/** Items that make it into the review list pre-selected. */
export function reviewItems(merged: MergedParkScan): MergedScanItem[] {
  return merged.items.filter((i) => i.confidence >= CHOOSE_AT);
}

export type ParkShotGuide =
  | { kind: 'angle'; angle: 'wide' | 'side' | 'other_side' }
  | { kind: 'closer'; shot: number; box?: ScanBox }
  | { kind: 'done' };

const ANGLES = ['wide', 'side', 'other_side'] as const;

/** The next shot after `results.length` photos (5 at most). */
export function nextParkShot(results: readonly ScanPhotoResult[]): ParkShotGuide {
  if (results.length >= PARK_MAX_SHOTS) return { kind: 'done' };
  const merged = mergeParkScans(results);
  if (merged.usableShots < PARK_MIN_SHOTS) return { kind: 'angle', angle: ANGLES[merged.usableShots] };
  const unsure = merged.items.find((i) => i.confidence >= 0.3 && isUnsure(i));
  if (unsure?.best) return { kind: 'closer', shot: unsure.best.shot, ...(unsure.best.box ? { box: unsure.best.box } : {}) };
  // Something we don't know: one closer shot, right after the fixed angles, so the admin queue gets
  // a usable photo of it. Not repeated: a second look won't put it in the catalog.
  const unknown = merged.unknown[0];
  if (unknown && results.length === anglesDoneAt(results)) {
    return { kind: 'closer', shot: unknown.shot, ...(unknown.box ? { box: unknown.box } : {}) };
  }
  return { kind: 'done' };
}

/** How many photos it took to get PARK_MIN_SHOTS usable ones. */
function anglesDoneAt(results: readonly ScanPhotoResult[]): number {
  let usable = 0;
  for (let i = 0; i < results.length; i++) {
    usable++;
    if (usable === PARK_MIN_SHOTS) return i + 1;
  }
  return results.length;
}
