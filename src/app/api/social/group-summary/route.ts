/**
 * GET /api/social/group-summary?groupId=&attendanceId=
 *
 * The post-workout "together" aggregate (enable_group_fixes_v1). firestore.rules
 * deny reading other users' workouts, so the client-side sibling query always
 * came back empty; this reads them with the Admin SDK and returns ONLY the
 * aggregate (buildGroupSummary) — per participant: name, photo, km, pace.
 *
 * Auth: Bearer ID token. Caller must be an attendee of the session or a member
 * of the group. Flag: the real value or the caller's own super-admin bit;
 * off → 404 (the client never calls it then).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { groupFixesOn } from '@/lib/group-fixes/flag.server';
import { buildGroupSummary, canReadGroupSummary } from '@/lib/group-fixes/group-summary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_WORKOUTS = 100;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization') ?? '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!idToken) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });

  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(idToken)).uid;
  } catch {
    return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
  }

  const groupId = request.nextUrl.searchParams.get('groupId') ?? '';
  const attendanceId = request.nextUrl.searchParams.get('attendanceId') ?? '';
  if (!ID_RE.test(groupId) || !ID_RE.test(attendanceId)) {
    return NextResponse.json({ error: 'groupId and attendanceId required' }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    const userSnap = await db.doc(`users/${uid}`).get();
    if (!(await groupFixesOn(db, userSnap.data()))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const [attendanceSnap, groupSnap, memberSnap] = await Promise.all([
      db.doc(`community_groups/${groupId}/attendance/${attendanceId}`).get(),
      db.doc(`community_groups/${groupId}`).get(),
      db.doc(`community_groups/${groupId}/members/${uid}`).get(),
    ]);
    if (!attendanceSnap.exists || !groupSnap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const attendance = attendanceSnap.data() ?? {};
    if (!canReadGroupSummary({ uid, attendees: attendance.attendees, isMember: memberSnap.exists })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const workoutsSnap = await db
      .collection('workouts')
      .where('groupId', '==', groupId)
      .where('attendanceId', '==', attendanceId)
      .limit(MAX_WORKOUTS)
      .get();
    const workouts = workoutsSnap.docs.map((d) => {
      const w = d.data();
      return { userId: w.userId, distance: w.distance, pace: w.pace };
    });

    const groupName = typeof groupSnap.data()?.name === 'string' ? (groupSnap.data()?.name as string) : '';
    return NextResponse.json({ ctx: buildGroupSummary({ groupName, attendance, workouts, currentUid: uid }) });
  } catch (err) {
    console.error('[group-summary] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
