/**
 * /api/admin/content/suggestions — what users asked to add from a search with no results.
 * Super admin only. GET → newest 200 · PATCH { id, handled } → mark handled / new.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuperAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { listContentSuggestions, markSuggestionHandled } from '@/lib/content-items/store.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchSchema = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/), handled: z.boolean() }).strict();

export async function GET(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ suggestions: await listContentSuggestions(getAdminDb()) });
  } catch (err) {
    console.error('[admin/content/suggestions] list failed', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;
  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  try {
    await markSuggestionHandled(getAdminDb(), parsed.data.id, parsed.data.handled);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[admin/content/suggestions] patch failed', err);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }
}
