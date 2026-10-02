import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveAdminUid } from '@/lib/api-auth';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import {
  WEDDING_COLLECTION,
  WEDDING_DOC_ID,
  initialWeddingState,
  isWeddingOwner,
} from '@/features/wedding/wedding.config';
import { parseWeddingState } from '@/features/wedding/wedding.schema';
import type { WeddingDocument } from '@/features/wedding/wedding.types';

/**
 * /api/admin/wedding — the owner's personal wedding planner (one document).
 *
 * Access: a signed-in super admin whose email is in WEDDING_OWNER_EMAILS.
 * Deliberately no AGENT_API_KEY path — the CRM agent and other machine
 * callers never read this data. Other super admins get 403.
 *
 * Storage: wedding_planner/main via the Admin SDK only. No firestore.rules
 * change: the client never touches the collection directly.
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

function docRef() {
  return getAdminDb().collection(WEDDING_COLLECTION).doc(WEDDING_DOC_ID);
}

function readStored(data: Record<string, unknown> | undefined): WeddingDocument {
  if (!data) return { state: initialWeddingState(), rev: 0 };
  const rev = Number(data.rev);
  return { state: parseWeddingState(data.state), rev: Number.isFinite(rev) ? rev : 0 };
}

export async function GET(request: NextRequest) {
  const owner = await requireWeddingOwner(request);
  if (owner instanceof NextResponse) return owner;

  const snap = await docRef().get();
  return NextResponse.json(readStored(snap.exists ? snap.data() : undefined));
}

export async function PUT(request: NextRequest) {
  const owner = await requireWeddingOwner(request);
  if (owner instanceof NextResponse) return owner;

  const body = (await request.json().catch(() => null)) as { state?: unknown; rev?: unknown } | null;
  if (!body || typeof body !== 'object' || body.state === undefined) {
    return NextResponse.json({ error: 'state is required' }, { status: 400 });
  }
  const baseRev = Number(body.rev);
  if (!Number.isInteger(baseRev) || baseRev < 0) {
    return NextResponse.json({ error: 'rev must be a non-negative integer' }, { status: 400 });
  }
  const state = parseWeddingState(body.state);

  try {
    const result = await getAdminDb().runTransaction(async (tx) => {
      const ref = docRef();
      const snap = await tx.get(ref);
      const current = readStored(snap.exists ? snap.data() : undefined);
      if (current.rev !== baseRev) return { conflict: true as const, doc: current };
      const next: WeddingDocument = { state, rev: current.rev + 1 };
      tx.set(ref, { ...next, updatedAt: FieldValue.serverTimestamp(), updatedBy: owner.uid });
      return { conflict: false as const, doc: next };
    });
    if (result.conflict) return NextResponse.json({ error: 'conflict', ...result.doc }, { status: 409 });
    return NextResponse.json(result.doc);
  } catch (err) {
    console.error('[wedding] save failed', err);
    return NextResponse.json({ error: 'save failed' }, { status: 500 });
  }
}
