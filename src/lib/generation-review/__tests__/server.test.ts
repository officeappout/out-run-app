/**
 * Generation review — server side against an in-memory Admin SDK fake: the user routes
 * (auth, strict schema, flag / super admin / sample gate, ownership), the admin run route auth,
 * and the nightly run over the owner's fixtures (reviews, stats, re-review, LLM pass + cap).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const st = vi.hoisted(() => ({
  flags: { enableGenerationReview: true, enableGenerationReviewLlm: false } as Record<string, boolean>,
  tokens: { 'tok-u1': 'u1', 'tok-u2': 'u2', 'tok-admin': 'admin1' } as Record<string, string>,
}));

vi.mock('server-only', () => ({}));
vi.mock('firebase-admin/firestore', async () => (await import('./fake-admin')).firestoreMock);
vi.mock('@/lib/firebase-admin', async () => {
  const { db } = await import('./fake-admin');
  return {
    getAdminDb: () => db,
    getAdminAuth: () => ({
      verifyIdToken: async (t: string) => {
        if (!st.tokens[t]) throw new Error('bad');
        return { uid: st.tokens[t] };
      },
    }),
  };
});
vi.mock('@/lib/ai/entitlement.server', () => ({ getServerFeatureFlags: async () => ({ ...st.flags }) }));
vi.mock('@/lib/api-auth', async () => {
  const { NextResponse } = await import('next/server');
  return {
    requireSuperAdminApi: async (r: Request) =>
      r.headers.get('authorization') === 'Bearer tok-admin' ? null : NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
  };
});
vi.mock('@/lib/ai/anthropic.server', () => ({
  AiUnavailableError: class extends Error {},
  aiDayKey: () => '2026-10-19',
  assertAiBudget: async () => undefined,
  getAiModel: () => 'claude-sonnet-test',
  loadAiConfig: async () => ({ reviewBudgetUsd: 2 }),
  recordAiUsage: async () => ({ costUsd: 0 }),
  getAnthropicClient: () => {
    throw new Error('no network in tests');
  },
}));

import { db, store } from './fake-admin';
import { POST as logPOST } from '@/app/api/generation-review/log/route';
import { POST as outcomePOST } from '@/app/api/generation-review/outcome/route';
import { POST as reportPOST } from '@/app/api/generation-review/report/route';
import { POST as runPOST } from '@/app/api/admin/generation-review/run/route';
import { POST as actionsPOST } from '@/app/api/admin/generation-review/actions/route';
import { __resetGateCacheForTests } from '../server/gate.server';
import { runGenerationReview } from '../review/run.server';
import { fingerprintOf } from '../fingerprint';
import type { GenerationLogDraft } from '../types';
import { OWNER_FIXTURES, cleanWalkStrength, walkStrengthPushOnly, type Fixture } from './fixtures';

let n = 0;
const draftOf = (f: Fixture): GenerationLogDraft => ({
  id: `gtest${(++n).toString().padStart(6, '0')}`,
  type: f.type,
  generator: null,
  input: f.input,
  output: f.output,
  fingerprint: fingerprintOf(f.output),
  appVersion: 'abc1234',
  platform: 'ios',
  shownAtMs: Date.now(),
});
const req = (token: string | null, body?: unknown) =>
  new Request('http://x/api', { method: 'POST', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
const nreq = (token: string | null, body?: unknown) => req(token, body) as unknown as import('next/server').NextRequest;

beforeEach(() => {
  store.clear();
  st.flags = { enableGenerationReview: true, enableGenerationReviewLlm: false };
  __resetGateCacheForTests();
  store.set('users/admin1', { core: { isSuperAdmin: true } });
  store.set('users/u1', { core: {} });
  store.set('users/u2', { core: {} });
});

describe('POST /api/generation-review/log', () => {
  it('needs a token', async () => {
    expect((await logPOST(req(null, draftOf(cleanWalkStrength)))).status).toBe(401);
  });
  it('stores a valid draft under the token uid, with TTL and day', async () => {
    const d = draftOf(cleanWalkStrength);
    const res = await logPOST(req('tok-u1', d));
    expect(await res.json()).toMatchObject({ stored: true });
    const doc = store.get(`generation_log/${d.id}`)!;
    expect(doc.uid).toBe('u1');
    expect(doc.reviewed).toBe(false);
    expect(doc.expireAt.__ms - doc.createdAt.__ms).toBe(60 * 86_400_000);
  });
  it('rejects extra keys (e.g. a name) and fine-grained locations', async () => {
    const withName = { ...draftOf(cleanWalkStrength), input: { ...cleanWalkStrength.input, name: 'דוד' } };
    expect((await logPOST(req('tok-u1', withName))).status).toBe(400);
    const fineArea = { ...draftOf(cleanWalkStrength), input: { ...cleanWalkStrength.input, areaGeohash5: 'sv8wrqf' } };
    expect((await logPOST(req('tok-u1', fineArea))).status).toBe(400);
    const latLng = { ...draftOf(cleanWalkStrength), input: { ...cleanWalkStrength.input, lat: 31.5 } };
    expect((await logPOST(req('tok-u1', latLng))).status).toBe(400);
  });
  it('flag off: regular users are not stored, super admins are', async () => {
    st.flags.enableGenerationReview = false;
    const d = draftOf(cleanWalkStrength);
    expect(await (await logPOST(req('tok-u1', d))).json()).toEqual({ stored: false });
    expect(store.has(`generation_log/${d.id}`)).toBe(false);
    const a = draftOf(cleanWalkStrength);
    expect(await (await logPOST(req('tok-admin', a))).json()).toMatchObject({ stored: true });
  });
  it('samplePct 0 keeps regular users out, never super admins', async () => {
    store.set('app_config/generation_review', { samplePct: 0 });
    expect(await (await logPOST(req('tok-u1', draftOf(cleanWalkStrength)))).json()).toEqual({ stored: false });
    expect(await (await logPOST(req('tok-admin', draftOf(cleanWalkStrength)))).json()).toMatchObject({ stored: true });
  });
  it('an id already owned by another user → 409', async () => {
    const d = draftOf(cleanWalkStrength);
    await logPOST(req('tok-u1', d));
    expect((await logPOST(req('tok-u2', d))).status).toBe(409);
  });
});

describe('outcome + report', () => {
  it('only the owner may set an outcome; unknown id → 404', async () => {
    const d = draftOf(cleanWalkStrength);
    await logPOST(req('tok-u1', d));
    expect((await outcomePOST(req('tok-u2', { id: d.id, status: 'started' }))).status).toBe(403);
    expect((await outcomePOST(req('tok-u1', { id: 'gzzzzzzzzzz', status: 'started' }))).status).toBe(404);
    expect((await outcomePOST(req('tok-u1', { id: d.id, status: 'completed', swappedExercises: 2 }))).status).toBe(200);
    expect(store.get(`generation_log/${d.id}`)!.outcome).toMatchObject({ last: 'completed', swappedExercises: 2 });
  });
  it('a report appends and re-opens the log for review; an unsampled session is created from the draft', async () => {
    const d = draftOf(cleanWalkStrength);
    await logPOST(req('tok-u1', d));
    store.get(`generation_log/${d.id}`)!.reviewed = true;
    expect((await reportPOST(req('tok-u1', { id: d.id, reasons: ['unbalanced'], note: 'רק דחיפות' }))).status).toBe(200);
    const doc = store.get(`generation_log/${d.id}`)!;
    expect(doc.reports).toHaveLength(1);
    expect(doc.reviewed).toBe(false);
    const fresh = draftOf(walkStrengthPushOnly);
    expect((await reportPOST(req('tok-u1', { id: fresh.id, reasons: ['other'] }))).status).toBe(404);
    expect((await reportPOST(req('tok-u1', { id: fresh.id, reasons: ['other'], draft: fresh }))).status).toBe(200);
    expect(store.get(`generation_log/${fresh.id}`)!.uid).toBe('u1');
  });
  it('reports: flag off → regular users 404, super admins allowed', async () => {
    st.flags.enableGenerationReview = false;
    const d = draftOf(cleanWalkStrength);
    expect((await reportPOST(req('tok-u1', { id: d.id, reasons: ['other'], draft: d }))).status).toBe(404);
    const a = draftOf(cleanWalkStrength);
    expect((await reportPOST(req('tok-admin', { id: a.id, reasons: ['other'], draft: a }))).status).toBe(200);
  });
});

describe('admin routes', () => {
  it('run: super admin or the cron secret only', async () => {
    expect((await runPOST(nreq('tok-u1'))).status).toBe(403);
    expect((await runPOST(nreq('tok-admin'))).status).toBe(200);
    process.env.AI_REVIEW_CRON_SECRET = 'a-very-long-cron-secret-123';
    expect((await runPOST(nreq('a-very-long-cron-secret-123'))).status).toBe(200);
    delete process.env.AI_REVIEW_CRON_SECRET;
  });
  it('actions: fixture export returns JSON without a uid', async () => {
    const d = draftOf(walkStrengthPushOnly);
    await logPOST(req('tok-u1', d));
    await runGenerationReview(db, {});
    expect((await actionsPOST(nreq('tok-u1', { action: 'fixture', logId: d.id }))).status).toBe(403);
    const res = await actionsPOST(nreq('tok-admin', { action: 'fixture', logId: d.id }));
    const json = await res.json();
    expect(json.fixture.expect.mustNotFire).toContain('STRENGTH_SINGLE_PATTERN');
    expect(JSON.stringify(json.fixture)).not.toContain('u1');
    expect(store.get(`generation_reviews/${d.id}`)!.status.value).toBe('fixture');
  });
});

describe('runGenerationReview', () => {
  it('reviews every owner fixture, writes reviews + stats, skips clean sessions', async () => {
    const drafts = [...OWNER_FIXTURES, cleanWalkStrength].map(draftOf);
    for (const d of drafts) await logPOST(req('tok-u1', d));
    const res = await runGenerationReview(db, {});
    expect(res).toMatchObject({ reviewed: 6, flagged: 5, failed: 0 });
    expect(store.has(`generation_reviews/${drafts[5].id}`)).toBe(false);
    const day = store.get(`generation_log/${drafts[0].id}`)!.day;
    const stats = store.get(`generation_review_stats/${day}`)!;
    expect(stats.sessions).toBe(6);
    expect(stats.flagged).toBe(5);
    expect(stats.byRule.ROUTE_MISSES_STATION_PARK).toBe(1);
    expect(stats.byRule.HYBRID_NO_STRENGTH_STOP).toBe(1);
    // nothing left
    expect((await runGenerationReview(db, {})).reviewed).toBe(0);
  });
  it('a later report re-reviews the session and counts only the report', async () => {
    const d = draftOf(cleanWalkStrength);
    await logPOST(req('tok-u1', d));
    await runGenerationReview(db, {});
    await reportPOST(req('tok-u1', { id: d.id, reasons: ['too_easy_hard'] }));
    await runGenerationReview(db, {});
    const day = store.get(`generation_log/${d.id}`)!.day;
    expect(store.get(`generation_review_stats/${day}`)).toMatchObject({ sessions: 1, reports: 1 });
    expect(store.get(`generation_reviews/${d.id}`)!.reported).toBe(true);
  });
  it('LLM pass: off by default; on → sample judged with the fake model, cost counted', async () => {
    const d = draftOf(walkStrengthPushOnly);
    await logPOST(req('tok-u1', d));
    st.flags.enableGenerationReviewLlm = true;
    __resetGateCacheForTests();
    const call = vi.fn(async () => ({
      stop_reason: 'end_turn',
      usage: { input_tokens: 1000, output_tokens: 200 },
      content: [{ type: 'text', text: JSON.stringify({ verdict: 'bad', problems: ['רק דחיפה'], suggestion: 'לאזן' }) }],
    }));
    const res = await runGenerationReview(db, {}, { callLlm: call as never });
    expect(call).toHaveBeenCalledTimes(1);
    expect(res.llmReviewed).toBe(1);
    expect(store.get(`generation_reviews/${d.id}`)!.llm.verdict).toBe('bad');
  });
  it('demo world: a demo_ uid log is skipped whole; a core.demo user never reaches the LLM; real users unchanged', async () => {
    const real = draftOf(walkStrengthPushOnly);
    const demoPrefix = draftOf(walkStrengthPushOnly);
    const demoCore = draftOf(walkStrengthPushOnly);
    for (const d of [real, demoPrefix, demoCore]) await logPOST(req('tok-u1', d));
    // re-own two of the logs (synthetic): one demo_ uid, one core.demo user
    store.set(`generation_log/${demoPrefix.id}`, { ...store.get(`generation_log/${demoPrefix.id}`)!, uid: 'demo_p1' });
    store.set(`generation_log/${demoCore.id}`, { ...store.get(`generation_log/${demoCore.id}`)!, uid: 'u9' });
    store.set('users/u9', { core: { demo: { tenantId: 'demo-city', personaId: 'p9', v: 1 } } });
    st.flags.enableGenerationReviewLlm = true;
    __resetGateCacheForTests();
    const call = vi.fn(async () => ({
      stop_reason: 'end_turn',
      usage: { input_tokens: 1000, output_tokens: 200 },
      content: [{ type: 'text', text: JSON.stringify({ verdict: 'bad', problems: ['רק דחיפה'], suggestion: 'לאזן' }) }],
    }));
    const res = await runGenerationReview(db, {}, { callLlm: call as never });
    expect(res).toMatchObject({ reviewed: 2, skippedDemo: 2, llmReviewed: 1 });
    expect(call).toHaveBeenCalledTimes(1);
    expect(store.get(`generation_reviews/${real.id}`)!.llm.verdict).toBe('bad');
    expect(store.get(`generation_reviews/${demoCore.id}`)!.llm).toBeUndefined();
    // the demo_ log: marked reviewed, no review doc, not in the stats
    expect(store.get(`generation_log/${demoPrefix.id}`)).toMatchObject({ reviewed: true, reviewSkipped: 'demo' });
    expect(store.has(`generation_reviews/${demoPrefix.id}`)).toBe(false);
    const day = store.get(`generation_log/${real.id}`)!.day;
    expect(store.get(`generation_review_stats/${day}`)!.sessions).toBe(2);
  });
  it('dry run writes nothing', async () => {
    const d = draftOf(walkStrengthPushOnly);
    await logPOST(req('tok-u1', d));
    const before = JSON.stringify(Array.from(store.entries()));
    const res = await runGenerationReview(db, { dryRun: true });
    expect(res.dryRun?.[0].findings.map((f) => f.ruleId)).toContain('STRENGTH_SINGLE_PATTERN');
    expect(JSON.stringify(Array.from(store.entries()))).toBe(before);
  });
});
