/**
 * Camera scan: the model's tool input → a safe ScanPhotoResult, and the single-item verdict. Pure.
 *
 * Thresholds (tech plan §3, to be tuned on the eval set):
 *   ≥ CONFIRM_AT     "זה נכון?" with this item
 *   ≥ CHOOSE_AT      "אולי זה אחד מאלה?" with the top 2-3
 *   below / bad photo / people  → retake (the edge-state screens)
 * NEEDS_COMPARE_GAP: when the top two are this close, the route runs the photo-vs-catalog compare.
 */
import { brandPhoto, matchBrand } from './scan-candidates';
import type { ScanBox, ScanCandidate, ScanItem, ScanPhotoResult, ScanQuality, ScanUnknown, ScanVerdict } from './scan-types';

export const CONFIRM_AT = 0.8;
export const CHOOSE_AT = 0.5;
export const NEEDS_COMPARE_GAP = 0.15;
const MAX_ITEMS = 20;
const MAX_UNKNOWN = 5;
const QUALITIES: readonly ScanQuality[] = ['ok', 'dark', 'blurry', 'too_far', 'too_close', 'no_equipment'];

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function box(v: unknown): ScanBox | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const b = v as Record<string, unknown>;
  const n = [b.x, b.y, b.w, b.h];
  if (!n.every((x) => typeof x === 'number' && Number.isFinite(x))) return undefined;
  const [x, y, w, h] = (n as number[]).map(clamp01);
  return w > 0 && h > 0 ? { x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) } : undefined;
}

/** Drops anything not in the candidate list, dedupes by id (highest confidence), sorts by confidence. */
export function parseScanToolInput(raw: unknown, candidates: readonly ScanCandidate[]): ScanPhotoResult {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const quality = QUALITIES.includes(r.quality as ScanQuality) ? (r.quality as ScanQuality) : 'ok';
  const items = new Map<string, ScanItem>();
  for (const it of Array.isArray(r.items) ? r.items : []) {
    const o = (it ?? {}) as Record<string, unknown>;
    const c = typeof o.id === 'string' ? byId.get(o.id.trim()) : undefined;
    if (!c || typeof o.confidence !== 'number' || !Number.isFinite(o.confidence)) continue;
    const next: ScanItem = {
      candidateId: c.id,
      kind: c.kind,
      confidence: clamp01(o.confidence),
      ...(matchBrand(c, o.brand) ? { brandName: matchBrand(c, o.brand) } : {}),
      ...(typeof o.count === 'number' && Number.isInteger(o.count) && o.count > 0 ? { count: Math.min(o.count, 20) } : {}),
      ...(box(o.box) ? { box: box(o.box) } : {}),
    };
    const prev = items.get(c.id);
    if (!prev || prev.confidence < next.confidence) items.set(c.id, next);
  }
  const unknown: ScanUnknown[] = [];
  for (const u of Array.isArray(r.unknown) ? r.unknown : []) {
    const o = (u ?? {}) as Record<string, unknown>;
    if (typeof o.description !== 'string' || !o.description.trim()) continue;
    unknown.push({ description: o.description.trim().slice(0, 120), ...(box(o.box) ? { box: box(o.box) } : {}) });
    if (unknown.length >= MAX_UNKNOWN) break;
  }
  return {
    quality,
    hasPeople: r.has_people === true,
    items: Array.from(items.values()).sort((a, b) => b.confidence - a.confidence).slice(0, MAX_ITEMS),
    unknown,
  };
}

/**
 * Worth one compare call with the catalog photos: the top two are near-tied, or the top item is
 * likely but its brand is unknown while it has more than one brand photo to choose from.
 */
export function needsCompare(result: ScanPhotoResult, candidates: readonly ScanCandidate[] = []): boolean {
  const [a, b] = result.items;
  if (!a || a.confidence < 0.3) return false;
  if (b && a.confidence - b.confidence < NEEDS_COMPARE_GAP) return true;
  if (a.brandName || a.confidence < CHOOSE_AT) return false;
  const c = candidates.find((x) => x.id === a.candidateId);
  return (c?.brands?.filter((x) => brandPhoto(x)).length ?? 0) > 1;
}

/** The single-item screen's next step. People always win: the photo is dropped. */
export function singleVerdict(result: ScanPhotoResult): ScanVerdict {
  if (result.hasPeople) return { kind: 'retake', reason: 'people' };
  const [top, ...rest] = result.items;
  if (!top) return { kind: 'retake', reason: result.quality === 'ok' ? 'no_equipment' : result.quality };
  const alternatives = rest.slice(0, 3).map((i) => i.candidateId);
  const brand = top.brandName ? { brandName: top.brandName } : {};
  if (top.confidence >= CONFIRM_AT) return { kind: 'confirm', candidateId: top.candidateId, ...brand, alternatives };
  if (top.confidence >= CHOOSE_AT) return { kind: 'choose', candidateId: top.candidateId, ...brand, alternatives };
  return { kind: 'retake', reason: result.quality === 'ok' ? 'unsure' : result.quality };
}
