/**
 * /api/social/reconcile-group-membership
 *
 * POST — finds every community_groups doc whose createdBy user is missing
 * that groupId in social.groupIds and writes it back via Admin SDK arrayUnion.
 * Also backfills user_memberships/{uid} for all affected creators so the
 * lean membership document (read by Firestore Rules) stays in sync.
 *
 * Root cause fixed: createGroup's updateSocialGroupIds call sat inside a
 * non-throwing catch, silently missing the groupId.  Additionally, the
 * Firestore Rules get(users/{uid}) hits a 1 MiB doc-size limit on large
 * profiles (running.schedule×36 + progression), returning null silently →
 * PERMISSION-DENIED even when social.groupIds is correct.
 *
 * Auth: x-agent-key header (AGENT_API_KEY env var).
 * Run once after deploy:
 *   curl -X POST /api/social/reconcile-group-membership \
 *        -H "x-agent-key: $AGENT_API_KEY"
 *
 * Safe to run multiple times — arrayUnion + set+merge are idempotent.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  try {
    const db = getAdminDb();
    const groupsSnap = await db.collection('community_groups').get();

    const fixed: Array<{ groupId: string; createdBy: string }> = [];
    let alreadyCorrect = 0;

    await Promise.all(
      groupsSnap.docs.map(async (groupDoc) => {
        const groupId = groupDoc.id;
        const { createdBy } = groupDoc.data() as { createdBy?: string };
        if (!createdBy) return;

        const userSnap = await db.doc(`users/${createdBy}`).get();
        if (!userSnap.exists) return;

        const storedGroupIds: string[] =
          userSnap.data()?.social?.groupIds ?? [];

        if (storedGroupIds.includes(groupId)) {
          alreadyCorrect++;
          // Still ensure user_memberships exists even if users doc is correct.
          await db.doc(`user_memberships/${createdBy}`).set(
            { groupIds: storedGroupIds, updatedAt: FieldValue.serverTimestamp() },
            { merge: true },
          );
          return;
        }

        // Fix users.social.groupIds and user_memberships atomically.
        const batch = db.batch();
        batch.update(db.doc(`users/${createdBy}`), {
          'social.groupIds': FieldValue.arrayUnion(groupId),
          updatedAt: FieldValue.serverTimestamp(),
        });
        const newGroupIds = [...storedGroupIds, groupId];
        batch.set(
          db.doc(`user_memberships/${createdBy}`),
          { groupIds: newGroupIds, updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        );
        await batch.commit();
        fixed.push({ groupId, createdBy });
      }),
    );

    return NextResponse.json({
      ok: true,
      fixed,
      alreadyCorrect,
      total: groupsSnap.docs.length,
    });
  } catch (err: any) {
    console.error('[/api/social/reconcile-group-membership] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
