/**
 * GET /api/units/roster-workout-summary?tenantId=&unitId= — for every
 * member of a unit/tenant in scope, two numbers: how many workouts they
 * logged in the last 7 days, and (only when that count is non-zero) the
 * most recent date among them. Slice F of the persona-unit-unification
 * build (26.09.2026, see docs/audit-2026-09/00-MASTER-PLAN.md §13.31).
 *
 * Replaces [unitId]/page.tsx's roster table's "אימונים"/"פעילות אחרונה"
 * columns, temporarily removed in §13.29 when the client-SDK query that
 * fed them (a direct, per-member read of `workouts`, broken for any real
 * officer) was deleted — this is the proper replacement David asked for,
 * not the "לפרטים" placeholder link that stood in for it since.
 *
 * SINGLE DATA SOURCE, by David's explicit correction (26.09.2026): the
 * original proposal also considered streaks/{uid}.lastActivityDate as a
 * denormalized "last workout ever" source. Production verification
 * (scripts/_audit-streak-lastactivity-accuracy.ts, read-only, no writes)
 * found it isn't reliable enough to depend on — of 146 sampled streak
 * holders, 47% had ZERO matching workouts docs at all, and 4 showed a
 * streak date 2-45 days AHEAD of the real last workout. "מי לא התאמן
 * השבוע" is the actual question an officer opens this screen to answer
 * — a soldier with no workout in the last 7 days shows as such, with no
 * separate (and, per that audit, unverifiable) "last-ever" date. One
 * source, not two — less that can silently drift out of sync.
 *
 * Efficiency (David required a stop-and-propose before building this —
 * see §13.31 for the full write-up; approved 26.09.2026):
 *   - Member discovery mirrors /api/units/members' own scope resolution
 *     (never trusts a client-supplied uid list) — same branching, see
 *     resolveTargetUids() below.
 *   - ONE query per 30-uid chunk (Firestore's `in` operator cap), not one
 *     query per member: where('userId','in',chunk).where('date','>=',
 *     sevenDaysAgo) — bounded to 7 days of data, never full history. A
 *     unit with 100 members costs 4 parallel queries, not 100.
 *   - .select('userId','date') only — no full document body, and no
 *     geographic field of any kind (routePath/parkId/parkName/segments/
 *     laps/commuteDestination/commuteLabel — every location-identifying
 *     field on WorkoutHistoryEntry) ever crosses the wire, because none
 *     of them are named in this allowlist.
 *   - Query shape verified against PRODUCTION before this was written —
 *     not assumed, not just tested against a self-seeded emulator (the
 *     rule §13.30 introduced): scripts/_check-roster-workout-query-index.ts,
 *     real uids, a real 7-day window and an unbounded one, both against
 *     the actual `workouts` collection. No composite index required
 *     beyond Firestore's automatic single-field indexes.
 *
 * Fail-closed on the WHOLE request (David, explicit — "כשל = שגיאה
 * מוצגת. לא '0 אימונים'"): if the member-discovery read or ANY chunk's
 * query fails, the entire response fails (500) — never a partial result
 * where some members show a real 0 and others are silently missing or
 * wrong. A read failure is exactly as dangerous here as axioms.md §4's
 * "no partial writes" — a partially-successful READ that gets rendered
 * as if it were complete is the same class of silent corruption.
 *
 * Domain resolution: resolveUnitPermissionScope(uid), same as every
 * other route in this build — fail-closed, uid-only, never client input.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { isRateLimited } from '@/lib/rateLimit';
import { RATE_LIMITS } from '@/lib/rateLimitConfig';
import { resolveUnitPermissionScope, type UnitPermissionScope } from '@/lib/unitPermissionScope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DENIED_MESSAGE = 'אין לך הרשאה לצפות ברשימה זו.';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface RosterWorkoutSummaryEntry {
  uid: string;
  workoutsLast7Days: number;
  /** ISO date string of the most recent workout in the last 7 days, or
   *  null when workoutsLast7Days is 0. Never a "last ever" date — see
   *  this file's own header comment for why that source was dropped. */
  lastWorkoutDateThisWeek: string | null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Mirrors computeUnitMembers' (/api/units/members) own scope→target
 * resolution exactly — same branching, same authorization rules. Returns
 * the authoritative uid list for whatever the caller's scope (optionally
 * narrowed by query.unitId) actually covers; never trusts anything
 * client-supplied for WHO is in scope, only for narrowing within it.
 */
async function resolveTargetUids(
  db: Firestore,
  scope: UnitPermissionScope,
  query: { tenantId?: string | null; unitId?: string | null },
): Promise<{ status: 200; uids: string[] } | { status: 400 | 403; body: { error: string } }> {
  if (scope.kind === 'denied') {
    return { status: 403, body: { error: DENIED_MESSAGE } };
  }

  let targetTenantId: string;
  let targetUnitIds: string[] | null; // null = "every unit under targetTenantId"

  if (scope.kind === 'unitAdmin') {
    targetTenantId = scope.tenantId;
    if (query.unitId) {
      if (!scope.unitIds.includes(query.unitId)) {
        return { status: 403, body: { error: DENIED_MESSAGE } };
      }
      targetUnitIds = [query.unitId];
    } else {
      targetUnitIds = scope.unitIds;
    }
  } else if (scope.kind === 'tenantOwner') {
    targetTenantId = scope.tenantId;
    if (query.unitId) {
      const unitSnap = await db.collection('tenants').doc(targetTenantId).collection('units').doc(query.unitId).get();
      if (!unitSnap.exists) {
        return { status: 403, body: { error: DENIED_MESSAGE } };
      }
      targetUnitIds = [query.unitId];
    } else {
      targetUnitIds = null;
    }
  } else {
    // scope.kind === 'root' — no "own" domain to default to.
    if (!query.tenantId) {
      return { status: 400, body: { error: 'tenantId is required' } };
    }
    targetTenantId = query.tenantId;
    if (query.unitId) {
      const unitSnap = await db.collection('tenants').doc(targetTenantId).collection('units').doc(query.unitId).get();
      if (!unitSnap.exists) {
        return { status: 400, body: { error: 'unit not found' } };
      }
      targetUnitIds = [query.unitId];
    } else {
      targetUnitIds = null;
    }
  }

  const usersSnap = await db.collection('users').where('core.tenantId', '==', targetTenantId).get();
  const uids: string[] = [];
  usersSnap.docs.forEach((d) => {
    const unitId = d.data()?.core?.unitId;
    if (targetUnitIds === null || (typeof unitId === 'string' && targetUnitIds.includes(unitId))) {
      uids.push(d.id);
    }
  });

  return { status: 200, uids };
}

export type RosterWorkoutSummaryResult =
  | { status: 200; body: { summaries: RosterWorkoutSummaryEntry[] } }
  | { status: 400 | 403 | 500; body: { error: string } };

/**
 * Core computation, factored out of the HTTP handler for direct emulator
 * testability — matches the compute*() split used throughout this build.
 */
export async function computeRosterWorkoutSummary(
  db: Firestore,
  scope: UnitPermissionScope,
  query: { tenantId?: string | null; unitId?: string | null },
): Promise<RosterWorkoutSummaryResult> {
  const targetResult = await resolveTargetUids(db, scope, query);
  if (targetResult.status !== 200) {
    return targetResult;
  }
  const { uids } = targetResult;
  if (uids.length === 0) {
    return { status: 200, body: { summaries: [] } };
  }

  const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS);
  const uidChunks = chunk(uids, 30); // Firestore 'in' operator cap

  // Fail-closed on the WHOLE request — a single chunk's query failure
  // rejects the entire Promise.all, never a partial result rendered as
  // if it were complete. Caller (GET handler below) catches and returns
  // 500 for any thrown error here.
  const chunkSnaps = await Promise.all(
    uidChunks.map((uidChunk) =>
      db.collection('workouts')
        .where('userId', 'in', uidChunk)
        .where('date', '>=', sevenDaysAgo)
        .select('userId', 'date')
        .get(),
    ),
  );

  const countByUid = new Map<string, number>();
  const lastDateMsByUid = new Map<string, number>();
  chunkSnaps.forEach((snap) => {
    snap.docs.forEach((d: QueryDocumentSnapshot) => {
      const data = d.data();
      const uid = data.userId;
      if (typeof uid !== 'string') return;
      countByUid.set(uid, (countByUid.get(uid) ?? 0) + 1);
      const dateMs = typeof data.date?.toMillis === 'function' ? data.date.toMillis() : null;
      if (dateMs !== null) {
        const current = lastDateMsByUid.get(uid);
        if (current === undefined || dateMs > current) lastDateMsByUid.set(uid, dateMs);
      }
    });
  });

  const summaries: RosterWorkoutSummaryEntry[] = uids.map((uid) => {
    const workoutsLast7Days = countByUid.get(uid) ?? 0;
    const lastMs = lastDateMsByUid.get(uid);
    return {
      uid,
      workoutsLast7Days,
      lastWorkoutDateThisWeek: lastMs !== undefined ? new Date(lastMs).toISOString() : null,
    };
  });

  return { status: 200, body: { summaries } };
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    let uid: string;
    try {
      const decoded = await adminAuth.verifyIdToken(idToken, true);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    const db = getAdminDb();

    const rateLimited = await isRateLimited(db, `roster-workout-summary:${uid}`, RATE_LIMITS.rosterWorkoutSummary.uidHourly());
    if (rateLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסה שוב מאוחר יותר.' }, { status: 429 });
    }

    const scope = await resolveUnitPermissionScope(uid);
    const query = {
      tenantId: request.nextUrl.searchParams.get('tenantId'),
      unitId: request.nextUrl.searchParams.get('unitId'),
    };
    const result = await computeRosterWorkoutSummary(db, scope, query);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    // Deliberately NOT caught inside computeRosterWorkoutSummary itself —
    // a chunk-query failure (missing index, outage, timeout) must surface
    // here as a real 500, never silently absorbed into an empty/zero
    // summaries array. See this file's own header comment on fail-closed.
    console.error('[/api/units/roster-workout-summary] error:', err?.message ?? err);
    return NextResponse.json({ error: 'שגיאה בטעינת נתוני האימונים.' }, { status: 500 });
  }
}
