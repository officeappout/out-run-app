import { describe, it, expect } from 'vitest';
import {
  OPS_NEEDING_SWITCHES,
  findingDocId,
  jsonSafe,
  parseFinding,
  parseFindingBump,
  parseHeartbeat,
  parseOp,
  parseRunIdArg,
  parseSummary,
  parseUploadPath,
  parseUsage,
  statusPayload,
  usageWrite,
  validDayKey,
} from '../qa-runner-ops';
import { audiencesFrom, isQaRunnerRequest } from '../qa-runner-auth';

const TODAY = '2026-10-20';
const FP = 'a1b2c3d4e5f6a7b8c9d0';
const finding = (p: Record<string, unknown> = {}) => ({
  runId: 'qa-123-iphone-13', fingerprint: FP, mission: 'M01_walker58', persona: 'rachel_58', device: 'iphone-13', cohort: 'v2', url: '/home', route: '/home', step: 3,
  category: 'design-rule', severity: 'P2', rule: 'V2-FONT-11', title: 'טקסט קטן', expected: 'e', actual: 'a',
  screenshot: 'qa/qa-123-iphone-13/M01_walker58/003-a1b2c3d4.png', repro: [{ name: 'tap', ref: 'e3' }], confidence: 1, source: 'lint', count: 1, createdAtMs: 1, ...p,
});
const docId = findingDocId('qa-123-iphone-13', FP);

describe('op routing', () => {
  it('accepts only the closed op list', () => {
    expect(parseOp({ op: 'usage', args: { a: 1 } })).toEqual({ ok: true, value: { op: 'usage', args: { a: 1 } } });
    for (const b of [null, {}, { op: 'set_doc' }, { op: 'users' }, { op: 'status', args: [] }]) {
      const r = parseOp(b);
      if (r.ok) expect(r.value.args).toEqual({});
      else expect(r.error).toBe('bad_op');
    }
    expect(parseOp({ op: 'delete' }).ok).toBe(false);
  });
  it('findings and upload URLs need both demo switches; accounting does not', () => {
    expect([...Array.from(OPS_NEEDING_SWITCHES)].sort()).toEqual(['finding', 'upload_url']);
  });
});

describe('heartbeat', () => {
  it('accepts the runner fields only, bounded', () => {
    expect(parseHeartbeat({ state: 'running', runId: 'qa-1', lastSessionAtMs: 5, findingsCount: 3.7, spentUsd: 1.2, extra: 'x' })).toEqual({
      ok: true,
      value: { state: 'running', runId: 'qa-1', lastSessionAtMs: 5, findingsCount: 3, spentUsd: 1.2 },
    });
    expect(parseHeartbeat({ state: 'hacked', runId: 'qa-1' }).ok).toBe(false);
    expect(parseHeartbeat({ state: 'idle', runId: '../x' }).ok).toBe(false);
    expect(parseHeartbeat({ state: 'idle', runId: 'r', findingsCount: -1, spentUsd: 1e9 })).toMatchObject({ value: { findingsCount: 0, spentUsd: 0 } });
  });
});

describe('usage', () => {
  const delta = { llmCalls: 1, inputTokens: 1000, outputTokens: 200, cachedTokens: 5000, usd: 0.01, model: 'claude-sonnet-5-5' };
  it('only today ± 1 (Israel day)', () => {
    expect(validDayKey('2026-10-20', TODAY)).toBe(true);
    expect(validDayKey('2026-10-19', TODAY)).toBe(true);
    expect(validDayKey('2026-10-21', TODAY)).toBe(true);
    expect(validDayKey('2026-10-18', TODAY)).toBe(false);
    expect(validDayKey('2026-11-01', '2026-10-31')).toBe(true);
    expect(validDayKey('../x', TODAY)).toBe(false);
  });
  it('rejects implausible or negative deltas', () => {
    expect(parseUsage({ day: TODAY, delta }, TODAY).ok).toBe(true);
    expect(parseUsage({ day: TODAY, delta: { ...delta, llmCalls: 2 } }, TODAY).ok).toBe(false);
    expect(parseUsage({ day: TODAY, delta: { ...delta, usd: -1 } }, TODAY).ok).toBe(false);
    expect(parseUsage({ day: TODAY, delta: { ...delta, usd: 500 } }, TODAY).ok).toBe(false);
    expect(parseUsage({ day: TODAY, delta: { ...delta, inputTokens: 9e9 } }, TODAY).ok).toBe(false);
    expect(parseUsage({ day: TODAY, delta: { ...delta, model: 'DROP TABLE' } }, TODAY).ok).toBe(false);
    expect(parseUsage({ day: '2020-01-01', delta }, TODAY)).toMatchObject({ ok: false, error: 'bad_day' });
  });
  it('writes increments only: totals + bySource.testers (+ a session)', () => {
    const inc = (n: number) => ({ inc: n });
    const w = usageWrite(delta, true, inc, 'NOW');
    expect(w).toMatchObject({ llmCalls: { inc: 1 }, usdEstimate: { inc: 0.01 }, testerSessions: { inc: 1 }, bySource: { testers: { cachedTokens: { inc: 5000 }, model: 'claude-sonnet-5-5' } }, updatedAt: 'NOW' });
    expect(usageWrite(delta, false, inc, 0)).not.toHaveProperty('testerSessions');
  });
});

describe('findings', () => {
  it('a valid finding is whitelisted and keyed by run + fingerprint', () => {
    const r = parseFinding({ docId, finding: { ...finding(), evil: 'x', count: 999 } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.docId).toBe(docId);
      expect(r.value.data).not.toHaveProperty('evil');
      expect(r.value.data.count).toBe(1);
    }
  });
  it('the doc id must be derived from the finding (no writing other docs)', () => {
    expect(parseFinding({ docId: 'users__abc', finding: finding() })).toMatchObject({ ok: false, error: 'bad_doc_id' });
    expect(parseFinding({ docId, finding: finding({ fingerprint: 'zz' }) }).ok).toBe(false);
  });
  it('screenshots must live under this run', () => {
    expect(parseFinding({ docId, finding: finding({ screenshot: 'qa/other-run/M01/003-a1b2c3d4.png' }) })).toMatchObject({ error: 'bad_screenshot' });
    expect(parseFinding({ docId, finding: finding({ screenshot: 'users/x/avatar.png' }) }).ok).toBe(false);
    expect(parseFinding({ docId, finding: finding({ screenshot: null }) }).ok).toBe(true);
  });
  it('enums, bounds and repro sanitising', () => {
    expect(parseFinding({ docId, finding: finding({ severity: 'P9' }) }).ok).toBe(false);
    const r = parseFinding({ docId, finding: finding({ title: 'x'.repeat(500), repro: [{ name: 'tap', nested: { a: 1 }, BAD: 1 }, 'str'], confidence: 7 }) });
    expect(r.ok && (r.value.data.title as string).length).toBe(140);
    expect(r.ok && r.value.data.repro).toEqual([{ name: 'tap' }]);
    expect(r.ok && r.value.data.confidence).toBe(0.5);
  });
  it('bump only a finding doc id', () => {
    expect(parseFindingBump({ docId }).ok).toBe(true);
    expect(parseFindingBump({ docId: 'demo_registry/config' }).ok).toBe(false);
  });
});

describe('uploads + reads', () => {
  it('signed URLs only for qa/{runId}/{mission}/{NNN}-{hex8}.png', () => {
    expect(parseUploadPath({ path: 'qa/qa-1/M01_walker58/003-a1b2c3d4.png' }).ok).toBe(true);
    for (const path of ['qa/qa-1/../x.png', 'users/u/a.png', 'qa/qa-1/M01/3.png', 'qa/qa-1/M01/003-a1b2c3d4.html', 'qa/qa-1/a/b/003-a1b2c3d4.png']) {
      expect(parseUploadPath({ path }).ok).toBe(false);
    }
  });
  it('run ids', () => {
    expect(parseRunIdArg({ runId: 'qa-1' }).ok).toBe(true);
    expect(parseRunIdArg({ runId: "a' or 1=1" }).ok).toBe(false);
  });
});

describe('summary', () => {
  it('sanitises to the panel shape', () => {
    const r = parseSummary({
      summary: { runId: 'qa-1', findings: 3, bySeverity: { P0: 1, P2: 2, P9: 7 }, clusters: [{ key: 'k', title: 't', severity: 'P0', screenshot: 'http://evil' }, null], clusterKeys: ['k', 3], sessions: [{ mission: 'M01', outcome: 'success' }], extra: 1 },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).not.toHaveProperty('extra');
      expect(r.value.bySeverity).toEqual({ P0: 1, P1: 0, P2: 2, P3: 0 });
      expect(r.value.clusters).toEqual([expect.objectContaining({ key: 'k', severity: 'P0', screenshot: null })]);
      expect(r.value.clusterKeys).toEqual(['k']);
    }
    expect(parseSummary({ summary: { runId: '../x' } }).ok).toBe(false);
  });
});

describe('status payload', () => {
  it('exposes only the two switches, caps/prices, stop flag, usage and roster', () => {
    const p = statusPayload({
      flagsRaw: { enable_demo_users: true, enable_ai_testers: true, enable_home_v2: true, maintenance_mode: false },
      configRaw: { caps: { dailyUsdCap: 15 }, prices: {}, updatedBy: 'owner-uid' },
      controlRaw: { testersStopRequested: true, stopRequestedBy: 'owner-uid' },
      testersRaw: { uids: ['demo_qa_walker58'] },
      usageDocs: [{ id: TODAY, data: { llmCalls: 1, updatedAt: { toMillis: () => 9 } } }],
    });
    expect(p).toEqual({
      switches: { enable_demo_users: true, enable_ai_testers: true },
      config: { caps: { dailyUsdCap: 15 }, prices: {} },
      stopRequested: true,
      usageDays: [{ id: TODAY, data: { llmCalls: 1, updatedAt: 9 } }],
      roster: ['demo_qa_walker58'],
      ownerRules: { notes: [], dismissals: [] },
    });
  });
  it('owner rules: whitelisted notes + dismissals, never the admin uid', () => {
    const p = statusPayload({
      flagsRaw: {},
      configRaw: {},
      controlRaw: {},
      testersRaw: {},
      usageDocs: [],
      ownerRulesRaw: {
        notes: [
          { id: 'OWN-101', text: 'הערה', screen: 'home_today', severity: 'P1', createdAtMs: 5, by: 'owner-uid' },
          { id: 'X-1', text: 'bad id' },
          { id: 'OWN-102', text: '   ' },
          { id: 'OWN-103', text: 'עוד', screen: '../etc', severity: 'P9', createdAtMs: { toMillis: () => 7 } },
        ],
        dismissals: [
          { findingId: 'qa-1__abc', rule: 'LAY-OVERLAP', screen: 'home_today', title: 't', reason: 'בכוונה', atMs: 3, by: 'owner-uid' },
          { findingId: 'bad/id', rule: 'X', screen: 'home' },
          { findingId: 'qa-1__def', rule: 'lower', screen: '/map', atMs: 1 },
        ],
        updatedBy: 'owner-uid',
      },
    });
    expect(p.ownerRules).toEqual({
      notes: [
        { id: 'OWN-101', text: 'הערה', screen: 'home_today', severity: 'P1', createdAtMs: 5 },
        { id: 'OWN-103', text: 'עוד', screen: null, severity: 'P2', createdAtMs: 7 },
      ],
      dismissals: [
        { findingId: 'qa-1__abc', rule: 'LAY-OVERLAP', screen: 'home_today', title: 't', reason: 'בכוונה', atMs: 3 },
        { findingId: 'qa-1__def', rule: null, screen: '/map', title: '', reason: '', atMs: 1 },
      ],
    });
    expect(JSON.stringify(p)).not.toContain('owner-uid');
  });
  it('jsonSafe turns timestamps into ms', () => {
    expect(jsonSafe({ a: [{ t: { toMillis: () => 1 } }], b: null })).toEqual({ a: [{ t: 1 }], b: null });
  });
});

describe('identity gate (shared with mintDemoTesterToken)', () => {
  const SA = 'qa-runner@appout-1.iam.gserviceaccount.com';
  const AUD = 'https://us-central1-appout-1.cloudfunctions.net/qaRunnerReport';
  const NOW = 1_800_000_000;
  const tokeninfo = (info: Record<string, unknown> | null) =>
    (async () => (info ? new Response(JSON.stringify(info), { status: 200 }) : new Response('{}', { status: 400 }))) as unknown as typeof fetch;
  const good = { iss: 'https://accounts.google.com', aud: AUD, email: SA, email_verified: 'true', exp: String(NOW + 60) };

  it('lets in only the qa-runner with a token for this function', async () => {
    const h = { authorization: 'Bearer tok' };
    expect(await isQaRunnerRequest(h, [AUD], { fetchImpl: tokeninfo(good), nowSec: NOW, email: SA })).toBe(true);
    expect(await isQaRunnerRequest(h, [AUD], { fetchImpl: tokeninfo({ ...good, aud: 'https://us-central1-appout-1.cloudfunctions.net/mintDemoTesterToken' }), nowSec: NOW, email: SA })).toBe(false);
    expect(await isQaRunnerRequest(h, [AUD], { fetchImpl: tokeninfo({ ...good, email: 'owner@gmail.com' }), nowSec: NOW, email: SA })).toBe(false);
    expect(await isQaRunnerRequest(h, [AUD], { fetchImpl: tokeninfo(null), nowSec: NOW, email: SA })).toBe(false);
    expect(await isQaRunnerRequest({}, [AUD], { fetchImpl: tokeninfo(good), nowSec: NOW, email: SA })).toBe(false);
  });
  it('audience list from env, else the default', () => {
    expect(audiencesFrom(undefined, 'd')).toEqual(['d']);
    expect(audiencesFrom(' a , b ', 'd')).toEqual(['a', 'b']);
  });
});
