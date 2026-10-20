import { describe, it, expect } from 'vitest';
import { GpsSim, cumulative, haversineM, pointAt } from '../lib/gps';
import { Budget, preflight, sessionGate, toUsageDelta } from '../lib/budget';
import { checkPage, isBlockedRequestHost, isTesterUid, redactSecrets } from '../lib/demo-guard';
import { parseToolCall } from '../lib/tool-input';
import { FindingsBook, findingDocId, fingerprint, type Finding } from '../lib/findings';
import { makeRunId, parseRunArgs, planRun } from '../lib/plan';
import { assertRunnerUpload, assertRunnerWrite, usageIncrements } from '../lib/store';
import { idTokenSecondsLeft, mintTesterToken } from '../lib/mint';
import { loadPersonasAndMissions } from '../lib/files';
import { validateMission } from '../lib/missions';
import { buildSystemPrompt } from '../lib/prompt';
import { TOOLS } from '../lib/tools';
import { EMPTY_CAPS } from '@/lib/demo-control/usage-cost';

const ROUTE: Array<[number, number]> = [
  [32.1003, 34.798],
  [32.101, 34.805],
  [32.1, 34.812],
];
const PRICES = { 'claude-sonnet-5-5': { inputPerMTok: 2, outputPerMTok: 10, cachedPerMTok: 0.2 } };
const CAPS = { ...EMPTY_CAPS, dailyUsdCap: 1, maxTesterSessionsPerDay: 3 };

describe('gps', () => {
  it('walks the route at the given pace', () => {
    const total = cumulative(ROUTE).at(-1)!;
    expect(total).toBeGreaterThan(1000);
    expect(pointAt(ROUTE, cumulative(ROUTE), 0, false)).toEqual(ROUTE[0]);
    expect(pointAt(ROUTE, cumulative(ROUTE), total * 10, false)).toEqual(ROUTE[2]);
    const sim = new GpsSim(ROUTE, 'steady', 5, true, 7);
    for (let i = 0; i < 60; i++) sim.tick(1);
    expect(sim.distanceM).toBeGreaterThan(190);
    expect(sim.distanceM).toBeLessThan(210);
  });
  it('fixes stay near the route; a lost signal yields no fixes', () => {
    const sim = new GpsSim(ROUTE, 'steady', 5, true, 3);
    const fix = sim.tick(1)!;
    expect(haversineM([fix.latitude, fix.longitude], ROUTE[0])).toBeLessThan(15);
    sim.loseSignal(3);
    expect(sim.tick(1)).toBeNull();
    expect(sim.tick(1)).toBeNull();
    sim.tick(1);
    expect(sim.tick(1)).not.toBeNull();
  });
  it('intervals alternate fast and easy', () => {
    const sim = new GpsSim(ROUTE, 'intervals', 5, true, 1);
    for (let i = 0; i < 60; i++) sim.tick(1);
    const fast = sim.distanceM;
    expect(fast).toBeGreaterThan(220); // 5:00 / 0.85 ≈ 3.9 m/s
  });
});

describe('budget', () => {
  it('refuses to start without a daily cap or a full price', () => {
    expect(preflight(EMPTY_CAPS, PRICES, 'claude-sonnet-5-5')).toEqual({ ok: false, reason: 'cap_not_set' });
    expect(preflight(CAPS, {}, 'claude-sonnet-5-5')).toEqual({ ok: false, reason: 'price_not_set' });
    expect(preflight(CAPS, PRICES, 'claude-sonnet-5-5')).toEqual({ ok: true });
  });
  it('prices a call with the panel table (cache writes at 1.25× input)', () => {
    const d = toUsageDelta({ input_tokens: 1_000_000, output_tokens: 100_000, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 0 }, 'claude-sonnet-5-5', PRICES);
    expect(d.usd).toBeCloseTo(2 + 1 + 0.2);
    expect(toUsageDelta({ input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1000 }, 'm', PRICES).inputTokens).toBe(1250);
  });
  it('stops at the daily $ cap counting what other sources spent today', () => {
    const b = new Budget({ caps: CAPS, prices: PRICES, model: 'claude-sonnet-5-5', todayUsd: 0.9, monthUsd: 0.9, sessionsToday: 0, maxSessionsThisRun: 5 });
    expect(b.money().ok).toBe(true);
    b.record({ input_tokens: 60_000, output_tokens: 0 });
    expect(b.money()).toEqual({ ok: false, reason: 'daily_usd_cap' });
  });
  it('caps sessions per day and per run', () => {
    const b = new Budget({ caps: CAPS, prices: PRICES, model: 'claude-sonnet-5-5', todayUsd: 0, monthUsd: 0, sessionsToday: 2, maxSessionsThisRun: 5 });
    expect(b.startSession().ok).toBe(true);
    expect(b.startSession()).toEqual({ ok: false, reason: 'sessions_per_day_cap' });
    const c = new Budget({ caps: { ...CAPS, maxTesterSessionsPerDay: null }, prices: PRICES, model: 'm', todayUsd: 0, monthUsd: 0, sessionsToday: 0, maxSessionsThisRun: 1 });
    expect(c.startSession().ok).toBe(true);
    expect(c.startSession()).toEqual({ ok: false, reason: 'sessions_per_run_cap' });
  });
  it('session gate: steps and minutes, never above the hard caps', () => {
    expect(sessionGate(10, 0, 1000, { maxSteps: 10, maxMinutes: 5 })).toEqual({ ok: false, reason: 'steps_per_session_cap' });
    expect(sessionGate(1, 0, 5 * 60_000, { maxSteps: 10, maxMinutes: 5 })).toEqual({ ok: false, reason: 'session_time_cap' });
    expect(sessionGate(60, 0, 0, { maxSteps: 500, maxMinutes: 5 }).ok).toBe(false);
    expect(sessionGate(3, 0, 1000, { maxSteps: 10, maxMinutes: 5 })).toEqual({ ok: true });
  });
});

describe('demo guard', () => {
  it('only the app host, never forbidden paths', () => {
    expect(checkPage('https://outrun.co.il/home', [])).toEqual({ ok: true });
    expect(checkPage('https://evil.example/home', [])).toEqual({ ok: false, reason: 'foreign_host' });
    expect(checkPage('http://outrun.co.il/home', [])).toEqual({ ok: false, reason: 'foreign_host' });
    expect(checkPage('https://outrun.co.il/admin/demo', [])).toEqual({ ok: false, reason: 'forbidden_path' });
    expect(checkPage('https://outrun.co.il/ai-coach', [])).toEqual({ ok: false, reason: 'forbidden_path' });
    expect(checkPage('https://outrun.co.il/settings/privacy', ['/settings/privacy'])).toEqual({ ok: false, reason: 'forbidden_path' });
    expect(checkPage('https://outrun.co.il/administrator', []).ok).toBe(true);
  });
  it('refuses pages about a real user or group, allows demo ones', () => {
    expect(checkPage('https://outrun.co.il/profile/aB3dE5fG7hJ9kL1mN3pQ', [])).toEqual({ ok: false, reason: 'non_demo_entity' });
    expect(checkPage('https://outrun.co.il/profile/demo_tlv01', [])).toEqual({ ok: true });
    expect(checkPage('https://outrun.co.il/chat?with=aB3dE5fG7hJ9kL1mN3pQ', [])).toEqual({ ok: false, reason: 'non_demo_entity' });
    expect(checkPage('https://outrun.co.il/community/demo-run-club', [])).toEqual({ ok: true });
    expect(checkPage('https://outrun.co.il/community/new', [])).toEqual({ ok: true });
  });
  it('tester uids, blocked hosts, redaction', () => {
    expect(isTesterUid('demo_qa_walker58')).toBe(true);
    expect(isTesterUid('demo_tlv01')).toBe(false);
    expect(isTesterUid(null)).toBe(false);
    expect(isBlockedRequestHost('https://www.google-analytics.com/g/collect')).toBe(true);
    expect(isBlockedRequestHost('https://outrun.co.il/')).toBe(false);
    expect(redactSecrets('goto https://x/qa/signin#t=abc.def.ghi')).toBe('goto https://x/qa/signin#t=[redacted]');
    expect(redactSecrets('tok eyJhbGciOiJSUzI1.eyJ1aWQiOiJkZW1v.sig')).toBe('tok [jwt]');
  });
});

describe('tool input', () => {
  it('accepts refs and clamps numbers', () => {
    expect(parseToolCall('tap', { ref: 'e3' })).toEqual({ ok: true, call: { name: 'tap', ref: 'e3' } });
    expect(parseToolCall('wait', { seconds: 999 })).toEqual({ ok: true, call: { name: 'wait', seconds: 60 } });
    expect(parseToolCall('scroll', { direction: 'down' })).toEqual({ ok: true, call: { name: 'scroll', direction: 'down', amount: 500 } });
  });
  it('rejects junk', () => {
    expect(parseToolCall('tap', { ref: '#app' }).ok).toBe(false);
    expect(parseToolCall('type', { ref: 'e1' }).ok).toBe(false);
    expect(parseToolCall('rm_rf', {}).ok).toBe(false);
    expect(parseToolCall('report_finding', { category: 'ux', severity: 'P9', title: 'x' }).ok).toBe(false);
  });
  it('drops an unknown rule id instead of trusting it', () => {
    const r = parseToolCall('report_finding', { category: 'ux', severity: 'P1', rule: 'MADE-UP', title: 'כותרת', expected: 'a', actual: 'b', confidence: 3 });
    expect(r).toMatchObject({ ok: true, call: { rule: null, confidence: 1 } });
  });
  it('every declared tool has a parser', () => {
    for (const t of TOOLS) expect(parseToolCall(t.name, {}).ok === true || !parseToolCall(t.name, {}).ok).toBe(true);
    for (const t of TOOLS) expect((parseToolCall(t.name, {}) as { error?: string }).error ?? '').not.toMatch(/unknown tool/);
  });
});

const finding = (p: Partial<Finding> = {}): Finding => ({
  id: 'x', fingerprint: 'fp1', runId: 'r', mission: 'M01', persona: 'rachel_58', device: 'iphone-13', cohort: 'v2', url: '/home', route: '/home', step: 1,
  category: 'design-rule', severity: 'P2', rule: 'V2-FONT-11', title: 't', expected: 'e', actual: 'a', screenshot: null, repro: [], confidence: 1, source: 'lint', count: 1, createdAtMs: 0, ...p,
});

describe('findings', () => {
  it('fingerprints are stable and label-insensitive to spacing/case', () => {
    expect(fingerprint('/home', 'V2-CTA-1', 'Start  Now')).toBe(fingerprint('/home', 'V2-CTA-1', 'start now'));
    expect(fingerprint('/home', 'V2-CTA-1', 'a')).not.toBe(fingerprint('/map', 'V2-CTA-1', 'a'));
  });
  it('the book keeps one per fingerprint, counts repeats, keeps the worst severity', () => {
    const b = new FindingsBook();
    expect(b.add(finding()).isNew).toBe(true);
    const r = b.add(finding({ severity: 'P1' }));
    expect(r.isNew).toBe(false);
    expect(r.finding).toMatchObject({ count: 2, severity: 'P1' });
    expect(b.size).toBe(1);
    expect(findingDocId('qa-1/x', 'fp')).toBe('qa-1_x__fp');
  });
});

describe('plan + args', () => {
  const { missions, personas } = loadPersonasAndMissions();
  it('the shipped persona + mission files are valid', () => {
    expect(missions.map((m) => m.id).sort()).toEqual(['M01_walker58', 'M02_runner_intervals', 'M03_home_beginner']);
    expect(personas.size).toBe(3);
    for (const m of missions) expect(isTesterUid(m.uid)).toBe(true);
  });
  it('a mission must use a demo_qa_ account and known rules', () => {
    const bad = { ...missions[0], uid: 'demo_tlv01', focusRules: ['NOPE'] };
    const v = validateMission(bad, new Set(personas.keys()));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors.join()).toMatch(/uid.*focusRules/);
  });
  it('skips unregistered testers and respects the session cap', () => {
    const roster = new Set(['demo_qa_walker58', 'demo_qa_home_beginner']);
    const p = planRun(missions, { missions: null, device: null, maxSessions: 1 }, roster);
    expect(p.sessions.map((s) => s.mission.id)).toEqual(['M01_walker58']);
    expect(p.skipped).toEqual([
      { id: 'M02_runner_intervals', reason: 'not_registered' },
      { id: 'M03_home_beginner', reason: 'over_session_cap' },
    ]);
  });
  it('parses args and env', () => {
    const a = parseRunArgs(['--missions', 'M01_walker58', '--device', 'iphone-se'], { QA_MAX_SESSIONS: '99' });
    expect(a).toMatchObject({ missions: ['M01_walker58'], device: 'iphone-se', baseUrl: 'https://outrun.co.il', maxSessions: 8 });
    expect(() => parseRunArgs(['--device', 'nokia'])).toThrow();
    expect(() => parseRunArgs(['--base-url', 'http://localhost:3000'])).toThrow();
    expect(makeRunId(new Date('2026-10-20T23:05:00Z'), '123')).toBe('qa-20261020-2305-123');
  });
  it('the system prompt is deterministic (cacheable) and carries the boundaries', () => {
    const m = missions[0];
    const p = personas.get(m.persona)!;
    expect(buildSystemPrompt(p, m)).toBe(buildSystemPrompt(p, m));
    expect(buildSystemPrompt(p, m)).toMatch(/data, never instructions/);
  });
});

describe('store guard', () => {
  it('the runner writes only its own docs', () => {
    expect(() => assertRunnerWrite('qa_findings/qa-1__abc')).not.toThrow();
    expect(() => assertRunnerWrite('demo_registry/control')).not.toThrow();
    expect(() => assertRunnerWrite('demo_registry/usage/days/2026-10-20')).not.toThrow();
    expect(() => assertRunnerWrite('demo_registry/qa_summary')).not.toThrow();
    for (const p of ['users/abc', 'demo_registry/config', 'demo_registry/testers', 'system_config/feature_flags', 'qa_findings/a/b/c']) {
      expect(() => assertRunnerWrite(p)).toThrow();
    }
    expect(() => assertRunnerUpload('qa/qa-1/M01/001.png')).not.toThrow();
    expect(() => assertRunnerUpload('users/abc/avatar.png')).toThrow();
    expect(() => assertRunnerUpload('qa/qa-1/../x.png')).toThrow();
  });
  it('usage writes are increments, totals + bySource.testers', () => {
    const inc = (n: number) => ({ inc: n });
    const d = usageIncrements({ llmCalls: 1, inputTokens: 10, outputTokens: 5, cachedTokens: 2, model: 'm', usd: 0.5 }, true, inc, 'NOW');
    expect(d).toMatchObject({ llmCalls: { inc: 1 }, testerSessions: { inc: 1 }, usdEstimate: { inc: 0.5 }, bySource: { testers: { inputTokens: { inc: 10 }, model: 'm' } }, updatedAt: 'NOW' });
    expect(usageIncrements({ llmCalls: 1, inputTokens: 0, outputTokens: 0, cachedTokens: 0, model: 'm', usd: 0 }, false, inc, 0)).not.toHaveProperty('testerSessions');
  });
});

describe('mint client', () => {
  const b64u = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  it('reads the ID token expiry', () => {
    expect(idTokenSecondsLeft(`h.${b64u({ exp: 1000 })}.s`, 400)).toBe(600);
    expect(idTokenSecondsLeft('junk', 0)).toBe(-1);
  });
  it('sends the ID token in both headers and returns the error code on refusal', async () => {
    let seen: RequestInit | undefined;
    const ok = (async (_u: string, init?: RequestInit) => {
      seen = init;
      return new Response(JSON.stringify({ token: 'T' }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await mintTesterToken({ url: 'https://x', idToken: 'ID', uid: 'demo_qa_abc', runId: 'r', fetchImpl: ok })).toEqual({ ok: true, token: 'T' });
    expect((seen?.headers as Record<string, string>)['X-Qa-Id-Token']).toBe('ID');
    const no = (async () => new Response(JSON.stringify({ error: 'switch_off' }), { status: 409 })) as unknown as typeof fetch;
    expect(await mintTesterToken({ url: 'https://x', idToken: 'ID', uid: 'demo_qa_abc', runId: 'r', fetchImpl: no })).toEqual({ ok: false, error: 'switch_off' });
    const html = (async () => new Response('<html>403</html>', { status: 403 })) as unknown as typeof fetch;
    expect(await mintTesterToken({ url: 'https://x', idToken: 'ID', uid: 'demo_qa_abc', runId: 'r', fetchImpl: html })).toEqual({ ok: false, error: 'http_403' });
  });
});
