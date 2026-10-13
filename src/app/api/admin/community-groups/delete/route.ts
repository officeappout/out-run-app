/**
 * POST /api/admin/community-groups/delete   body: { groupId }
 *
 * Server-side, scoped replacement for the browser-side deleteGroup()
 * (community.service.ts). That client path batched deletes of the group, its
 * chat + messages, members, invite and attendance, and the member mirrors —
 * but firestore.rules only lets ROOT delete chats/messages (the catch-all is
 * isRootAdmin()-only), so for a real authority manager the whole batch was
 * rejected ("שגיאה במחיקת הקבוצה"). This route does the same delete with the
 * Admin SDK, after an explicit scope check.
 *
 * Authorization (all derived server-side; the only client input is groupId):
 *   - root (david@/office@): any group.
 *   - authority / tenant manager (authorities.managerIds): ONLY a group whose
 *     own `authorityId` or `tenantId` equals the caller's authority id,
 *     read from the group document itself.
 *   - everyone else (incl. unit_admin), a group that does not exist, and a
 *     group in another authority: the SAME generic 403 — a caller can never
 *     tell "not yours" from "not real".
 *
 * All-or-nothing (axioms §4): ONE Admin batch containing every delete, the
 * member-mirror cleanup (§17: user_memberships.groupIds AND
 * users.social.groupIds, reverse of joinEngine) and the audit_logs row. A
 * group needing more than 500 ops is REFUSED (409), never split.
 *
 * Audit: audit_logs DELETE / CommunityGroup / <groupId>, written inside the
 * same batch (no delete without a record). Counts only — no member names,
 * uids or message content, in the audit row or in any log line.
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { isRootAdmin } from '@/config/feature-flags';
import { resolveAuthorityManagerScope } from '@/lib/authorityManagerScope';
import { getRequestIp } from '@/lib/requestIp';
import { RATE_LIMITS, isBlockedByAny } from '@/lib/rateLimitConfig';
import { logRateLimitBlock } from '@/lib/rateLimitLog';
import { PERSONA_KEYS } from '@/types/community.types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GROUPS_COLLECTION = 'community_groups';
const DELETE_BATCH_OP_LIMIT = 500;
const GROUP_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const GENERIC_FORBIDDEN = 'אין לך הרשאה למחוק קבוצה זו.';

interface Caller {
  uid: string;
  email: string | null;
}

export type DeleteGroupResult =
  | { status: 200; body: { ok: true; deleted: { members: number; messages: number } } }
  | { status: 400 | 403 | 409; body: { error: string } };

export async function computeDeleteGroup(
  db: Firestore,
  caller: Caller,
  groupIdRaw: unknown,
  sourceIp: string,
): Promise<DeleteGroupResult> {
  const forbidden: DeleteGroupResult = { status: 403, body: { error: GENERIC_FORBIDDEN } };

  if (typeof groupIdRaw !== 'string' || !GROUP_ID_PATTERN.test(groupIdRaw)) {
    return { status: 400, body: { error: 'groupId required' } };
  }
  const groupId = groupIdRaw;
  const root = isRootAdmin(caller.email);

  // ── Scope ────────────────────────────────────────────────────────────────
  const groupRef = db.collection(GROUPS_COLLECTION).doc(groupId);
  if (!root) {
    const scope = await resolveAuthorityManagerScope(db, caller.uid);
    if (!scope) return forbidden;
    const groupSnap = await groupRef.get();
    if (!groupSnap.exists) return forbidden;
    const g = groupSnap.data() as { authorityId?: unknown; tenantId?: unknown } | undefined;
    if (g?.authorityId !== scope.authorityId && g?.tenantId !== scope.authorityId) return forbidden;
  }
  // Root on a group whose main doc is already gone proceeds: the same
  // idempotent cleanup of dangling members/chat/mirrors the client path had.

  // ── Reads (before building the batch) ───────────────────────────────────
  const membersSnap = await groupRef.collection('members').get();
  const memberUids = membersSnap.docs.map((d) => d.id);

  const chatRef = db.collection('chats').doc(`group_${groupId}`);
  const chatSnap = await chatRef.get();
  const messagesSnap = chatSnap.exists ? await chatRef.collection('messages').get() : null;
  const messageDocs = messagesSnap?.docs ?? [];

  const inviteRef = groupRef.collection('private').doc('invite');
  const inviteSnap = await inviteRef.get();

  const attendanceSnap = await groupRef.collection('attendance').get();
  const statusesSnaps = await Promise.all(
    attendanceSnap.docs.map((a) => a.ref.collection('member_statuses').get()),
  );
  const statusDocs = statusesSnaps.flatMap((s) => s.docs);

  // users/{uid}.update() fails (and would abort the whole batch) on a missing
  // doc — look which member user docs exist, one getAll, and mirror only those.
  const userRefs = memberUids.map((uid) => db.collection('users').doc(uid));
  const userSnaps = userRefs.length > 0 ? await db.getAll(...userRefs) : [];
  const existingUserRefs = userSnaps.filter((s) => s.exists).map((s) => s.ref);

  const opCount =
    1 /* group doc */ +
    PERSONA_KEYS.length /* persona-collection copies */ +
    membersSnap.size +
    memberUids.length /* user_memberships */ +
    existingUserRefs.length /* users.social.groupIds */ +
    (chatSnap.exists ? 1 : 0) +
    messageDocs.length +
    (inviteSnap.exists ? 1 : 0) +
    attendanceSnap.size +
    statusDocs.length +
    1 /* audit row */;

  if (opCount > DELETE_BATCH_OP_LIMIT) {
    return {
      status: 409,
      body: { error: `הקבוצה גדולה מדי למחיקה אטומית (${opCount} פעולות, מקסימום ${DELETE_BATCH_OP_LIMIT}). לא נמחק דבר.` },
    };
  }

  // ── One batch ───────────────────────────────────────────────────────────
  const batch = db.batch();
  batch.delete(groupRef);
  for (const persona of PERSONA_KEYS) {
    batch.delete(db.collection(`community_groups_${persona}`).doc(groupId));
  }
  for (const m of membersSnap.docs) batch.delete(m.ref);
  for (const uid of memberUids) {
    batch.set(
      db.collection('user_memberships').doc(uid),
      { groupIds: FieldValue.arrayRemove(groupId), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  }
  for (const ref of existingUserRefs) {
    batch.update(ref, {
      'social.groupIds': FieldValue.arrayRemove(groupId),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  for (const m of messageDocs) batch.delete(m.ref);
  if (chatSnap.exists) batch.delete(chatRef);
  if (inviteSnap.exists) batch.delete(inviteRef);
  for (const s of statusDocs) batch.delete(s.ref);
  for (const a of attendanceSnap.docs) batch.delete(a.ref);

  // Same document shape logAuditAction / the parks routes write. Counts only.
  batch.set(db.collection('audit_logs').doc(), {
    adminId: caller.uid,
    adminName: caller.email || 'Admin',
    actionType: 'DELETE',
    targetEntity: 'CommunityGroup',
    targetId: groupId,
    details: `Deleted community group via /api/admin/community-groups/delete (members=${membersSnap.size}, messages=${messageDocs.length})`,
    oldValue: null,
    newValue: null,
    sourceIp,
    timestamp: new Date(),
  });

  await batch.commit();
  return { status: 200, body: { ok: true, deleted: { members: membersSnap.size, messages: messageDocs.length } } };
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    }

    let uid: string;
    let email: string | null;
    try {
      const decoded = await getAdminAuth().verifyIdToken(idToken, true);
      uid = decoded.uid;
      email = (decoded.email as string | undefined) ?? null;
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    const db = getAdminDb();
    const ip = getRequestIp(request);
    const rl = await isBlockedByAny(db, [
      { key: `community-group-delete:uid:${uid}`, window: RATE_LIMITS.communityGroupDelete.uid() },
    ]);
    if (rl.blocked) {
      logRateLimitBlock({ route: 'community-group-delete', dimension: 'uid', ip, identifier: uid });
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.window?.windowMs ?? 60_000) / 1000)) } },
      );
    }

    let body: { groupId?: unknown } = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const result = await computeDeleteGroup(db, { uid, email }, body?.groupId, ip);
    return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    // No uid / email / groupId / member or message data in the log line.
    console.error('[api/admin/community-groups/delete] failed', err instanceof Error ? err.name : 'unknown');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
