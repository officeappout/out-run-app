import { describe, it, expect } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { decideLandingRoute } from '@/lib/fast-startup/landing-decision';
import { buildExploreMapProfileWrite } from '@/features/user/onboarding/services/gateway-explore-map.service';
import { resolveQuickSignupHref } from '@/features/user/onboarding/intro/intro-route';
import { isDemoTenantId } from '@/lib/demo';
import {
  DEFAULT_CONTINUE_AT,
  isAuthFencedRequest,
  isLegacyGatewayHit,
  resumeStart,
  signedOutGuardReason,
  startsSignedOut,
  validateFirstLaunch,
} from '../lib/first-launch';
import { APP_HOSTS } from '../lib/config';
import { loadPersonasAndMissions } from '../lib/files';
import { missionFrom, runPlannedSession } from '../lib/mission-runner';
import { startNote } from '../lib/session';
import { buildSystemPrompt } from '../lib/prompt';
import { parseToolCall } from '../lib/tool-input';
import { TOOL_NAMES } from '../lib/tools';
import { buildTesterState, mapOnlyUser } from '../lib/seed/tester-state';
import { isOnboardedPrecondition } from '../lib/seed/preconditions';
import { Budget } from '../lib/budget';
import { FindingsBook } from '../lib/findings';
import { EMPTY_CAPS } from '@/lib/demo-control/usage-cost';
import type { SessionDriver, StepView } from '../lib/driver';
import type { OpenBrowser } from '../lib/browser';
import type { Store } from '../lib/store';
import type { Mission } from '../lib/missions';

const NOW = new Date(2026, 9, 21, 18, 30);
const WHO = { name: 'נועה', age: 31, gender: 'female' as const };

const base = {
  start: '/',
  precondition: 'map_only',
  firstLaunch: { continueAt: '/intro' },
  checkpoints: [
    { id: 'out_a', screen: 'פתיחה', how: 'לפני ההרשמה', signedOut: true, path: '/' },
    { id: 'out_b', screen: 'מגירה', how: 'לפני ההרשמה', signedOut: true },
    { id: 'in_c', screen: 'מיקום', how: 'אחרי ההרשמה' },
    { id: 'in_d', screen: 'בית', how: 'אחרי ההרשמה', path: '/home' },
  ],
};

describe('first launch — mission fields', () => {
  it('accepts a well-formed first-launch mission', () => {
    const e: string[] = [];
    validateFirstLaunch(base, e);
    expect(e).toEqual([]);
  });
  it('needs the map_only precondition and a path to continue at', () => {
    const e: string[] = [];
    validateFirstLaunch({ ...base, precondition: 'fresh', firstLaunch: { continueAt: 'intro' } }, e);
    expect(e.join(' ')).toMatch(/continueAt/);
    expect(e.join(' ')).toMatch(/map_only/);
  });
  it('signed-out checkpoints only in a first-launch mission, and only first', () => {
    const e1: string[] = [];
    validateFirstLaunch({ ...base, firstLaunch: undefined }, e1);
    expect(e1.join(' ')).toMatch(/only in a firstLaunch mission/);
    const e2: string[] = [];
    validateFirstLaunch({ ...base, checkpoints: [base.checkpoints[2], base.checkpoints[0]] }, e2);
    expect(e2.join(' ')).toMatch(/must come first/);
  });
});

describe('first launch — where a session starts', () => {
  it('starts signed out from the beginning or a signed-out checkpoint only', () => {
    expect(startsSignedOut(base, null)).toBe(true);
    expect(startsSignedOut(base, 'out_b')).toBe(true);
    expect(startsSignedOut(base, 'in_c')).toBe(false);
    expect(startsSignedOut({ ...base, firstLaunch: undefined }, null)).toBe(false);
  });
  it('a resume after the handoff starts at the checkpoint path, else where the signup goes', () => {
    expect(resumeStart(base, 'in_d')).toBe('/home');
    expect(resumeStart(base, 'in_c')).toBe('/intro');
    expect(resumeStart(base, 'out_b')).toBe('/');
    expect(resumeStart(base, null)).toBe('/');
    const m = { ...base, id: 'X' } as unknown as Mission;
    expect(missionFrom(m, 'in_c').start).toBe('/intro');
    expect(missionFrom(m, null)).toBe(m);
  });
  it('/intro is exactly where the real quick signup goes when the intro is on and unseen', () => {
    expect(resolveQuickSignupHref('/explorer', { introOn: true, introSeen: false })).toBe(DEFAULT_CONTINUE_AT);
  });
});

describe('first launch — the signed-out fence', () => {
  it('blocks every account-creating request, lets the app load', () => {
    expect(isAuthFencedRequest('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=x', 'POST', APP_HOSTS)).toBe(true);
    expect(isAuthFencedRequest('https://securetoken.googleapis.com/v1/token', 'POST', APP_HOSTS)).toBe(true);
    expect(isAuthFencedRequest('https://accounts.google.com/o/oauth2/auth', 'GET', APP_HOSTS)).toBe(true);
    expect(isAuthFencedRequest('https://appleid.apple.com/auth/authorize', 'GET', APP_HOSTS)).toBe(true);
    expect(isAuthFencedRequest('https://outrun.co.il/__/auth/handler', 'GET', APP_HOSTS)).toBe(true);
    expect(isAuthFencedRequest('https://outrun.co.il/api/telemetry/signup-failure', 'POST', APP_HOSTS)).toBe(true);
    expect(isAuthFencedRequest('https://outrun.co.il/api/flags', 'GET', APP_HOSTS)).toBe(false);
    expect(isAuthFencedRequest('https://outrun.co.il/', 'GET', APP_HOSTS)).toBe(false);
    expect(isAuthFencedRequest('https://firestore.googleapis.com/v1/x', 'POST', APP_HOSTS)).toBe(false);
    expect(isAuthFencedRequest('https://example.com/api/x', 'POST', APP_HOSTS)).toBe(false);
    expect(isAuthFencedRequest('not a url', 'POST', APP_HOSTS)).toBe(false);
  });
  it('signed out = nobody on the page', () => {
    expect(signedOutGuardReason(null)).toBeNull();
    expect(signedOutGuardReason('anonUid123')).toBe('signed_in_before_handoff');
    expect(signedOutGuardReason('demo_qa_fl_strength_i13')).toBe('signed_in_before_handoff');
  });
  it('the legacy gateway is flagged only for real-path missions', () => {
    expect(isLegacyGatewayHit({ precondition: 'map_only' }, 'https://outrun.co.il/gateway')).toBe(true);
    expect(isLegacyGatewayHit({ precondition: 'map_only' }, 'https://outrun.co.il/gateway/')).toBe(true);
    expect(isLegacyGatewayHit({ precondition: 'map_only' }, 'https://outrun.co.il/explorer')).toBe(false);
    expect(isLegacyGatewayHit({ precondition: 'fresh' }, 'https://outrun.co.il/gateway')).toBe(false);
  });
});

describe('first launch — tester tools and prompt', () => {
  it('continue_signed_in is a tool with no input', () => {
    expect(TOOL_NAMES.has('continue_signed_in')).toBe(true);
    expect(parseToolCall('continue_signed_in', {})).toEqual({ ok: true, call: { name: 'continue_signed_in' } });
  });
  it('the start note says signed out / signed in', () => {
    expect(startNote({ signedOut: true })).toMatch(/NOT signed in/);
    expect(startNote({ signedOut: true, stepOffset: 3 })).toMatch(/restarted/);
    expect(startNote({})).toMatch(/You are signed in/);
  });
  it('the prompt of a first-launch mission explains the handoff; others do not mention it', () => {
    const { personas, missions } = loadPersonasAndMissions();
    const d00 = missions.find((m) => m.id === 'D00_first_launch')!;
    const p = buildSystemPrompt(personas.get(d00.persona)!, d00, { deviceId: 'iphone-13' });
    expect(p).toMatch(/continue_signed_in/);
    expect(p).toMatch(/fl_landing, fl_login_drawer/);
    const d05 = missions.find((m) => m.id === 'D05_strength_player')!;
    expect(buildSystemPrompt(personas.get(d05.persona)!, d05, { deviceId: 'iphone-13' })).not.toMatch(/continue_signed_in/);
  });
});

describe('first launch — mission files', () => {
  const { missions } = loadPersonasAndMissions();
  it('D00 / D00r / D00w start signed out on "/" and hand off to /intro', () => {
    for (const id of ['D00_first_launch', 'D00r_first_launch_run', 'D00w_first_launch_walk']) {
      const m = missions.find((x) => x.id === id)!;
      expect(m, id).toBeTruthy();
      expect(m.start).toBe('/');
      expect(m.precondition).toBe('map_only');
      expect(m.firstLaunch?.continueAt).toBe('/intro');
      expect(startsSignedOut(m, null)).toBe(true);
    }
    const d00 = missions.find((x) => x.id === 'D00_first_launch')!;
    expect(d00.checkpoints!.filter((c) => c.signedOut).map((c) => c.id)).toEqual(['fl_landing', 'fl_login_drawer']);
  });
  it('no onboarding mission starts from an account the app would send to /gateway', () => {
    for (const id of ['D01_onboard_strength', 'D02_onboard_run', 'D03_onboard_walk', 'M01_walker58']) {
      const m = missions.find((x) => x.id === id)!;
      expect(m.precondition, id).toBe('map_only');
      expect(m.goal, id).not.toMatch(/גלו את המפה' \/ 'תוכנית כוח', \/gateway\) הוא חלק/);
    }
    // nothing starts 'fresh' any more (a doc-less signed-in account lands on /gateway)
    expect(missions.filter((m) => m.precondition === 'fresh').map((m) => m.id)).toEqual([]);
  });
});

describe('first launch — the map_only seed', () => {
  const uid = 'demo_qa_fl_strength_i13';
  it('is the quick signup scaffold + only the demo fences, and lands like a real new user', () => {
    const docs = buildTesterState(uid, 'map_only', WHO, NOW, null);
    expect(docs.map((d) => d.path)).toEqual([`users/${uid}`]);
    const u = docs[0].data as Record<string, any>;
    const real = buildExploreMapProfileWrite(uid, undefined)!;
    const { core: realCore, ...realRest } = real;
    expect(u).toMatchObject(realRest);
    expect(u.core).toMatchObject(realCore);
    expect(Object.keys(u.core).sort()).toEqual([...Object.keys(realCore), 'demo', 'discoverable', 'isMockData', 'tenantId'].sort());
    expect(u.core.name).toBe('');
    expect(u.core.demo).toMatchObject({ tester: true, precondition: 'map_only' });
    expect(u.core.discoverable).toBe(false);
    expect(isDemoTenantId(u.core.tenantId)).toBe(true);
    expect(u.onboardingComplete).toBeUndefined();
    expect(decideLandingRoute(u)).toBe('/explorer');
    expect(mapOnlyUser(uid, NOW)).toEqual(u);
    expect(isOnboardedPrecondition('map_only')).toBe(false);
  });
  it('refuses a non-tester uid', () => {
    expect(() => buildTesterState('realUser123456789012', 'map_only', WHO, NOW, null)).toThrow();
  });
});

// ── The two-phase session end to end with fakes (no browser, no network) ─────────────────────

const PRICES = { 'claude-sonnet-5-5': { inputPerMTok: 2, outputPerMTok: 10, cachedPerMTok: 0.2 } };
const VIEW: StepView = { png: Buffer.from('p'), jpeg: Buffer.from('j'), observation: { elements: [], facts: {} as never }, lint: [], url: 'https://outrun.co.il/', blocked: null };

function fakeStore(saved: Array<Record<string, unknown>>): Store {
  const noop = async () => {};
  return {
    status: async () => ({}) as never,
    stopRequested: async () => false,
    heartbeat: noop,
    addUsage: noop,
    saveFinding: async (_id: string, f: Record<string, unknown>) => void saved.push(f),
    bumpFinding: noop,
    uploadScreenshot: async () => 'qa/x.png',
    readFindings: async () => [],
    latestRunId: async () => null,
    readQaSummaryRaw: async () => undefined,
    writeQaSummary: noop,
  } as unknown as Store;
}

describe('runPlannedSession — signed out → continue_signed_in → signed in', () => {
  const { personas, missions } = loadPersonasAndMissions();
  const d00 = missions.find((m) => m.id === 'D00_first_launch')!;
  const persona = personas.get(d00.persona)!;

  function setup(script: string[], urls: string[]) {
    const calls: string[] = [];
    const saved: Array<Record<string, unknown>> = [];
    let mints = 0;
    let turn = 0;
    let views = 0;
    const anthropic = {
      beta: {
        messages: {
          create: async () => {
            const name = script[turn++] ?? 'end_mission';
            const input = name === 'end_mission' ? { outcome: 'success', summary: 'ok' } : name === 'score_screen' ? { screen: 'fl_landing', clarity: 4, consistency: 4, density: 4, rtl: 4, notes: '' } : {};
            return { content: [{ type: 'tool_use', id: `t${turn}`, name, input }], stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 10 } };
          },
        },
      },
    } as unknown as Anthropic;
    const budget = new Budget({ caps: { ...EMPTY_CAPS, dailyUsdCap: 5 }, prices: PRICES, model: 'claude-sonnet-5-5', todayUsd: 0, monthUsd: 0, sessionsToday: 0, maxSessionsThisRun: 3 });
    const driver = {
      repro: [],
      openSignedOut: async () => (calls.push('openSignedOut'), { console: [], failedRequests: [] }),
      handoff: async (token: string, continueAt: string) => (calls.push(`handoff:${token}:${continueAt}`), null),
      signIn: async () => (calls.push('signIn'), null),
      openStart: async () => null,
      view: async () => ({ ...VIEW, url: urls[Math.min(views++, urls.length - 1)] }),
      act: async () => {},
      fireWorldEvents: async () => [],
      stop: () => {},
    } as unknown as SessionDriver;
    const run = () =>
      runPlannedSession(
        {
          session: { anthropic, model: 'claude-sonnet-5-5', store: fakeStore(saved), budget, book: new FindingsBook(), runId: 'qa-t', cohort: 'v2', dayKey: () => '2026-10-21', stopRequested: async () => false, log: () => {}, sleep: async () => {} },
          baseUrl: 'https://outrun.co.il',
          seed: 1,
          mint: async () => (mints++, calls.push('mint'), { ok: true as const, token: 'tok' }),
          open: async () => ({ crashed: false, close: async () => {} }) as unknown as OpenBrowser,
          driver: () => driver,
        },
        { mission: d00, device: 'iphone-13', uid: 'demo_qa_fl_strength_i13', resumeFrom: null },
        persona,
      );
    return { run, calls, saved, mints: () => mints };
  }

  it('mints only at the handoff and continues at /intro', async () => {
    const t = setup(['score_screen', 'continue_signed_in', 'end_mission'], ['https://outrun.co.il/', 'https://outrun.co.il/', 'https://outrun.co.il/intro']);
    const r = await t.run();
    expect(r.outcome).toBe('success');
    expect(t.calls).toEqual(['openSignedOut', 'mint', 'handoff:tok:/intro']);
    expect(t.calls).not.toContain('signIn');
    expect(t.mints()).toBe(1);
  });

  it('a second continue_signed_in is refused; landing on /gateway is recorded once', async () => {
    const t = setup(['continue_signed_in', 'continue_signed_in', 'observe', 'end_mission'], ['https://outrun.co.il/', 'https://outrun.co.il/gateway', 'https://outrun.co.il/gateway', 'https://outrun.co.il/gateway']);
    const r = await t.run();
    expect(r.outcome).toBe('success');
    expect(t.mints()).toBe(1);
    const gw = t.saved.filter((f) => f.title === 'משתמש חדש הגיע למסך /gateway הישן');
    expect(gw).toHaveLength(1);
    expect(gw[0]).toMatchObject({ severity: 'P1', source: 'runner' });
  });

  it('an account on the page before the handoff ends the session', async () => {
    const t = setup(['observe'], ['https://outrun.co.il/']);
    const blockedDriverRun = async () => {
      const r = await t.run();
      return r;
    };
    // the first view reports the signed-out guard refusal
    const orig = VIEW.blocked;
    (VIEW as { blocked: string | null }).blocked = 'signed_in_before_handoff';
    try {
      const r = await blockedDriverRun();
      expect(r).toMatchObject({ outcome: 'error', reason: 'signed_in_before_handoff' });
      expect(t.mints()).toBe(0);
    } finally {
      (VIEW as { blocked: string | null }).blocked = orig;
    }
  });
});
