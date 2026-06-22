/**
 * /api/social/reconcile-group-membership
 *
 * POST — finds every community_groups doc whose createdBy user is missing
 * that groupId in social.groupIds and writes it back via Admin SDK arrayUnion.
 *
 * Root cause being fixed: createGroup's updateSocialGroupIds call sits inside
 * a non-throwing catch block — if the API call failed at creation time the
 * creator's social.groupIds never got the groupId, causing PERMISSION-DENIED
 * on all subsequent group-mode presence reads for that creator.
 *
 * Run once after deploy with:
 *   curl -X POST /api/social/reconcile-group-membership \
 *        -H "Authorization: <AGENT_API_KEY>"
 *
 * Safe to run multiple times — arrayUnion is idempotent.
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
          return;
        }

        await db.doc(`users/${createdBy}`).update({
          'social.groupIds': FieldValue.arrayUnion(groupId),
          updatedAt: FieldValue.serverTimestamp(),
        });
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
