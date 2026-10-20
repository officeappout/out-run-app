import { describe, it, expect } from 'vitest';
import {
  MINT_DAILY_HARD_MAX,
  dailyMintLimit,
  decideMint,
  extractIdToken,
  israelDayKey,
  nextQuota,
  parseMintRequest,
  registeredUids,
  testerClaims,
  verifyCallerIdentity,
} from '../demo-tester-token';

const ON = { enable_demo_users: true, enable_ai_testers: true };
const SA = 'qa-runner@appout-1.iam.gserviceaccount.com';
const AUD = 'https://us-central1-appout-1.cloudfunctions.net/mintDemoTesterToken';
const NOW = 1_800_000_000;
const goodInfo = { iss: 'https://accounts.google.com', aud: AUD, email: SA, email_verified: 'true', exp: String(NOW + 600) };

describe('parseMintRequest', () => {
  it('accepts a demo_qa_ uid + run id', () => {
    expect(parseMintRequest({ uid: 'demo_qa_walker58', runId: 'run-1' })).toEqual({ ok: true, value: { uid: 'demo_qa_walker58', runId: 'run-1' } });
  });
  it.each(['demo_tlv01', 'demo_qa_', 'demo_qa_A', 'abc', 'demo_qa_x/y', 'demo_qa_ab'])('refuses uid %s', (uid) => {
    const r = parseMintRequest({ uid, runId: 'r' });
    expect(r.ok).toBe(false);
  });
  it('refuses junk bodies and bad run ids', () => {
    expect(parseMintRequest(null).ok).toBe(false);
    expect(parseMintRequest([]).ok).toBe(false);
    expect(parseMintRequest({ uid: 'demo_qa_walker58', runId: 'a b' }).ok).toBe(false);
  });
});

describe('verifyCallerIdentity', () => {
  const exp = { email: SA, audiences: [AUD] };
  it('accepts the qa-runner SA', () => {
    expect(verifyCallerIdentity(goodInfo, exp, NOW)).toBe(true);
    expect(verifyCallerIdentity({ ...goodInfo, email: SA.toUpperCase() }, exp, NOW)).toBe(true);
  });
  it.each([
    ['another account', { email: 'someone@gmail.com' }],
    ['wrong audience', { aud: 'https://evil' }],
    ['wrong issuer', { iss: 'https://token.actions.githubusercontent.com' }],
    ['unverified email', { email_verified: 'false' }],
    ['expired', { exp: String(NOW - 1) }],
  ])('refuses %s', (_n, patch) => {
    expect(verifyCallerIdentity({ ...goodInfo, ...patch }, exp, NOW)).toBe(false);
  });
  it('refuses when tokeninfo failed', () => {
    expect(verifyCallerIdentity(null, exp, NOW)).toBe(false);
  });
});

describe('extractIdToken', () => {
  it('prefers X-Qa-Id-Token, falls back to bearer', () => {
    expect(extractIdToken({ 'x-qa-id-token': 'aaa', authorization: 'Bearer bbb' })).toBe('aaa');
    expect(extractIdToken({ authorization: 'Bearer bbb' })).toBe('bbb');
    expect(extractIdToken({ authorization: 'Basic x' })).toBeNull();
    expect(extractIdToken({})).toBeNull();
  });
});

describe('decideMint', () => {
  const req = { uid: 'demo_qa_walker58', runId: 'r1' };
  const reg = new Set(['demo_qa_walker58']);
  it('mints with demo + qa claims only', () => {
    const r = decideMint(req, { flagsRaw: ON, registered: reg });
    expect(r).toEqual({ ok: true, value: { claims: { demo: true, qa: true, run: 'r1' } } });
    expect(testerClaims('x')).not.toHaveProperty('isSuperAdmin');
  });
  it('refuses when either switch is off (raw values, no defaults)', () => {
    expect(decideMint(req, { flagsRaw: { enable_demo_users: true }, registered: reg })).toMatchObject({ ok: false, code: 'switch_off' });
    expect(decideMint(req, { flagsRaw: { enable_ai_testers: true }, registered: reg })).toMatchObject({ ok: false, code: 'switch_off' });
    expect(decideMint(req, { flagsRaw: undefined, registered: reg })).toMatchObject({ ok: false, code: 'switch_off' });
  });
  it('refuses an unregistered or non-tester uid', () => {
    expect(decideMint(req, { flagsRaw: ON, registered: new Set() })).toMatchObject({ ok: false, code: 'uid_not_registered' });
    expect(decideMint({ uid: 'real_user', runId: 'r' }, { flagsRaw: ON, registered: new Set(['real_user']) })).toMatchObject({ ok: false, code: 'uid_not_allowed' });
  });
});

describe('registry + quota', () => {
  it('merges uids from the testers and personas docs', () => {
    expect(Array.from(registeredUids({ uids: ['demo_qa_a1b'] }, { uids: ['demo_tlv01', 3] }, undefined))).toEqual(['demo_qa_a1b', 'demo_tlv01']);
  });
  it('daily limit = min(hard max, panel cap)', () => {
    expect(dailyMintLimit(undefined)).toBe(MINT_DAILY_HARD_MAX);
    expect(dailyMintLimit({ caps: { maxTesterSessionsPerDay: 6 } })).toBe(6);
    expect(dailyMintLimit({ caps: { maxTesterSessionsPerDay: 500 } })).toBe(MINT_DAILY_HARD_MAX);
    expect(dailyMintLimit({ caps: { maxTesterSessionsPerDay: 0 } })).toBe(0);
  });
  it('counts per Israel day and stops at the limit', () => {
    expect(nextQuota(undefined, '2026-10-20', 2)).toEqual({ ok: true, value: { day: '2026-10-20', count: 1 } });
    expect(nextQuota({ day: '2026-10-20', count: 1 }, '2026-10-20', 2)).toEqual({ ok: true, value: { day: '2026-10-20', count: 2 } });
    expect(nextQuota({ day: '2026-10-20', count: 2 }, '2026-10-20', 2)).toMatchObject({ ok: false, code: 'quota_exhausted' });
    expect(nextQuota({ day: '2026-10-19', count: 99 }, '2026-10-20', 2)).toEqual({ ok: true, value: { day: '2026-10-20', count: 1 } });
    expect(nextQuota(undefined, '2026-10-20', 0)).toMatchObject({ ok: false });
  });
  it('israelDayKey rolls over at Israel midnight', () => {
    expect(israelDayKey(new Date('2026-10-20T21:30:00Z'))).toBe('2026-10-21');
    expect(israelDayKey(new Date('2026-10-20T20:30:00Z'))).toBe('2026-10-20');
  });
});
