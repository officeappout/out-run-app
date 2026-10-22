/**
 * Cross-council duplicate hook (pure; the Firestore reader is injected).
 * Same name + >=60% geometry overlap in ANOTHER authority = same route -> drop.
 * Same name, different section -> keep, renamed "· קטע <council>".
 * A failing reader (quota spike, transient error) never halts the run: warn and
 * treat the candidate as having no duplicate.
 */
import { isTrueDuplicate, shortAuthorityName } from './dedupe';
import type { CandidateRoute } from './stages';

export interface NamedDoc { id: string; data: Record<string, any> }

const toLngLat = (raw: unknown): [number, number][] => {
  if (!Array.isArray(raw)) return [];
  const out: [number, number][] = [];
  for (const p of raw) {
    if (Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) out.push([p[0], p[1]]);
    else if (p && typeof p === 'object' && Number.isFinite((p as any).lng) && Number.isFinite((p as any).lat)) out.push([(p as any).lng, (p as any).lat]);
  }
  return out;
};

export function makeCrossCouncilDuplicate(opts: {
  readByName: (name: string) => Promise<NamedDoc[]>;
  authorityName: string;
  warn?: (s: string) => void;
}) {
  const byName = new Map<string, NamedDoc[]>();
  const warn = opts.warn ?? ((s: string) => console.warn(s));
  return async (r: CandidateRoute): Promise<string | null> => {
    const name = String(r.data?.name ?? '').trim();
    if (!name) return null;
    if (!byName.has(name)) {
      try { byName.set(name, await opts.readByName(name)); }
      catch (e) { warn(`  ⚠ cross-council duplicate check failed for "${name}" (${(e as Error).message}) — keeping the candidate`); return null; }
    }
    const mine = toLngLat(r.data?.path);
    if (mine.length < 2) return null;
    let sameNameElsewhere = false;
    for (const d of byName.get(name)!) {
      if (d.data.status === 'archived') continue;
      sameNameElsewhere = true;
      const theirs = toLngLat(d.data.path);
      if (theirs.length >= 2 && isTrueDuplicate(mine, theirs)) return d.id;
    }
    if (sameNameElsewhere && !name.includes('· קטע ')) r.data.name = `${name} · קטע ${shortAuthorityName(opts.authorityName)}`;
    return null;
  };
}

/**
 * Re-run guard for the id change osm_rel_<id> -> osm_rel_<id>__<authorityId>:
 * a candidate is dropped when the OLD-format doc exists with the same authority,
 * in ANY status (archived included — an archived duplicate must not be re-created).
 * `legacy` maps old doc id -> its authorityId (only ids that exist).
 */
export function dropLegacyIdCandidates<T extends { id: string }>(candidates: T[], legacy: Map<string, string>, authorityId: string): { kept: T[]; dropped: string[] } {
  const kept: T[] = [], dropped: string[] = [];
  for (const c of candidates) {
    const m = /^(osm_rel_\d+)__/.exec(c.id);
    if (m && legacy.get(m[1]) === authorityId) dropped.push(c.id); else kept.push(c);
  }
  return { kept, dropped };
}
