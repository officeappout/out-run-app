/**
 * GET /api/leagues/individual-board — the individual steps / distance /
 * points boards, aggregated on the SERVER (architecture audit, 19.10.2026).
 *
 * Replaces the client scans in ranking.service.ts (getLeaderboard,
 * getDistanceLeaderboard, getLeagueLeaderboard: a whole period of feed_posts;
 * getStepsLeaderboard: up to 5,000 dailyActivityPublic docs) for the states
 * the app still reaches (NeighborhoodLeaderboard → useLeaderboard). Same
 * filters and math (individual-board.ts), but:
 *   - at most MAX_DOCS docs read per board (bounded; logged when hit);
 *   - the ranked rows are cached per board for CACHE_MS on the instance, so
 *     many users opening the same board share one read;
 *   - only the top `max` rows + the caller's own row leave the server.
 * Group boards with weekly / monthly windows come from the league aggregates
 * on the client (getGroupLeagueBoard) — this route serves the rest.
 *
 * Age cohort: as before, the caller only sees their own cohort. Steps use the
 * caller's userAge doc (missing → 'minor', the dailyActivityPublic rule's own
 * default); feed boards use userAge when present, else the client hint (the
 * client's previous default, 'adult').
 *
 * Auth: Firebase ID token (Bearer). Group (league) boards: members only.
 * Query: mode = credit|distance|steps, scope, scopeId, window, gender,
 *        category, programId, ageGroup (hint), name (caller's, for the empty row), max ≤ 50.
 */
import { NextRequest, NextResponse } from 'next/server';
import { Timestamp, type Query } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { isDemoTenantId, isDemoUid } from '@/lib/demo';
import {
  boardScopeField,
  boardWindowStart,
  feedRows,
  rankBoard,
  stepsDateRange,
  stepsRows,
  type BoardCategory,
  type BoardGender,
  type BoardMode,
  type BoardRow,
  type BoardScope,
  type BoardWindow,
} from '@/features/arena/services/individual-board';

export const dynamic = 'force-dynamic';

const MAX_DOCS = 5000;
const CACHE_MS = 60_000;
const SCOPES = new Set<BoardScope>(['city', 'school', 'park', 'neighborhood', 'global', 'league', 'reserve']);
const MODES = new Set<BoardMode>(['credit', 'distance', 'steps']);
const WINDOWS = new Set<BoardWindow>(['daily', 'weekly', 'monthly']);
const GENDERS = new Set<BoardGender>(['all', 'male', 'female']);
const CATEGORIES = new Set<BoardCategory>(['overall', 'cardio', 'strength']);

const cache = new Map<string, { at: number; rows: BoardRow[] }>();

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(token)).uid;
  } catch {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const q = req.nextUrl.searchParams;
  const mode = (q.get('mode') ?? '') as BoardMode;
  const scope = (q.get('scope') ?? '') as BoardScope;
  const scopeId = q.get('scopeId') ?? '';
  const window = (q.get('window') ?? 'weekly') as BoardWindow;
  const gender = (q.get('gender') ?? 'all') as BoardGender;
  const category = (q.get('category') ?? 'overall') as BoardCategory;
  const programId = q.get('programId') ?? '';
  const max = Math.min(50, Math.max(1, Number(q.get('max') ?? 50) || 50));
  const okId = (s: string) => s.length <= 200 && !s.includes('/');
  if (!MODES.has(mode) || !SCOPES.has(scope) || !WINDOWS.has(window) || !GENDERS.has(gender) || !CATEGORIES.has(category)
    || !okId(scopeId) || !okId(programId) || (scope !== 'global' && !scopeId)) {
    return NextResponse.json({ error: 'bad-request' }, { status: 400 });
  }
  if (mode === 'steps' && scope === 'league') return NextResponse.json({ error: 'bad-request' }, { status: 400 });

  const db = getAdminDb();
  if (scope === 'league' && !(await db.collection('community_groups').doc(scopeId).collection('members').doc(uid).get()).exists) {
    return NextResponse.json({ error: 'not-a-member' }, { status: 403 });
  }

  // Caller's age cohort (server truth when known).
  const ageDoc = (await db.doc(`userAge/${uid}`).get()).data();
  const known = ageDoc?.ageGroup === 'adult' || ageDoc?.ageGroup === 'minor' ? (ageDoc.ageGroup as 'adult' | 'minor') : null;
  const hint = q.get('ageGroup') === 'minor' ? 'minor' : 'adult';
  const ageGroup: 'adult' | 'minor' = known ?? (mode === 'steps' ? 'minor' : hint);

  const now = new Date();
  const windowKey = mode === 'steps' ? stepsDateRange(now).to : boardWindowStart(window, now).toISOString();
  const key = [mode, scope, scopeId, window, gender, category, programId, ageGroup, windowKey].join('|');
  let rows = cache.get(key);
  if (!rows || Date.now() - rows.at > CACHE_MS) {
    let ref: Query;
    if (mode === 'steps') {
      const { from, to } = stepsDateRange(now);
      ref = db.collection('dailyActivityPublic').where('ageGroup', '==', ageGroup).where('date', '>=', from).where('date', '<=', to);
      const f = boardScopeField(scope);
      if (f) ref = ref.where(f, '==', scopeId);
    } else {
      const start = Timestamp.fromDate(boardWindowStart(window, now));
      ref = scope === 'league'
        ? db.collection('feed_posts').where('groupIds', 'array-contains', scopeId).where('createdAt', '>=', start)
        : db.collection('feed_posts').where('ageGroup', '==', ageGroup).where('createdAt', '>=', start);
      if (mode === 'distance') ref = ref.where('activityCategory', '==', 'cardio');
      const f = boardScopeField(scope);
      if (f && scope !== 'league') ref = ref.where(f, '==', scopeId);
      if (mode === 'credit' && category !== 'overall') ref = ref.where('activityCategory', '==', category);
      if (gender !== 'all') ref = ref.where('gender', '==', gender);
      if (mode === 'credit' && programId && scope !== 'league') ref = ref.where('programId', '==', programId);
    }
    const snap = await ref.limit(MAX_DOCS).get();
    if (snap.size >= MAX_DOCS) console.warn('[individual-board] read cap hit', { key });
    // Demo world guard (demo-users-design.md L3): demo rows never reach a real
    // board (they are written with ageGroup:'demo' so the queries above miss
    // them anyway). A demo scope's own board keeps them.
    const keepDemo = isDemoTenantId(scopeId);
    const docs = snap.docs
      .map((d) => d.data())
      .filter((d) => keepDemo || !(isDemoUid(d.uid) || isDemoUid(d.authorUid) || isDemoUid(d.userId)));
    rows = { at: Date.now(), rows: mode === 'steps' ? stepsRows(docs) : feedRows(docs, mode, mode === 'credit' ? category : null) };
    cache.set(key, rows);
    if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  }

  const board = rankBoard(rows.rows, uid, q.get('name') ?? undefined, max);
  return NextResponse.json({ ...board, window: mode === 'steps' ? 'weekly' : window });
}
