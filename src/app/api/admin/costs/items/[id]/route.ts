/**
 * PATCH /api/admin/costs/items/{id} — edit a manual item, or { active: false } to deactivate
 * it (endDate = today; its past months still count). No hard delete. Super admin only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { getIsraelDateKey } from '@/lib/israelTime';
import { CostItemPatchSchema } from '@/lib/costs/item-schema';
import { patchItem } from '@/lib/costs/costs-store.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ID_RE = /^[A-Za-z0-9]{1,40}$/;

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;

  if (!ID_RE.test(params.id)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const parsed = CostItemPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  try {
    const found = await patchItem(getAdminDb(), params.id, parsed.data, getIsraelDateKey(new Date()));
    if (!found) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[costs] patch item failed', err);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }
}
