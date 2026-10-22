/**
 * Cross-authority duplicate check for the nationwide runner (owner 22.10.2026).
 * Councils run one at a time, so a trail that crosses several (שביל ישראל,
 * שביל גולני) is judged against what ALREADY exists in other authorities:
 * same name + ≥60% geometry overlap (30 m) = the same route → the new candidate
 * is dropped. Same name but a different section (low overlap) is kept — the
 * name gets a council suffix at apply time. Read-only (single-field equality query).
 */
import type { Firestore } from 'firebase-admin/firestore';
import type { CandidateRoute } from '../../../src/lib/routes-nationwide';
import { isTrueDuplicate, shortAuthorityName } from '../../../src/lib/routes-nationwide';
import { parsePathLoose } from './path';
import { readOfficialRoutesByName } from '../../lib/route-collections-read.node';

export function crossCouncilDuplicate(db: Firestore, authorityId: string, authorityName: string) {
  const byName = new Map<string, Awaited<ReturnType<typeof readOfficialRoutesByName>>>();
  return async (r: CandidateRoute): Promise<string | null> => {
    const name = String(r.data?.name ?? '').trim();
    if (!name) return null;
    if (!byName.has(name)) byName.set(name, await readOfficialRoutesByName(db, name, authorityId));
    const mine = parsePathLoose(r.data?.path);
    if (mine.length < 2) return null;
    let sameNameElsewhere = false;
    for (const d of byName.get(name)!) {
      if (d.data.status === 'archived') continue;
      sameNameElsewhere = true;
      const theirs = parsePathLoose(d.data.path);
      if (theirs.length >= 2 && isTrueDuplicate(mine, theirs)) return d.id;
    }
    // Same trail, different section: keep it, disambiguated by council ("שביל ישראל · קטע לכיש").
    // (Deliberate in-place rename of the candidate — only the display name changes.)
    if (sameNameElsewhere && !name.includes('· קטע ')) r.data.name = `${name} · קטע ${shortAuthorityName(authorityName)}`;
    return null;
  };
}
