/**
 * Readiness-roster ↔ app-account match suggestions (04.10.2026,
 * 00-MASTER-PLAN.md §13.84). The system only ever SUGGESTS — it never
 * links on its own, in any mode, even a "perfect" unambiguous match
 * (David, explicit, repeated). Lives entirely on the roster screen
 * (SoldiersRosterTable + /admin/authority/readiness) — units/[unitId]/
 * page.tsx (the self-declaration/officer-approval screen, a completely
 * separate concept: "אתה באמת ביחידה הזו") is untouched by this round.
 *
 * Scope: the roster screen shows the officer's WHOLE command span, not
 * one unit at a time (ReadinessPage's own established model — no
 * per-unit navigation) — so `unitId` here is optional, matching
 * computeUnitMembers's own convention: omitted = every unit in scope.
 *
 * Candidate pool: reuses computeUnitMembers (src/app/api/units/members/
 * route.ts) verbatim for "who declared which unit" — same scope
 * resolution, same tenant-wide query grouped by unit, nothing
 * re-derived. David, explicit: "התנאי המוקדם שם כבר מסנן את בריכת
 * המועמדים לתחום ההרשאה של הקצין — אל תבנה סינון מעליו, תאמת שהוא
 * חוסם." This function adds ZERO additional scope filtering of its
 * own — whatever computeUnitMembers returns (or denies) is forwarded
 * as-is.
 *
 * The ONLY name-matching rule in this round, deliberately strict
 * (David: "דויד" vs "דוד" stays unmatched, on purpose — one wrong
 * suggestion erodes trust in every other one): normalize both names
 * (trim, collapse internal whitespace, hyphens/maqaf → space, strip
 * quotes/geresh/gershayim) and compare for EXACT equality. No fuzzy
 * distance, no transliteration, no substring matching. Matching is
 * always WITHIN one unit — a soldier record in unit A is never
 * suggested against someone who declared unit B.
 */
import type { Firestore } from 'firebase-admin/firestore';
import type { UnitPermissionScope } from '@/lib/unitPermissionScope';
import { computeUnitMembers } from '@/app/api/units/members/route';
import type { ReadinessSoldier } from './readiness-write.service';

/** Hebrew hyphen/maqaf (־) alongside the ASCII hyphen; Hebrew geresh (׳)
 *  and gershayim (״) alongside plain ASCII quote/apostrophe — the four
 *  punctuation families David named explicitly. Hyphens become a space
 *  (they typically separate two name parts that could equally be
 *  written with a space); quotes are removed outright (they represent
 *  a sound within a letter, not a word boundary). */
export function normalizeNameForMatching(raw: string): string {
  return raw
    .trim()
    .replace(/[-־]/g, ' ')
    .replace(/['"׳״]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export interface ReadinessMatchSuggestion {
  soldierId: string;
  soldierName: string;
  uid: string;
  accountName: string;
  declaredUnitName: string;
}

/** Not auto-approvable, for either reason the officer needs to resolve:
 *  this soldier's name matches more than one declared account, OR the
 *  one declared account it matches is itself shared with another
 *  soldier row. Either way `candidates` is what the officer picks from
 *  — a length-1 array still means "pick to confirm," never auto-linked. */
export interface ReadinessMatchAmbiguity {
  soldierId: string;
  soldierName: string;
  candidates: { uid: string; accountName: string; declaredUnitName: string }[];
}

export interface DeclaredNotInRosterEntry {
  uid: string;
  accountName: string;
  declaredUnitName: string;
}

export interface ReadinessMatchSuggestionsBody {
  suggestions: ReadinessMatchSuggestion[];
  ambiguities: ReadinessMatchAmbiguity[];
  declaredNotInRoster: DeclaredNotInRosterEntry[];
}

export type ReadinessMatchSuggestionsResult =
  | { status: 200; body: ReadinessMatchSuggestionsBody }
  | { status: 400 | 403 | 503; body: { error: string } };

type SoldierRow = { id: string } & Omit<ReadinessSoldier, 'id'>;
type AccountRow = { uid: string; name: string };

/** Pure, per-unit matching — called once per unit block below. Kept
 *  separate from the scope/fetch orchestration above it so the matching
 *  RULE itself (strict normalization, 1:1-only suggestions, ambiguity
 *  on any name-group with >1 on either side) is independently testable
 *  without a Firestore round-trip. */
function matchWithinUnit(
  unlinkedSoldiers: SoldierRow[],
  availableAccounts: AccountRow[],
  unitName: string,
): { suggestions: ReadinessMatchSuggestion[]; ambiguities: ReadinessMatchAmbiguity[] } {
  const soldiersByName = new Map<string, SoldierRow[]>();
  unlinkedSoldiers.forEach((s) => {
    const key = normalizeNameForMatching(s.name);
    if (!soldiersByName.has(key)) soldiersByName.set(key, []);
    soldiersByName.get(key)!.push(s);
  });
  const accountsByName = new Map<string, AccountRow[]>();
  availableAccounts.forEach((a) => {
    const key = normalizeNameForMatching(a.name);
    if (!accountsByName.has(key)) accountsByName.set(key, []);
    accountsByName.get(key)!.push(a);
  });

  const suggestions: ReadinessMatchSuggestion[] = [];
  const ambiguities: ReadinessMatchAmbiguity[] = [];

  const allNames = new Set<string>([...Array.from(soldiersByName.keys()), ...Array.from(accountsByName.keys())]);
  for (const name of Array.from(allNames)) {
    const soldierGroup = soldiersByName.get(name) ?? [];
    const accountGroup = accountsByName.get(name) ?? [];
    if (soldierGroup.length === 0 || accountGroup.length === 0) continue; // no counterpart on the other side at all

    if (soldierGroup.length === 1 && accountGroup.length === 1) {
      const soldier = soldierGroup[0];
      const account = accountGroup[0];
      if ((soldier.rejectedUids ?? []).includes(account.uid)) continue; // "לא הוא" — never re-offered
      suggestions.push({
        soldierId: soldier.id,
        soldierName: soldier.name,
        uid: account.uid,
        accountName: account.name,
        declaredUnitName: unitName,
      });
      continue;
    }

    // Either side has more than one entry sharing this normalized name —
    // the WHOLE group is ambiguous, including a soldier whose own count
    // here is 1 but whose single same-named account is also claimed by
    // another soldier (that soldier's candidate list is still length 1,
    // but it lives in `ambiguities`, never `suggestions` — a real
    // candidate shared with someone else is not a confirmed match).
    soldierGroup.forEach((soldier) => {
      const candidates = accountGroup.filter((a) => !(soldier.rejectedUids ?? []).includes(a.uid));
      if (candidates.length === 0) return;
      ambiguities.push({
        soldierId: soldier.id,
        soldierName: soldier.name,
        candidates: candidates.map((a) => ({ uid: a.uid, accountName: a.name, declaredUnitName: unitName })),
      });
    });
  }

  return { suggestions, ambiguities };
}

export async function computeReadinessMatchSuggestions(
  db: Firestore,
  scope: UnitPermissionScope,
  query: { tenantId?: string | null; unitId?: string | null },
): Promise<ReadinessMatchSuggestionsResult> {
  const membersResult = await computeUnitMembers(db, scope, { tenantId: query.tenantId ?? null, unitId: query.unitId ?? null });
  if (membersResult.status !== 200) {
    return membersResult as ReadinessMatchSuggestionsResult;
  }
  const memberBlocks = membersResult.body.units;
  if (memberBlocks.length === 0) {
    return { status: 200, body: { suggestions: [], ambiguities: [], declaredNotInRoster: [] } };
  }
  const tenantId = memberBlocks[0].tenantId; // every block shares the same tenant by construction

  // Exclude any uid already linked to a readiness_soldiers row ANYWHERE
  // (system-wide, mirroring computeLinkSoldier's own uniqueness check,
  // point 7) — a suggestion that would just fail with 409 on approval
  // is worse than offering none. Computed once, across every unit in
  // scope, not re-queried per unit.
  const allDeclaredUids = memberBlocks.flatMap((b) => b.approvedMembers.map((m) => m.uid));
  const alreadyLinkedUids = new Set<string>();
  for (const idsChunk of chunk(allDeclaredUids, 30)) {
    if (idsChunk.length === 0) continue;
    const snap = await db.collection('readiness_soldiers').where('uid', 'in', idsChunk).get();
    snap.docs.forEach((d) => {
      const data = d.data() as Omit<ReadinessSoldier, 'id'>;
      if (!data.mergedInto && data.uid) alreadyLinkedUids.add(data.uid);
    });
  }

  // One tenant-wide readiness_soldiers fetch (same "fetch once, filter
  // in memory per unit" shape computeUnitRoster's own pattern already
  // uses), not one query per unit.
  const soldiersSnap = await db.collection('readiness_soldiers').where('tenantId', '==', tenantId).get();
  const allSoldiers: SoldierRow[] = soldiersSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<ReadinessSoldier, 'id'>) }))
    .filter((s) => !s.mergedInto && !s.uid);

  const suggestions: ReadinessMatchSuggestion[] = [];
  const ambiguities: ReadinessMatchAmbiguity[] = [];
  const declaredNotInRoster: DeclaredNotInRosterEntry[] = [];

  for (const block of memberBlocks) {
    const unitSoldiers = allSoldiers.filter((s) => s.unitId === block.unitId);
    // David: don't merge the two approval questions — a declared member
    // is a match candidate here regardless of unitApprovedByOfficer.
    const availableAccounts: AccountRow[] = block.approvedMembers
      .filter((m) => !alreadyLinkedUids.has(m.uid))
      .map((m) => ({ uid: m.uid, name: m.name }));

    declaredNotInRoster.push(...availableAccounts.map((a) => ({ uid: a.uid, accountName: a.name, declaredUnitName: block.unitName })));

    const matched = matchWithinUnit(unitSoldiers, availableAccounts, block.unitName);
    suggestions.push(...matched.suggestions);
    ambiguities.push(...matched.ambiguities);
  }

  return { status: 200, body: { suggestions, ambiguities, declaredNotInRoster } };
}
