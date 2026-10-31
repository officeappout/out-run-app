/**
 * Camera scan: the candidate list the model chooses from. Pure.
 *
 * Only park-installed catalog items (availableInLocations has 'park', or no locations set, the
 * same filter as the add-park StepEquipment), plus the two urban candidates. Items listed at the
 * user's park are flagged `atPark` so the prompt can prefer them without hiding the rest.
 */
import { URBAN_CANDIDATE_IDS, type ScanCandidate } from './scan-types';

/** gym_equipment as read by the Admin SDK (raw Firestore data). */
export interface RawCatalogDoc {
  id: string;
  name?: unknown;
  nameLocalized?: unknown;
  movementPattern?: unknown;
  availableInLocations?: unknown;
  isCardio?: unknown;
  brands?: unknown;
}

function text(v: unknown, lang: 'he' | 'en'): string | undefined {
  if (typeof v === 'string') return v.trim() || undefined;
  if (v && typeof v === 'object') {
    const s = (v as Record<string, unknown>)[lang];
    return typeof s === 'string' && s.trim() ? s.trim() : undefined;
  }
  return undefined;
}

function firstBrandImage(brands: unknown): string | undefined {
  if (!Array.isArray(brands)) return undefined;
  for (const b of brands) {
    const url = (b as { imageUrl?: unknown } | null)?.imageUrl;
    if (typeof url === 'string' && /^https:\/\//.test(url)) return url;
  }
  return undefined;
}

export function isParkInstalled(doc: RawCatalogDoc): boolean {
  const locs = doc.availableInLocations;
  return !Array.isArray(locs) || locs.length === 0 || locs.includes('park');
}

/** English names for the urban candidates; the Hebrew label is the UI's job (catalog keys). */
const URBAN_NAMES: Record<(typeof URBAN_CANDIDATE_IDS)[number], { en: string; hint: string }> = {
  'urban:bench': { en: 'Street / park bench', hint: 'seating bench, not a workout station' },
  'urban:stairs': { en: 'Outdoor stairs / steps', hint: 'public stairs or raised steps' },
};

export function buildScanCandidates(catalog: readonly RawCatalogDoc[], parkEquipmentIds: readonly string[] = []): ScanCandidate[] {
  const atPark = new Set(parkEquipmentIds);
  const out: ScanCandidate[] = [];
  for (const doc of catalog) {
    if (!doc.id || !isParkInstalled(doc)) continue;
    const name = text(doc.name, 'he') ?? text(doc.nameLocalized, 'he');
    if (!name) continue;
    out.push({
      id: doc.id,
      kind: 'catalog',
      name,
      nameEn: text(doc.nameLocalized, 'en') ?? text(doc.name, 'en'),
      hint: [typeof doc.movementPattern === 'string' ? doc.movementPattern : null, doc.isCardio === true ? 'cardio machine' : null]
        .filter(Boolean)
        .join(', ') || undefined,
      imageUrl: firstBrandImage(doc.brands),
      ...(atPark.has(doc.id) ? { atPark: true } : {}),
    });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  for (const id of URBAN_CANDIDATE_IDS) {
    out.push({ id, kind: 'urban', name: URBAN_NAMES[id].en, nameEn: URBAN_NAMES[id].en, hint: URBAN_NAMES[id].hint });
  }
  return out;
}

/** One line per candidate. Stable for a given catalog, so it sits in the prompt cache. */
export function candidateLines(candidates: readonly ScanCandidate[]): string {
  return candidates
    .map((c) => [c.id, c.name, c.nameEn && c.nameEn !== c.name ? c.nameEn : null, c.hint].filter(Boolean).join(' | '))
    .join('\n');
}
