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
import { addScheduleEntryAdmin } from '@/lib/addScheduleEntryAdmin';
import { APP_URL } from '@/lib/config/domain-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Constants ──────────────────────────────────────────────────────────────────

const TOKEN_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity
const EXPIRY_MS   = 2 * 60 * 60 * 1000; // 2 hours, matches existing session invites
const WEB_BASE    = APP_URL;

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

/**
 * Parse a "YYYY-MM-DDTHH:mm" scheduledFor string (user local time, no TZ suffix).
 * Returns the attendanceId, the date/time parts, and an expiresAt Timestamp
 * that is scheduledFor + EXPIRY_MS (so the invite is valid until 2h after the run).
 *
 * Timezone note: the server is UTC, so we parse the string components directly
 * instead of relying on new Date() which would misinterpret the local time.
 */
function parseScheduledFor(scheduledFor: string): {
  attendanceId: string;
  datePart: string;
  timePart: string;    // 'HH:MM'
  expiresAt: Timestamp;
} {
  const tIdx = scheduledFor.indexOf('T');
  const datePart = tIdx >= 0 ? scheduledFor.slice(0, tIdx) : scheduledFor;
  const timeFull = tIdx >= 0 ? scheduledFor.slice(tIdx + 1) : '00:00';
  const timePart = timeFull.slice(0, 5); // 'HH:mm'
  const [hStr = '0', mStr = '0'] = timePart.split(':');
  const [yStr = '1970', moStr = '1', dStr = '1'] = datePart.split('-');

  // Use Date.UTC to build an approximate ms value (treat parsed local time as UTC).
  // For token validity this ±3h offset is acceptable.
  const approxMs = Date.UTC(
    Number(yStr), Number(moStr) - 1, Number(dStr),
    Number(hStr), Number(mStr),
  );
  const expiresAt = Timestamp.fromMillis(approxMs + EXPIRY_MS);
  const attendanceId = `${datePart}_${hStr.padStart(2, '0')}-${mStr.padStart(2, '0')}`;

  return { attendanceId, datePart, timePart, expiresAt };
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
  let body: {
    activityType?: string;
    existingGroupId?: string;
    existingAttendanceId?: string;
    /** ISO local datetime for a scheduled future run: 'YYYY-MM-DDTHH:mm'. Omit for immediate ("now"). */
    scheduledFor?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { activityType, existingGroupId, existingAttendanceId, scheduledFor } = body;
  if (activityType !== 'running' && activityType !== 'walking') {
    return NextResponse.json({ error: 'activityType must be running or walking' }, { status: 400 });
  }

  const activityLabel = activityType === 'walking' ? 'הליכה' : 'ריצה';
  const sessionTitle = `${activityLabel} מתוזמנת`;
  const sessionCategories: string[] = activityType === 'walking' ? ['walking'] : ['cardio'];

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
    attendanceId = scheduledFor ? parseScheduledFor(scheduledFor).attendanceId : nowAttendanceId();

    const [datePart, timePart] = attendanceId.split('_');
    const timeForDisplay = (timePart ?? '').replace('-', ':');

    const batch = db.batch();

    // Group doc — type:'ephemeral' prevents this from appearing in any group
    // discovery or management list (consumers must filter type !== 'ephemeral').
    batch.set(db.doc(`community_groups/${groupId}`), {
      id:                  groupId,
      name:                sessionTitle,
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

    // Attendance doc — no sessionPhase set; computePhase returns 'lobby' for
    // a current-time attendanceId until the host calls setSessionPhase('active').
    batch.set(
      db.doc(`community_groups/${groupId}/attendance/${attendanceId}`),
      {
        groupId,
        date:             datePart ?? '',
        time:             timeForDisplay,
        attendees:        [uid],
        attendeeProfiles: { [uid]: { name: displayName } },
        currentCount:     1,
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
  const token = generateToken();
  const parsed = scheduledFor ? parseScheduledFor(scheduledFor) : null;
  const expiresAt = parsed?.expiresAt ?? Timestamp.fromMillis(Date.now() + EXPIRY_MS);
  const [datePart, timePart] = attendanceId.split('_');

  const inviteDoc: Record<string, unknown> = {
    token,
    groupId,
    attendanceId,
    hostUid:     uid,
    source:      'run-invite',   // Phase C: landing page uses this to route to /map
    activityType,
    groupName:   scheduledFor ? sessionTitle : `${activityLabel} עם ${displayName}`,
    sessionDate: datePart ?? '',
    sessionTime: (timePart ?? '').replace('-', ':'),
    createdAt:   FieldValue.serverTimestamp(),
    expiresAt,
    useCount:    0,
  };
  if (scheduledFor) inviteDoc['scheduledFor'] = scheduledFor;

  await db.doc(`group_invitations/${token}`).set(inviteDoc);

  // ── Host schedule entry (scheduled runs only) ───────────────────────────────
  // For "now" invites the host is already in an active session — no need to add
  // a calendar entry. For "later" invites, add a community entry so the scheduled
  // run appears in the home screen ("האימון הבא") and weekly/monthly calendar.
  //
  // Cleanup: if the host cancels, call removeCommunityEntriesForGroup(uid, datePart, groupId).
  if (scheduledFor && parsed && datePart) {
    try {
      await addScheduleEntryAdmin(db, uid, datePart, {
        entryId:             `run_${groupId}`,
        programIds:          [],
        type:                'training',
        source:              'community',
        completed:           false,
        scheduledCategories: sessionCategories,
        startTime:           parsed.timePart,
        groupId,
        groupName:           sessionTitle,
        isSoloScheduled:     true,
      });
    } catch (err) {
      console.error('[run-session] host schedule entry FAILED — non-fatal:', err);
      // Non-fatal: the invite and group are already created; calendar is best-effort.
    }
  }

  return NextResponse.json({
    token,
    shareUrl:    `${WEB_BASE}/session/${token}`,
    groupId,
    attendanceId,
  });
}
