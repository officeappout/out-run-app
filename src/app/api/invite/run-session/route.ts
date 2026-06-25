/**
 * POST /api/invite/run-session
 *
 * Creates an ephemeral run group and a time-limited invitation token so a user
 * can invite a friend to join their live run/walk session.
 *
 * Two modes:
 *   1. Fresh invite  — no existing session → creates community_groups (type:'ephemeral'),
 *                      attendance doc, and does the axiom-§17 triple-write for the host.
 *   2. Re-invite     — host already has a live group session → skips group creation,
 *                      verifies membership, and issues a new token for the same session.
 *
 * Auth: Firebase ID token in Authorization: Bearer <token>  (user-facing route)
 * Body: { activityType: 'running' | 'walking', existingGroupId?: string, existingAttendanceId?: string }
 * Returns: { token, shareUrl, groupId, attendanceId }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Constants ──────────────────────────────────────────────────────────────────

const TOKEN_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity
const EXPIRY_MS   = 2 * 60 * 60 * 1000; // 2 hours, matches existing session invites
const WEB_BASE    = 'https://outrun.co.il';

// ── Helpers ────────────────────────────────────────────────────────────────────

function generateToken(): string {
  let token = 'si_';
  for (let i = 0; i < 6; i++) {
    token += TOKEN_CHARS[crypto.randomInt(TOKEN_CHARS.length)];
  }
  return token;
}

/** Returns "YYYY-MM-DD_HH-mm" from the current moment (attendanceId format). */
function nowAttendanceId(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
}

// ── Handler ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get('Authorization') ?? '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!idToken) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });

  let uid: string;
  let displayName: string;
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken, true);
    uid          = decoded.uid;
    displayName  = decoded.name ?? 'משתמש';
  } catch {
    return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
  }

  // ── Body ────────────────────────────────────────────────────────────────────
  let body: { activityType?: string; existingGroupId?: string; existingAttendanceId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { activityType, existingGroupId, existingAttendanceId } = body;
  if (activityType !== 'running' && activityType !== 'walking') {
    return NextResponse.json({ error: 'activityType must be running or walking' }, { status: 400 });
  }

  const db = getAdminDb();
  let groupId: string;
  let attendanceId: string;

  if (existingGroupId && existingAttendanceId) {
    // ── Re-invite: reuse existing live session ──────────────────────────────
    const memberSnap = await db
      .doc(`community_groups/${existingGroupId}/members/${uid}`)
      .get();
    if (!memberSnap.exists) {
      return NextResponse.json({ error: 'not-a-member' }, { status: 403 });
    }
    groupId      = existingGroupId;
    attendanceId = existingAttendanceId;
  } else {
    // ── Fresh invite: create ephemeral group ────────────────────────────────
    groupId      = db.collection('community_groups').doc().id;
    attendanceId = nowAttendanceId();

    const [datePart, timePart] = attendanceId.split('_');
    const timeForDisplay = (timePart ?? '').replace('-', ':');

    const batch = db.batch();

    // Group doc — type:'ephemeral' prevents this from appearing in any group
    // discovery or management list (consumers must filter type !== 'ephemeral').
    batch.set(db.doc(`community_groups/${groupId}`), {
      id:                  groupId,
      name:                `ריצה עם ${displayName}`,
      description:         '',
      category:            activityType,
      authorityId:         '',
      type:                'ephemeral',
      createdBy:           uid,
      memberCount:         1,
      currentParticipants: 1,
      isActive:            true,
      isPublic:            false,
      createdAt:           FieldValue.serverTimestamp(),
      updatedAt:           FieldValue.serverTimestamp(),
    });

    // Host membership record
    batch.set(db.doc(`community_groups/${groupId}/members/${uid}`), {
      uid,
      name:     displayName,
      role:     'admin',
      joinedAt: Timestamp.now(), // Timestamp.now() required inside subcollection (axiom §5)
    });

    // Attendance doc — session is live immediately (sessionPhase:'active')
    batch.set(
      db.doc(`community_groups/${groupId}/attendance/${attendanceId}`),
      {
        groupId,
        date:             datePart ?? '',
        time:             timeForDisplay,
        attendees:        [uid],
        attendeeProfiles: { [uid]: { name: displayName } },
        currentCount:     1,
        sessionPhase:     'active',
      },
    );

    // axiom §17 — dual-write: user_memberships (presence gate) + users.social.groupIds
    batch.set(
      db.doc(`user_memberships/${uid}`),
      { groupIds: FieldValue.arrayUnion(groupId), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    batch.set(
      db.doc(`users/${uid}`),
      { social: { groupIds: FieldValue.arrayUnion(groupId) }, updatedAt: FieldValue.serverTimestamp() },
      { mergeFields: ['social.groupIds', 'updatedAt'] },
    );

    await batch.commit();
  }

  // ── Invitation token ────────────────────────────────────────────────────────
  // Reuses the group_invitations collection and si_ prefix so the existing
  // /api/join/session-token route and joinEngine handle the joiner without changes.
  const token     = generateToken();
  const expiresAt = Timestamp.fromMillis(Date.now() + EXPIRY_MS);
  const [datePart, timePart] = attendanceId.split('_');

  await db.doc(`group_invitations/${token}`).set({
    token,
    groupId,
    attendanceId,
    hostUid:     uid,
    source:      'run-invite',   // Phase C: landing page uses this to route to /map
    activityType,
    groupName:   `ריצה עם ${displayName}`,
    sessionDate: datePart ?? '',
    sessionTime: (timePart ?? '').replace('-', ':'),
    createdAt:   FieldValue.serverTimestamp(),
    expiresAt,
    useCount:    0,
  });

  return NextResponse.json({
    token,
    shareUrl:    `${WEB_BASE}/session/${token}`,
    groupId,
    attendanceId,
  });
}
