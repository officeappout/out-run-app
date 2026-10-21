/**
 * Authority ↔ OSM admin boundary relation, by name. Most authority docs carry
 * no OSM relation id (only city_registrations.adminRelationId, a handful), so
 * the runner matches the authority name against the admin_level=8 (and 6 for
 * regional councils' parents are not needed) relations in the same local PBF.
 * Pure: the PBF export happens in the script.
 */
export interface AdminRelation { relationId: number; names: string[]; adminLevel: string | null }

const PREFIXES = /^(מועצה אזורית|מועצה מקומית|מועצה|עיריית|עירית|עיר)\s+/;

/** "מועצה אזורית שער הנגב" / "שער-הנגב" / "שער הנגב " → "שערהנגב". */
export function normalizeAuthorityName(s: string): string {
  return s
    .trim()
    .replace(PREFIXES, '')
    .replace(/[\u0591-\u05C7]/g, '') // niqqud/cantillation + maqaf (U+05BE)
    .replace(/["'״׳`]/g, '')
    .replace(/[\s\-–—_.()]/g, '')
    .toLowerCase();
}

export function buildAdminNameIndex(rels: AdminRelation[]): Map<string, AdminRelation[]> {
  const idx = new Map<string, AdminRelation[]>();
  for (const r of rels) {
    for (const n of r.names.flatMap((x) => x.split(';'))) {
      const k = normalizeAuthorityName(n);
      if (!k) continue;
      if (!idx.has(k)) idx.set(k, []);
      if (!idx.get(k)!.some((x) => x.relationId === r.relationId)) idx.get(k)!.push(r);
    }
  }
  return idx;
}

/**
 * Unique match only. Two different relations with the same normalised name
 * (rare, but real for e.g. a city and a same-named council) → null + reason,
 * never a guess.
 */
export function matchAdminRelation(name: string, idx: Map<string, AdminRelation[]>, preferLevel = '8'): { relationId: number | null; reason: string } {
  const key = normalizeAuthorityName(name);
  let hits = idx.get(key) ?? [];
  let how = 'name match';
  // "הגלבוע" (our doc) vs "גלבוע" (OSM): retry without a leading definite article, either side.
  if (!hits.length) {
    const alt = key.startsWith('ה') ? key.slice(1) : `ה${key}`;
    hits = idx.get(alt) ?? [];
    how = 'name match (without/with leading ה)';
  }
  if (!hits.length) return { relationId: null, reason: 'no admin boundary with this name in the PBF' };
  if (hits.length === 1) return { relationId: hits[0].relationId, reason: how };
  const lvl = hits.filter((h) => h.adminLevel === preferLevel);
  if (lvl.length === 1) return { relationId: lvl[0].relationId, reason: `${how} (admin_level=${preferLevel})` };
  return { relationId: null, reason: `ambiguous: ${hits.length} boundaries share this name (${hits.map((h) => h.relationId).join(', ')})` };
}
