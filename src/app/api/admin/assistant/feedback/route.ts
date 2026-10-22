/**
 * POST /api/admin/assistant/feedback — 👍/👎 on one of the caller's OWN answers.
 * Body: { auditId: string, rating: 'up' | 'down' }.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireAdminAiCaller } from '@/lib/ai/admin-assistant/gate.server';
import { rateAdminAudit } from '@/lib/ai/admin-assistant/audit.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ auditId: z.string().regex(/^[A-Za-z0-9]{10,40}$/), rating: z.enum(['up', 'down']) }).strict();

export async function POST(request: NextRequest) {
  const caller = await requireAdminAiCaller(request);
  if (caller instanceof NextResponse) return caller;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  try {
    const ok = await rateAdminAudit(getAdminDb(), caller.uid, parsed.data.auditId, parsed.data.rating);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'not_found' }, { status: 404 });
  } catch (err) {
    console.error('[admin-ai] feedback failed', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 500 });
  }
}
