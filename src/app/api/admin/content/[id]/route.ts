/**
 * /api/admin/content/{id} — one site_content doc. Super admin only.
 *   GET    → the item (drafts included)
 *   PUT    → create / replace from the editor (validated; updatedBy = the admin, so the seed
 *            never overwrites it again)
 *   PATCH  → { status: 'draft' | 'published' } (publish / unpublish)
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuperAdminApi, resolveAdminUid } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { ContentIdSchema, ContentInputSchema } from '@/lib/content-items/schema';
import { getContentItem, saveContentItem, setContentStatus } from '@/lib/content-items/store.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

const StatusSchema = z.object({ status: z.enum(['draft', 'published']) }).strict();

async function actor(request: NextRequest): Promise<string> {
  return (await resolveAdminUid(request)) ?? 'agent-key';
}

export async function GET(request: NextRequest, { params }: Ctx) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;
  if (!ContentIdSchema.safeParse(params.id).success) return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  try {
    const item = await getContentItem(getAdminDb(), params.id);
    return item ? NextResponse.json({ item }) : NextResponse.json({ error: 'not_found' }, { status: 404 });
  } catch (err) {
    console.error('[admin/content] get failed', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;
  if (!ContentIdSchema.safeParse(params.id).success) return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  const parsed = ContentInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request', issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  try {
    await saveContentItem(getAdminDb(), params.id, parsed.data, await actor(request));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[admin/content] save failed', err);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;
  if (!ContentIdSchema.safeParse(params.id).success) return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  const parsed = StatusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  try {
    const ok = await setContentStatus(getAdminDb(), params.id, parsed.data.status, await actor(request));
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'not_found' }, { status: 404 });
  } catch (err) {
    console.error('[admin/content] status failed', err);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }
}
