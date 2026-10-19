/**
 * POST /api/content/suggestions — "חסר משהו? הצע לנו להוסיף" from a search with no results.
 * Body: { query, category }. Auth: Bearer Firebase ID token (the uid comes from the token only).
 * Open while enable_unified_search is on, and to super admins (who preview the flag).
 * One suggestion per user per query (doc id = uid + hash) — a repeat tap is a no-op.
 * Stored in content_suggestions (server-only; read in /admin/content).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { getServerFeatureFlags } from '@/lib/ai/entitlement.server';
import { addContentSuggestion } from '@/lib/content-items/store.server';
import { stableHash } from '@/lib/content-items/seed-plan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  query: z.string().trim().min(2).max(120),
  category: z.enum(['all', 'exercises', 'parks', 'routes', 'social', 'events', 'articles', 'help']).default('all'),
}).strict();

export async function POST(request: Request) {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return NextResponse.json({ error: 'missing_token' }, { status: 401 });
  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(token, true)).uid;
  } catch {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
  }
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  try {
    const db = getAdminDb();
    const flags = await getServerFeatureFlags(db);
    if (flags.enableUnifiedSearch !== true) {
      const core = ((await db.collection('users').doc(uid).get()).data()?.core ?? {}) as Record<string, unknown>;
      if (core.isSuperAdmin !== true) return NextResponse.json({ error: 'not_enabled' }, { status: 404 });
    }
    const query = parsed.data.query.replace(/\s+/g, ' ');
    const id = `${uid}_${stableHash(query.toLowerCase())}`;
    const res = await addContentSuggestion(db, id, { uid, query, category: parsed.data.category });
    return NextResponse.json({ ok: true, duplicate: res === 'exists' });
  } catch (err) {
    console.error('[content/suggestions] failed', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
