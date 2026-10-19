/**
 * PUT /api/admin/costs/fx — set the month's FX rates by hand ({ month, USD, EUR }), or clear
 * them ({ month, clear: true }) so the daily refresh fetches the ECB rate again. Super admin only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuperAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { isMonthKey } from '@/lib/costs/month';
import { isSaneRate } from '@/lib/costs/fx';
import { setMonthFx } from '@/lib/costs/costs-store.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.union([
  z.object({ month: z.string(), USD: z.number(), EUR: z.number() }).strict(),
  z.object({ month: z.string(), clear: z.literal(true) }).strict(),
]);

export async function PUT(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isMonthKey(parsed.data.month)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const body = parsed.data;
  if ('USD' in body && (!isSaneRate(body.USD) || !isSaneRate(body.EUR))) {
    return NextResponse.json({ error: 'bad_rate' }, { status: 400 });
  }

  try {
    await setMonthFx(getAdminDb(), body.month, 'USD' in body ? { USD: body.USD, EUR: body.EUR } : null, Date.now());
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[costs] set fx failed', err);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }
}
