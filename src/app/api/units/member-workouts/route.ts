/**
 * GET /api/units/member-workouts?uid=<targetUid> — a named member's recent
 * workout summary, for the officer who manages their unit/tenant.
 *
 * 24.09.2026 — closes a real privacy violation found while investigating
 * the officer panel screens (.claude/plans/tenant-military-school-
 * vertical-model.md §ח, David's decision #2). The pre-existing client-side
 * read (src/app/admin/authority/units/[unitId]/page.tsx's
 * loadMemberWorkouts, direct Firestore client-SDK query) pulled the FULL
 * workout document — including `routePath`, a raw GPS coordinate array —
 * into the browser for a named individual, and rendered a per-workout
 * "GPS" badge whenever one was present. No map was drawn, but the route
 * data was already resident in client state, tied to one named person and
 * one dated workout — exactly the geographic detail David's hard rule
 * forbids ("אסור מסלולים, מפה, נקודות מיקום, או פירוט גיאוגרפי של אימון
 * בודד"). Flagged, not silently patched in the UI — this is the real fix:
 * a server route that never reads `routePath` at all (`.select()` below
 * is an Admin-SDK-only capability; the client SDK this page used has no
 * field-projection equivalent, so "don't fetch it in the first place" was
 * only achievable by moving the read server-side).
 *
 * Response fields are aggregate-safe by construction — type, date,
 * duration only. No routePath, no coordinates, no park/location name.
 *
 * 26.09.2026 — CORRECTED (docs/audit-2026-09/00-MASTER-PLAN.md §13.30):
 * this route originally queried/selected workoutTitle/type/completedAt/
 * durationMinutes — NONE of which exist on any real workouts/{docId}
 * document (confirmed against all 734 real docs in production, read-only,
 * no writes — no field values were ever printed, only field names and
 * presence counts). It had silently returned an empty workouts[] for
 * every real user since it was built; the emulator tests passed because
 * they seeded synthetic docs matching the CODE's assumed field names,
 * never checked against a real document. The canonical field shape for
 * this collection is `WorkoutHistoryEntry` (src/features/workout-engine/
 * core/services/storage.service.ts) — imported below as the single
 * source of truth, not re-guessed here. Real fields used: `date`
 * (Timestamp, not `completedAt`), `duration` (number of SECONDS, not
 * minutes — see that interface's own comment — divided by 60 below),
 * `workoutType` (not `type`; enum 'running'|'walking'|'cycling'|
 * 'strength'|'hybrid'|'recovery'). No real equivalent to `workoutTitle`
 * exists on any real doc — dropped from the response entirely, not
 * defaulted to null.
 *
 * New-query-on-existing-collection rule (David, 26.09.2026, applies from
 * here on — see MASTER-PLAN §13.30): any new query against an EXISTING
 * collection must be verified against a real production document before
 * merge, not just against a self-seeded emulator test. A test that seeds
 * its own data can never catch a field-name mismatch between the code and
 * reality — which is exactly how this bug shipped and passed 42/42 tests.
 *
 * Domain check (David's standing rule, same as every other route in this
 * build): resolved ENTIRELY from the caller's own token via
 * resolveUnitPermissionScope(uid) — the `uid` query param names WHICH
 * member's workouts to look up, never expands what the caller is allowed
 * to see. root — anyone. tenant_owner — only a member whose
 * core.tenantId matches their own. unit_admin — only a member whose
 * core.tenantId/unitId matches one of their own units. Every domain
 * mismatch (member outside the caller's tenant/unit, denied scope
 * entirely) returns the same generic 403 — no existence leak, matching
 * every other route in this build.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { Firestore } from 'firebase-admin/firestore';
import type { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { resolveUnitPermissionScope, type UnitPermissionScope } from '@/lib/unitPermissionScope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DENIED_MESSAGE = 'אין לך הרשאה לצפות בנתוני המשתמש הזה.';

/**
 * Only the fields this screen actually needs, from the canonical
 * WorkoutHistoryEntry shape (imported above, not re-typed here) —
 * workoutType/date/duration. Aggregate-safe by construction:
 * routePath/parkId/parkName/segments/laps/commuteDestination/
 * commuteLabel (all real fields on WorkoutHistoryEntry, all location-
 * identifying in some way — confirmed via the same production field
 * inventory) are simply never named in the .select() allowlist below, so
 * they never cross the wire at all — not filtered client-side, never
 * fetched from Firestore in the first place.
 */
interface WorkoutSummaryEntry {
  id: string;
  workoutType: WorkoutHistoryEntry['workoutType'] | null;
  completedAtMs: number | null;
  durationMinutes: number | null;
}

function isAuthorizedForMember(scope: UnitPermissionScope, memberTenantId: unknown, memberUnitId: unknown): boolean {
  if (scope.kind === 'root') return true;
  if (scope.kind === 'tenantOwner') return memberTenantId === scope.tenantId;
  if (scope.kind === 'unitAdmin') {
    return memberTenantId === scope.tenantId && typeof memberUnitId === 'string' && scope.unitIds.includes(memberUnitId);
  }
  return false;
}

/**
 * Core computation, factored out of the HTTP handler for direct emulator
 * testability — matches the compute*() split used throughout this build.
 */
export async function computeMemberWorkouts(db: Firestore, scope: UnitPermissionScope, targetUid: string) {
  if (scope.kind === 'denied') {
    return { status: 403 as const, body: { error: DENIED_MESSAGE } };
  }
  if (!targetUid) {
    return { status: 403 as const, body: { error: DENIED_MESSAGE } };
  }

  const targetSnap = await db.collection('users').doc(targetUid).get();
  if (!targetSnap.exists) {
    return { status: 403 as const, body: { error: DENIED_MESSAGE } };
  }
  const targetCore = targetSnap.data()?.core ?? {};

  if (!isAuthorizedForMember(scope, targetCore.tenantId, targetCore.unitId)) {
    return { status: 403 as const, body: { error: DENIED_MESSAGE } };
  }

  // .select() — Admin-SDK-only field projection. routePath (and every
  // other location-identifying field on WorkoutHistoryEntry — parkId/
  // parkName/segments/laps/commuteDestination/commuteLabel) is never
  // read off the wire at all, not merely dropped from the response after
  // the fact — this is an allowlist of exactly what's needed, not a
  // denylist of what to exclude.
  const workoutsSnap = await db
    .collection('workouts')
    .where('userId', '==', targetUid)
    .orderBy('date', 'desc')
    .limit(20)
    .select('workoutType', 'date', 'duration')
    .get();

  const workouts: WorkoutSummaryEntry[] = workoutsSnap.docs.map((d) => {
    const data = d.data();
    const date = data.date;
    return {
      id: d.id,
      workoutType: typeof data.workoutType === 'string' ? (data.workoutType as WorkoutHistoryEntry['workoutType']) : null,
      completedAtMs: typeof date?.toMillis === 'function' ? date.toMillis() : null,
      // real field is `duration` in SECONDS (WorkoutHistoryEntry's own
      // comment) — converted here, same /60 the pre-existing activity-
      // history list already applies at storage.service.ts's own
      // read site (matching precedent, not inventing a new convention).
      durationMinutes: typeof data.duration === 'number' ? Math.round(data.duration / 60) : null,
    };
  });

  return { status: 200 as const, body: { workouts } };
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

    const scope = await resolveUnitPermissionScope(uid);
    const db = getAdminDb();
    const targetUid = request.nextUrl.searchParams.get('uid') ?? '';
    const result = await computeMemberWorkouts(db, scope, targetUid);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    console.error('[/api/units/member-workouts] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
