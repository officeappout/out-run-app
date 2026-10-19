/**
 * /api/admin/ai-coach/proactive — Kelly phase 3 panel (super admin or root admin, a person).
 *
 *   GET                                   → { stats: last 14 days of proactive sends by trigger }
 *   POST { action: 'preview', uid?, email? } → what Kelly would send that user today and why
 *                                            (read-only; nothing is written or pushed)
 *   POST { action: 'test_send', trigger? } → ONE test message (+ push) to the CALLER's own
 *                                            uid only; never to anyone else
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireKellyTeamAdmin } from '@/lib/api-auth';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { getServerFeatureFlags } from '@/lib/ai/entitlement.server';
import { previewProactive, proactiveStats, testSendProactive } from '@/lib/ai/coach/proactive/preview.server';
import { TRIGGER_PRIORITY } from '@/lib/ai/coach/proactive/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('preview'), uid: z.string().min(1).max(128).optional(), email: z.string().email().max(200).optional() }),
  z.object({ action: z.literal('test_send'), trigger: z.enum(TRIGGER_PRIORITY as unknown as [string, ...string[]]).nullable().optional() }),
]);

export async function GET(request: NextRequest) {
  const gate = await requireKellyTeamAdmin(request);
  if (gate instanceof NextResponse) return gate;
  try {
    return NextResponse.json({ stats: await proactiveStats(getAdminDb()) });
  } catch (err) {
    console.error('[admin/kelly-proactive] stats failed', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireKellyTeamAdmin(request);
  if (gate instanceof NextResponse) return gate;
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  try {
    const db = getAdminDb();
    const flags = await getServerFeatureFlags(db);
    if (parsed.data.action === 'preview') {
      let uid = parsed.data.uid ?? null;
      if (!uid && parsed.data.email) uid = await getAdminAuth().getUserByEmail(parsed.data.email).then((u) => u.uid).catch(() => null);
      if (!uid) return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
      return NextResponse.json({ flagOn: flags.aiCoachProactive === true && flags.kellyUnifiedV1 === true, preview: await previewProactive(db, uid, flags) });
    }
    if (flags.aiCoachProactive !== true || flags.kellyUnifiedV1 !== true) return NextResponse.json({ error: 'not_enabled' }, { status: 404 });
    const trigger = (parsed.data.trigger ?? null) as (typeof TRIGGER_PRIORITY)[number] | null;
    // Always the caller's own uid: a test send can never reach another user.
    return NextResponse.json(await testSendProactive(db, gate.uid, flags, trigger));
  } catch (err) {
    console.error('[admin/kelly-proactive] failed', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
