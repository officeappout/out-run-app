/**
 * POST /api/admin/costs/items — add a manual / fixed subscription to admin_cost_items.
 * Super admin only. (The list itself comes with GET /api/admin/costs.)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { CostItemInputSchema } from '@/lib/costs/item-schema';
import { createItem } from '@/lib/costs/costs-store.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;

  const parsed = CostItemInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  try {
    const id = await createItem(getAdminDb(), parsed.data);
    return NextResponse.json({ id });
  } catch (err) {
    console.error('[costs] create item failed', err);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }
}
