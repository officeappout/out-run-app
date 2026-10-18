/**
 * GET /api/leagues/scope-stats — league boards from the server-side
 * aggregates (league_scope_stats, written by onWorkoutCreateLeagueStats).
 *
 * Why a route and not a direct client read (David, 17.10.2026): reading the
 * collection from the client needs a firestore.rules deploy, and main's rules
 * file carries other unreleased changes. Reading here with the Admin SDK keeps
 * the leagues independent of that — no rules change needed. Only sums and
 * counts leave the server.
 *
 * Auth: Firebase ID token in Authorization: Bearer <token> (any signed-in user).
 * Query:
 *   board = city | neighborhood | neighborhood-national | settlement
 *           (or the older granularity=city|neighborhood)
 *   window = weekly | monthly
 *   parentId = <city>            — required for board=neighborhood (one city)
 *   region = <regional council>  — optional for board=settlement
 *   kind = all | city | council | settlement — optional filter for board=city…
 *   measure = total | improved | distance — improved = gain vs the previous
 *             period; distance = most km first (unfiltered board only — km are
 *             one scope-wide tally, shown next to the points, never part of them)
 *   category = overall|strength|cardio|maintenance, gender = all|male|female, max ≤ 50
 *
 * Settlements (kibbutzim / moshavim) are recorded as neighborhoods of their
 * regional council (users' core.neighborhoodId), so the national boards tell
 * them apart by the authority's own type.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import {
  buildDistanceEntries,
  buildImprovedEntries,
  buildScopeEntries,
  periodKeysFor,
  previousPeriodKey,
  scopeKindOf,
  type ScopeKind,
  type ScopeStatsDoc,
} from '@/features/arena/services/league-scope-keys';

export const dynamic = 'force-dynamic';

const BOARDS = new Set(['city', 'neighborhood', 'neighborhood-national', 'settlement']);
const WINDOWS = new Set(['weekly', 'monthly']);
const CATEGORIES = new Set(['overall', 'strength', 'cardio', 'maintenance']);
const GENDERS = new Set(['all', 'male', 'female']);

type Category = 'overall' | 'strength' | 'cardio' | 'maintenance';
type Gender = 'all' | 'male' | 'female';

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  try {
    await getAdminAuth().verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const q = req.nextUrl.searchParams;
  const board = q.get('board') ?? q.get('granularity') ?? '';
  const window = q.get('window') ?? '';
  const parentId = q.get('parentId');
  const region = q.get('region');
  const kind = q.get('kind') ?? 'all';
  const measureParam = q.get('measure');
  const measure = measureParam === 'improved' || measureParam === 'distance' ? measureParam : 'total';
  const category = (q.get('category') ?? 'overall') as Category;
  const gender = (q.get('gender') ?? 'all') as Gender;
  const max = Math.min(50, Math.max(1, Number(q.get('max') ?? 20) || 20));
  if (!BOARDS.has(board) || !WINDOWS.has(window) || !CATEGORIES.has(category) || !GENDERS.has(gender)) {
    return NextResponse.json({ error: 'bad-request' }, { status: 400 });
  }
  if (board === 'neighborhood' && !parentId) {
    return NextResponse.json({ entries: [] });
  }

  const db = getAdminDb();
  const win = window as 'weekly' | 'monthly';
  const periodKey = periodKeysFor(new Date())[win];
  const granularity = board === 'city' ? 'city' : 'neighborhood';

  const readPeriod = async (key: string) => {
    let ref = db
      .collection('league_scope_stats')
      .where('window', '==', win)
      .where('periodKey', '==', key)
      .where('granularity', '==', granularity);
    if (board === 'neighborhood') ref = ref.where('parentId', '==', parentId);
    if (board === 'settlement' && region) ref = ref.where('parentId', '==', region);
    const snap = await ref.get();
    return snap.docs.map((d) => d.data() as ScopeStatsDoc & { parentId?: string | null });
  };

  let docs = await readPeriod(periodKey);

  // Names, kinds and parents of every scope on the board (one batched read).
  const meta = new Map<string, { name: string; kind: ScopeKind; parentId: string | null }>();
  const loadMeta = async (ids: string[]) => {
    const missing = ids.filter((id) => !meta.has(id));
    if (!missing.length) return;
    const snaps = await db.getAll(...missing.map((id) => db.collection('authorities').doc(id)));
    snaps.forEach((a) => {
      const d = a.data() ?? {};
      meta.set(a.id, {
        name: (a.exists && (d.name as string)) || a.id,
        kind: scopeKindOf(d.type, d.parentAuthorityId),
        parentId: typeof d.parentAuthorityId === 'string' ? d.parentAuthorityId : null,
      });
    });
  };
  await loadMeta(Array.from(new Set(docs.map((d) => d.scopeId))));

  // National boards: settlements vs real neighborhoods; the city board by kind.
  const keep = (id: string) => {
    const k = meta.get(id)?.kind ?? 'other';
    if (board === 'settlement') return k === 'settlement';
    if (board === 'neighborhood-national') return k !== 'settlement';
    // The city board is cities and councils only — a reservist's
    // core.authorityId can be a military unit (it showed up as "חטיבה 810"
    // among the cities, and as a battle opponent).
    if (board === 'city' && !(k === 'city' || k === 'regional_council' || k === 'local_council')) return false;
    if (board === 'city' && kind !== 'all') {
      if (kind === 'city') return k === 'city';
      if (kind === 'council') return k === 'regional_council' || k === 'local_council';
      if (kind === 'settlement') return k === 'settlement';
    }
    return true;
  };
  docs = docs.filter((d) => keep(d.scopeId));

  // Parent names ("שכונה · עיר", "קיבוץ · מועצה") for the national boards.
  if (board === 'neighborhood-national' || board === 'settlement') {
    await loadMeta(Array.from(new Set(docs.map((d) => meta.get(d.scopeId)?.parentId ?? d.parentId ?? '').filter(Boolean))));
  }
  const names = new Map(Array.from(meta, ([id, m]) => [id, m.name]));
  const parentOf = (id: string) => {
    const pid = meta.get(id)?.parentId ?? null;
    return pid ? { parentId: pid, parentName: meta.get(pid)?.name ?? null } : { parentId: null, parentName: null };
  };

  let entries;
  if (measure === 'distance') {
    entries = category === 'overall' && gender === 'all' ? buildDistanceEntries(docs, names, max) : null;
  } else if (measure === 'improved') {
    // Only this period's (already filtered) scopes can appear, so the previous
    // period needs no filtering — it's a lookup by scopeId.
    const prev = await readPeriod(previousPeriodKey(win, periodKey));
    entries = buildImprovedEntries(docs, prev, names, category, gender, max);
  } else {
    entries = buildScopeEntries(docs, names, category, gender, max);
  }
  if (!entries) return NextResponse.json({ error: 'unsupported-filter' }, { status: 422 });

  // Regions (regional councils) that have active settlements — the filter chips.
  let regions: { id: string; name: string }[] | undefined;
  if (board === 'settlement' && !region) {
    const ids = Array.from(new Set(docs.map((d) => parentOf(d.scopeId).parentId).filter((x): x is string => !!x)));
    regions = ids.map((id) => ({ id, name: meta.get(id)?.name ?? id })).sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }

  return NextResponse.json({
    entries: entries.map((e) => ({ ...e, ...parentOf(e.scopeId), kind: meta.get(e.scopeId)?.kind ?? 'other' })),
    periodKey,
    regions,
  });
}
