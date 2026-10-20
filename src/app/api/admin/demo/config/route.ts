/**
 * PUT /api/admin/demo/config — save the demo caps + the price table
 * (demo_registry/config). Super admin only; strict validation (usage-cost.ts
 * validateConfigInput). Body: { caps: DemoCaps, prices: PriceTable }.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi, resolveAdminUid } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { saveDemoConfig } from '@/lib/demo-control/demo-control.server';
import { validateConfigInput } from '@/lib/demo-control/usage-cost';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;
  const parsed = validateConfigInput(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const uid = (await resolveAdminUid(request)) ?? 'agent';
    await saveDemoConfig(getAdminDb(), uid, parsed.value);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[/api/admin/demo/config] failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }
}
