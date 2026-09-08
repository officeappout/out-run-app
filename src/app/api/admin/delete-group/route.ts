/**
 * POST /api/admin/delete-group
 *
 * The ONE canonical, Admin-SDK implementation of the group delete
 * contract for server-side/automated callers (Cloud Functions, scripts)
 * that cannot use the client-SDK deleteGroup() in
 * src/features/admin/services/community.service.ts (that function is
 * for the browser admin panel; Cloud Functions run on the Admin SDK and
 * can't import client-SDK code, or the Next.js app's src/ tree at all —
 * functions/tsconfig.json scopes compilation to functions/src only).
 *
 * Exists specifically so cleanupEphemeralDocs.ts's automated sweep has
 * NO deletion logic of its own (David, 08.09.2026: "she goes through the
 * delete contract. Always. No separate deletion path.") — it calls this
 * route instead of writing to Firestore directly.
 *
 * Implements the exact same steps as deleteGroup(), Admin-SDK-native:
 * main doc, persona-collection copies, members subcollection,
 * chats/group_{id} + its messages, attendance + member_statuses, and
 * arrayRemove(groupId) from every member's users/{uid}.social.groupIds
 * (via update() — set()/merge treats a dotted key as a literal field
 * name, not a nested path, confirmed 08.09.2026) + user_memberships/{uid}.
 * Refuses (400) rather than split into non-atomic batches past the
 * 500-op limit, same as the client-SDK version.
 *
 * Body: { groupId: string, requireType?: string }
 *   requireType, if given, must match the doc's `type` field or the
 *   route refuses (404-shaped skip response) without deleting anything —
 *   the caller's own explicit safety check, not just trusting its query.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const GROUPS_COLLECTION = 'community_groups';
const PERSONA_KEYS = ['reserve'] as const;
const DELETE_BATCH_OP_LIMIT = 500;

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  let body: { groupId?: string; requireType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { groupId, requireType } = body;
  if (!groupId) {
    return NextResponse.json({ error: 'groupId is required' }, { status: 400 });
  }

  const db = getAdminDb();
  const groupRef = db.doc(`${GROUPS_COLLECTION}/${groupId}`);

  try {
    const groupSnap = await groupRef.get();
    if (groupSnap.exists && requireType && groupSnap.data()?.type !== requireType) {
      return NextResponse.json(
        { ok: false, skipped: true, reason: `type is "${groupSnap.data()?.type}", not "${requireType}"` },
        { status: 200 },
      );
    }

    const membersSnap = await groupRef.collection('members').get();
    const memberUids = membersSnap.docs.map((d) => d.id);

    const chatId = `group_${groupId}`;
    const chatRef = db.doc(`chats/${chatId}`);
    const chatSnap = await chatRef.get();
    const messagesSnap = chatSnap.exists ? await chatRef.collection('messages').get() : null;

    const attendanceSnap = await groupRef.collection('attendance').get();
    const memberStatusesSnaps = await Promise.all(
      attendanceSnap.docs.map((a) => a.ref.collection('member_statuses').get()),
    );
    const memberStatusesCount = memberStatusesSnaps.reduce((sum, s) => sum + s.size, 0);

    const opCount =
      1 + PERSONA_KEYS.length +
      membersSnap.size +
      memberUids.length * 2 +
      (chatSnap.exists ? 1 : 0) +
      (messagesSnap?.size ?? 0) +
      attendanceSnap.size +
      memberStatusesCount;

    if (opCount > DELETE_BATCH_OP_LIMIT) {
      return NextResponse.json(
        {
          ok: false,
          error: `needs ${opCount} write ops (limit ${DELETE_BATCH_OP_LIMIT}) — refusing to split into non-atomic batches`,
          members: memberUids.length, messages: messagesSnap?.size ?? 0, attendance: attendanceSnap.size, memberStatuses: memberStatusesCount,
        },
        { status: 400 },
      );
    }

    const batch = db.batch();
    batch.delete(groupRef);
    for (const persona of PERSONA_KEYS) {
      batch.delete(db.doc(`community_groups_${persona}/${groupId}`));
    }
    membersSnap.docs.forEach((d) => batch.delete(d.ref));
    for (const uid of memberUids) {
      batch.set(
        db.doc(`user_memberships/${uid}`),
        { groupIds: FieldValue.arrayRemove(groupId), updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      batch.update(db.doc(`users/${uid}`), {
        'social.groupIds': FieldValue.arrayRemove(groupId),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    if (messagesSnap) messagesSnap.docs.forEach((d) => batch.delete(d.ref));
    if (chatSnap.exists) batch.delete(chatRef);
    memberStatusesSnaps.forEach((s) => s.docs.forEach((d) => batch.delete(d.ref)));
    attendanceSnap.docs.forEach((d) => batch.delete(d.ref));

    await batch.commit();

    return NextResponse.json({
      ok: true,
      groupId,
      deleted: {
        members: memberUids.length,
        chat: chatSnap.exists,
        messages: messagesSnap?.size ?? 0,
        attendance: attendanceSnap.size,
        memberStatuses: memberStatusesCount,
      },
    });
  } catch (error: any) {
    console.error('[delete-group] FAILED for', groupId, ':', error);
    return NextResponse.json({ ok: false, error: error?.message ?? 'Unknown error' }, { status: 500 });
  }
}
