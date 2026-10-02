import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminUid } from '@/lib/api-auth';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { isWeddingOwner } from '@/features/wedding/wedding.config';
import { readWedding, writeWedding } from '@/features/wedding/wedding.server';

/**
 * /api/admin/wedding — the owner's personal wedding planner (one document).
 *
 * Access: a signed-in super admin whose email is in WEDDING_OWNER_EMAILS.
 * Deliberately no AGENT_API_KEY path — the CRM agent and other machine
 * callers never read this data. Other super admins get 403.
 * The same document is also reachable through the share link
 * (/api/public/wedding) when WEDDING_SHARE_TOKEN is set.
 *
 *   GET → { state, rev }            (initial seed state with rev 0 if none saved yet)
 *   PUT { state, rev } → { state, rev }   409 + current { state, rev } when rev is stale
 */

async function requireWeddingOwner(request: NextRequest): Promise<{ uid: string } | NextResponse> {
  const uid = await resolveAdminUid(request);
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userSnap = await getAdminDb().collection('users').doc(uid).get();
  const core = (userSnap.data()?.core ?? {}) as Record<string, unknown>;
  if (core.isSuperAdmin !== true) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const email = (await getAdminAuth().getUser(uid)).email;
  if (!isWeddingOwner(email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  return { uid };
}

export async function GET(request: NextRequest) {
  const owner = await requireWeddingOwner(request);
  if (owner instanceof NextResponse) return owner;
  return NextResponse.json(await readWedding());
}

export async function PUT(request: NextRequest) {
  const owner = await requireWeddingOwner(request);
  if (owner instanceof NextResponse) return owner;

  const body = await request.json().catch(() => null);
  try {
    const result = await writeWedding(body, owner.uid);
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
    if (result.conflict) return NextResponse.json({ error: 'conflict', ...result.doc }, { status: 409 });
    return NextResponse.json(result.doc);
  } catch (err) {
    console.error('[wedding] save failed', err);
    return NextResponse.json({ error: 'save failed' }, { status: 500 });
  }
}
