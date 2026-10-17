/**
 * GET /api/leagues/scope-stats — the neighborhood / city league board from
 * the server-side aggregates (league_scope_stats, written by the
 * onWorkoutCreateLeagueStats Cloud Function).
 *
 * Why a route and not a direct client read (David, 17.10.2026): reading the
 * collection from the client needs a firestore.rules deploy, and main's rules
 * file carries other unreleased changes. Reading here with the Admin SDK keeps
 * the leagues independent of that — no rules change needed. Only sums and
 * counts leave the server.
 *
 * Auth: Firebase ID token in Authorization: Bearer <token> (any signed-in user).
 * Query: granularity=city|neighborhood, window=weekly|monthly,
 *        parentId=<city> (required for neighborhood),
 *        category=overall|strength|cardio|maintenance, gender=all|male|female, max (≤50)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { buildScopeEntries, periodKeysFor, type ScopeStatsDoc } from '@/features/arena/services/league-scope-keys';

export const dynamic = 'force-dynamic';

const GRANULARITIES = new Set(['city', 'neighborhood']);
const WINDOWS = new Set(['weekly', 'monthly']);
const CATEGORIES = new Set(['overall', 'strength', 'cardio', 'maintenance']);
const GENDERS = new Set(['all', 'male', 'female']);

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  try {
    await getAdminAuth().verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const q = req.nextUrl.searchParams;
  const granularity = q.get('granularity') ?? '';
  const window = q.get('window') ?? '';
  const parentId = q.get('parentId');
  const category = q.get('category') ?? 'overall';
  const gender = q.get('gender') ?? 'all';
  const max = Math.min(50, Math.max(1, Number(q.get('max') ?? 20) || 20));
  if (!GRANULARITIES.has(granularity) || !WINDOWS.has(window) || !CATEGORIES.has(category) || !GENDERS.has(gender)) {
    return NextResponse.json({ error: 'bad-request' }, { status: 400 });
  }
  if (granularity === 'neighborhood' && !parentId) {
    return NextResponse.json({ entries: [] });
  }

  const db = getAdminDb();
  const periodKey = periodKeysFor(new Date())[window as 'weekly' | 'monthly'];
  let ref = db
    .collection('league_scope_stats')
    .where('window', '==', window)
    .where('periodKey', '==', periodKey)
    .where('granularity', '==', granularity);
  if (granularity === 'neighborhood') ref = ref.where('parentId', '==', parentId);
  const snap = await ref.get();
  const docs = snap.docs.map((d) => d.data() as ScopeStatsDoc);

  const ids = Array.from(new Set(docs.map((d) => d.scopeId)));
  const names = new Map<string, string>();
  if (ids.length) {
    const refs = ids.map((id) => db.collection('authorities').doc(id));
    const authSnaps = await db.getAll(...refs);
    authSnaps.forEach((a) => names.set(a.id, (a.exists && (a.data()?.name as string)) || a.id));
  }

  const entries = buildScopeEntries(
    docs,
    names,
    category as 'overall' | 'strength' | 'cardio' | 'maintenance',
    gender as 'all' | 'male' | 'female',
    max,
  );
  if (!entries) return NextResponse.json({ error: 'unsupported-filter' }, { status: 422 });
  return NextResponse.json({ entries, periodKey });
}
