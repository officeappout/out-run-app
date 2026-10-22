/**
 * Regional-run cleanup (owner decisions 22.10.2026): strip OSM marking codes
 * from route names, classify same-name routes across councils by GEOMETRY
 * (true duplicate vs the same trail's different sections) and disambiguate.
 * Pure — no I/O; callers inject geometry, boundary shares and names.
 */
import { overlapShare } from '../dataset-import/overlap';
import type { LngLat } from '../dataset-import/types';
import { stripOsmCode } from '../trail-graph/naming';

export const DUP_BUFFER_M = 30;
export const DUP_MIN_OVERLAP = 0.6;
const STEP_M = 40;

export { stripOsmCode };

/** Larger of the two directional overlap shares (a short section inside a long route counts). */
export function geometryOverlap(a: LngLat[], b: LngLat[]): number {
  return Math.max(overlapShare(a, b, DUP_BUFFER_M, STEP_M), overlapShare(b, a, DUP_BUFFER_M, STEP_M));
}

export const isTrueDuplicate = (a: LngLat[], b: LngLat[]): boolean => geometryOverlap(a, b) >= DUP_MIN_OVERLAP;

export interface CleanupDoc {
  id: string;
  name: string;
  authorityId: string;
  /** Short council name for suffixes ("גולן", not "מועצה אזורית גולן"). */
  authorityShort: string;
  km: number;
  path: LngLat[];
  /** Share (0..1) of the route's length inside its own authority's boundary; null = unknown. */
  insideShare: number | null;
}

export interface CleanupAction {
  id: string;
  /** New name (null = unchanged). */
  rename: string | null;
  /** Set when the doc is a true duplicate: the id that is kept instead. */
  duplicateOf: string | null;
  kind: 'untouched' | 'rename_code' | 'rename_disambiguated' | 'duplicate';
}

export interface DupGroupReport {
  name: string;
  members: number;
  /** max pairwise overlap between members of different clusters (same-trail-different-section evidence). */
  trueDuplicates: number;
  keptDistinct: number;
  maxOverlapAmongDistinct: number;
}

export const shortAuthorityName = (n: string) => n.replace(/^מועצה אזורית\s+/, '').trim();

const better = (a: CleanupDoc, b: CleanupDoc) => {
  const ai = a.insideShare ?? -1, bi = b.insideShare ?? -1;
  if (Math.abs(ai - bi) > 1e-6) return ai > bi ? a : b;
  if (a.km !== b.km) return a.km > b.km ? a : b;
  return a.id < b.id ? a : b;
};

export function planCleanup(docs: CleanupDoc[]): { actions: Map<string, CleanupAction>; groups: DupGroupReport[] } {
  const actions = new Map<string, CleanupAction>();
  const clean = new Map(docs.map((d) => [d.id, stripOsmCode(d.name)]));
  const byName = new Map<string, CleanupDoc[]>();
  for (const d of docs) byName.set(clean.get(d.id)!, [...(byName.get(clean.get(d.id)!) ?? []), d]);
  const groups: DupGroupReport[] = [];
  const taken = new Set(clean.values());

  for (const [name, members] of Array.from(byName)) {
    const sorted = [...members].sort((a, b) => a.id.localeCompare(b.id));
    // clusters of true duplicates (union-find over pairs in DIFFERENT councils or same council alike)
    const parent = new Map(sorted.map((d) => [d.id, d.id]));
    const find = (x: string): string => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x)!)), parent.get(x)!));
    let maxDistinct = 0;
    for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) {
      const o = geometryOverlap(sorted[i].path, sorted[j].path);
      if (o >= DUP_MIN_OVERLAP) parent.set(find(sorted[i].id), find(sorted[j].id));
      else maxDistinct = Math.max(maxDistinct, o);
    }
    const clusters = new Map<string, CleanupDoc[]>();
    for (const d of sorted) clusters.set(find(d.id), [...(clusters.get(find(d.id)) ?? []), d]);
    const kept: CleanupDoc[] = [];
    for (const c of Array.from(clusters.values())) {
      const keep = c.reduce(better);
      kept.push(keep);
      for (const d of c) if (d !== keep) actions.set(d.id, { id: d.id, rename: null, duplicateOf: keep.id, kind: 'duplicate' });
    }
    if (members.length > 1) groups.push({ name, members: members.length, trueDuplicates: members.length - kept.length, keptDistinct: kept.length, maxOverlapAmongDistinct: Math.round(maxDistinct * 100) / 100 });

    if (kept.length > 1) {
      const sameCouncil = new Set(kept.map((k) => k.authorityId)).size < kept.length;
      kept.sort((a, b) => a.id.localeCompare(b.id)).forEach((d, idx) => {
        let next = sameCouncil && kept.filter((k) => k.authorityId === d.authorityId).length > 1
          ? `${name} · ${d.km.toFixed(1)} ק״מ`
          : `${name} · קטע ${d.authorityShort}`;
        if (taken.has(next)) next = `${next} (${idx + 1})`;
        taken.add(next);
        actions.set(d.id, { id: d.id, rename: next, duplicateOf: null, kind: 'rename_disambiguated' });
      });
    } else if (kept.length === 1) {
      const d = kept[0];
      if (name !== d.name) actions.set(d.id, { id: d.id, rename: name, duplicateOf: null, kind: 'rename_code' });
    }
  }
  for (const d of docs) if (!actions.has(d.id)) actions.set(d.id, { id: d.id, rename: null, duplicateOf: null, kind: 'untouched' });
  return { actions, groups };
}

/**
 * Within one authority's fresh candidates: names that collide (e.g. after the
 * code was stripped) get " · <km> ק״מ" appended (then an ordinal if still equal).
 * Returns id → new name for the changed ones only.
 */
export function disambiguateByKm(items: Array<{ id: string; name: string; km: number }>): Map<string, string> {
  const out = new Map<string, string>();
  const groups = new Map<string, typeof items>();
  for (const it of items) groups.set(it.name, [...(groups.get(it.name) ?? []), it]);
  const taken = new Set(items.map((i) => i.name));
  for (const [name, g] of Array.from(groups)) {
    if (g.length < 2) continue;
    [...g].sort((a, b) => a.id.localeCompare(b.id)).forEach((it, idx) => {
      let next = `${name} · ${it.km.toFixed(1)} ק״מ`;
      if (taken.has(next)) next = `${next} (${idx + 1})`;
      taken.add(next);
      out.set(it.id, next);
    });
  }
  return out;
}
