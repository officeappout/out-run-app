/**
 * POST /api/social/promote-waitlist — server-side waitlist auto-promotion
 * for community_groups/{groupId}/attendance/{date_time}.
 *
 * cancelBooking (booking.service.ts) used to do this promotion itself, in a
 * second client-SDK updateDoc that moved a DIFFERENT uid (the next person
 * in line) from waitlist into attendees — a write firestore.rules' new
 * self-toggle attendance contract (10.10.2026, write-layer-2 fix) correctly
 * denies, since no non-admin member may touch a uid other than their own in
 * a single write. Moved here, Admin SDK, same "cross-ownership write →
 * server route" shape as /api/join/* and /api/social/group-membership.
 *
 * Authentication: Firebase ID token in Authorization: Bearer <token>.
 * Caller must be a real member of groupId (membership doc existence) —
 * same member-check shape as group-membership/route.ts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { SessionAttendance } from '@/types/community.types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function attendanceDocId(date: string, time: string): string {
  return `${date}_${time.replace(':', '-')}`;
}

/**
 * Pops the FRONT of the waitlist (FIFO — waitlist[0], never an arbitrary
 * entry) into attendees, but ONLY when there is actually room: skips the
 * promotion (no-op) when maxParticipants is set and currentCount is
 * already at or above it. 11.10.2026 — added on review: the OLD client
 * code this replaces (cancelBooking's second updateDoc) popped the front
 * of the waitlist unconditionally whenever it was non-empty, with no
 * capacity check at all; moving the write server-side was a deliberate
 * moment to also close that pre-existing gap, not just relocate the old
 * behavior verbatim. maxParticipants == null means uncapped — always
 * promote in that case. Transactional so two concurrent calls for the
 * same session can never promote the same waitlisted uid twice, and so
 * the capacity check is read-and-written atomically (no race between
 * "checked count" and "wrote count").
 *
 * db is injected (never calls getAdminDb() itself) so this can be exercised
 * directly against a real Firestore emulator in tests, same DI shape as
 * computeCreateUnit (/api/units/create).
 */
export async function computePromoteWaitlist(
  db: Firestore,
  params: { groupId: string; date: string; time: string },
): Promise<
  | { status: 200; body: { promoted: string | null } }
  | { status: 404; body: { error: string } }
> {
  const { groupId, date, time } = params;
  const ref = db
    .collection('community_groups')
    .doc(groupId)
    .collection('attendance')
    .doc(attendanceDocId(date, time));

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      return { status: 404 as const, body: { error: 'session-not-found' } };
    }

    const data = snap.data() as SessionAttendance;
    const waitlist = data.waitlist ?? [];
    if (waitlist.length === 0) {
      return { status: 200 as const, body: { promoted: null } };
    }

    const currentCount = data.currentCount ?? 0;
    const hasRoom = data.maxParticipants == null || currentCount < data.maxParticipants;
    if (!hasRoom) {
      return { status: 200 as const, body: { promoted: null } };
    }

    const promoted = waitlist[0];
    const promotedProfile = data.waitlistProfiles?.[promoted] ?? { name: 'User', photoURL: null };

    tx.update(ref, {
      waitlist: FieldValue.arrayRemove(promoted),
      [`waitlistProfiles.${promoted}`]: null,
      attendees: FieldValue.arrayUnion(promoted),
      currentCount: FieldValue.increment(1),
      [`attendeeProfiles.${promoted}`]: promotedProfile,
    });

    return { status: 200 as const, body: { promoted } };
  });
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    }

    let uid: string;
    try {
      const decoded = await getAdminAuth().verifyIdToken(idToken, true);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    const body = await request.json();
    const { groupId, date, time } = body as { groupId?: string; date?: string; time?: string };
    if (!groupId || !date || !time) {
      return NextResponse.json({ error: 'groupId, date, and time are required' }, { status: 400 });
    }

    const db = getAdminDb();

    const memberSnap = await db.doc(`community_groups/${groupId}/members/${uid}`).get();
    if (!memberSnap.exists) {
      return NextResponse.json({ error: 'not-a-member' }, { status: 403 });
    }

    const result = await computePromoteWaitlist(db, { groupId, date, time });
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    console.error('[/api/social/promote-waitlist] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
