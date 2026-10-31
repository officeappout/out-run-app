/**
 * Camera scan: the candidate list the model chooses from. Pure.
 *
 * Only park-installed catalog items (availableInLocations has 'park', or no locations set, the
 * same filter as the add-park StepEquipment), plus the two urban candidates. Items listed at the
 * user's park are flagged `atPark` so the prompt can prefer them without hiding the rest.
 */
import { URBAN_CANDIDATE_IDS, type ScanBrand, type ScanCandidate } from './scan-types';

/**
 * The visual index: one short look description per (equipment, brand), keyed
 * `${equipmentId}::${brandName}` (equipment-visual-index.json, built by
 * scripts/scan/build-visual-index.ts from each brands[].imageUrl).
 */
export type VisualIndex = Record<string, string>;
export const visualKey = (equipmentId: string, brandName: string) => `${equipmentId}::${brandName}`;

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

function brandsOf(equipmentId: string, brands: unknown, index: VisualIndex): ScanBrand[] {
  if (!Array.isArray(brands)) return [];
  const out: ScanBrand[] = [];
  for (const b of brands) {
    const o = (b ?? {}) as { brandName?: unknown; imageUrl?: unknown };
    const name = typeof o.brandName === 'string' ? o.brandName.trim() : '';
    if (!name || out.some((x) => x.name === name)) continue;
    const imageUrl = typeof o.imageUrl === 'string' && /^https:\/\//.test(o.imageUrl) ? o.imageUrl : undefined;
    const look = index[visualKey(equipmentId, name)];
    out.push({ name, ...(imageUrl ? { imageUrl } : {}), ...(look ? { look } : {}) });
  }
  return out;
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

export function buildScanCandidates(
  catalog: readonly RawCatalogDoc[],
  parkEquipmentIds: readonly string[] = [],
  index: VisualIndex = {},
): ScanCandidate[] {
  const atPark = new Set(parkEquipmentIds);
  const out: ScanCandidate[] = [];
  for (const doc of catalog) {
    if (!doc.id || !isParkInstalled(doc)) continue;
    const name = text(doc.name, 'he') ?? text(doc.nameLocalized, 'he');
    if (!name) continue;
    const brands = brandsOf(doc.id, doc.brands, index);
    out.push({
      id: doc.id,
      kind: 'catalog',
      name,
      nameEn: text(doc.nameLocalized, 'en') ?? text(doc.name, 'en'),
      hint: [typeof doc.movementPattern === 'string' ? doc.movementPattern : null, doc.isCardio === true ? 'cardio machine' : null]
        .filter(Boolean)
        .join(', ') || undefined,
      ...(brands.length ? { brands } : {}),
      imageUrl: brands.find((b) => b.imageUrl)?.imageUrl,
      ...(atPark.has(doc.id) ? { atPark: true } : {}),
    });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  for (const id of URBAN_CANDIDATE_IDS) {
    out.push({ id, kind: 'urban', name: URBAN_NAMES[id].en, nameEn: URBAN_NAMES[id].en, hint: URBAN_NAMES[id].hint });
  }
  return out;
}

/** One line per candidate, its brands (with their look) at the end. Stable per catalog, so cached. */
export function candidateLines(candidates: readonly ScanCandidate[]): string {
  return candidates
    .map((c) => {
      const brands = c.brands?.length
        ? `brands: ${c.brands.map((b) => (b.look ? `${b.name} (${b.look})` : b.name)).join('; ')}`
        : null;
      return [c.id, c.name, c.nameEn && c.nameEn !== c.name ? c.nameEn : null, c.hint, brands].filter(Boolean).join(' | ');
    })
    .join('\n');
}

/**
 * Spellings of the same maker (owner 31.10: the catalog, the Drive folders and the model don't
 * agree): Ludus / Ludos / Hebrew, Urbanix / Urbanics / Hebrew. Lower-case, no spaces.
 */
const BRAND_ALIASES: ReadonlyArray<readonly string[]> = [
  ['ludus', 'ludos', '\u05dc\u05d5\u05d3\u05d5\u05e1'],
  ['urbanix', 'urbanics', 'urbanex', '\u05d0\u05d5\u05e8\u05d1\u05e0\u05d9\u05e7\u05e1'],
];

/** One key per maker, so two spellings compare equal. */
export function brandKey(name: string): string {
  const n = name.toLowerCase().replace(/\s+/g, '');
  return BRAND_ALIASES.find((group) => group.includes(n))?.[0] ?? n;
}

/** The catalog's spelling of a brand the model named (case / space / alias-insensitive), or undefined. */
export function matchBrand(candidate: ScanCandidate | undefined, raw: unknown): string | undefined {
  if (!candidate?.brands?.length || typeof raw !== 'string' || !raw.trim()) return undefined;
  const want = brandKey(raw);
  return candidate.brands.find((b) => brandKey(b.name) === want)?.name;
}
