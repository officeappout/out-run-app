/**
 * POST /api/admin/generation-review/actions — super admin actions on one flagged session:
 *   { action: 'mark_fixed' | 'reopen', logId }       → generation_reviews/{logId}.status
 *   { action: 'fixture', logId, rules? }             → returns a regression fixture JSON for the
 *       admin to download and commit (src/lib/generation-review/__tests__/regressions/). Nothing
 *       is written to the repo from prod; the review is marked 'fixture' so the list shows it.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuperAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { GENERATION_REVIEWS, GENERATION_TYPES, type GenerationType } from '@/lib/generation-review/types';
import { RULE_IDS, type Finding } from '@/lib/generation-review/invariants/types';
import { buildRegressionFixture } from '@/lib/generation-review/review/fixture-export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LogId = z.string().regex(/^g[a-z0-9]{8,40}$/);
const BodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('mark_fixed'), logId: LogId }),
  z.object({ action: z.literal('reopen'), logId: LogId }),
  z.object({ action: z.literal('fixture'), logId: LogId, rules: z.array(z.enum(RULE_IDS)).max(RULE_IDS.length).optional() }),
]);

export async function POST(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const body = parsed.data;
  const ref = getAdminDb().collection(GENERATION_REVIEWS).doc(body.logId);
  try {
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (body.action === 'mark_fixed' || body.action === 'reopen') {
      await ref.update({ status: body.action === 'mark_fixed' ? { value: 'fixed', at: Date.now() } : null });
      return NextResponse.json({ ok: true });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stored review, read through field guards
    const r = snap.data() as Record<string, any>;
    const type = r.type as GenerationType;
    if (!(GENERATION_TYPES as readonly string[]).includes(type) || !r.input || !r.output) {
      return NextResponse.json({ error: 'malformed' }, { status: 422 });
    }
    const fixture = buildRegressionFixture({
      logId: body.logId,
      day: typeof r.day === 'string' ? r.day : '',
      type,
      generator: r.generator ?? null,
      appVersion: r.appVersion ?? null,
      input: r.input,
      output: r.output,
      findings: Array.isArray(r.findings) ? (r.findings as Finding[]) : [],
      reports: Array.isArray(r.reports) ? r.reports : [],
      rules: body.rules,
    });
    await ref.update({ status: { value: 'fixture', at: Date.now(), fixtureId: fixture.id } });
    return NextResponse.json({ ok: true, fixture });
  } catch (err) {
    console.error('[generation-review/actions] failed', err);
    return NextResponse.json({ error: 'action_failed' }, { status: 500 });
  }
}
