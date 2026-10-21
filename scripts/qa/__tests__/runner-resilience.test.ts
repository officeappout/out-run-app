import { describe, it, expect } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { isBrowserCrash, launchArgs, memoryLine, nextResumePoint, MAX_CRASH_RESTARTS } from '../lib/crash';
import { backoffMs, describeModelError, isRetryableModelError, withModelRetry } from '../lib/model-retry';
import { ShotLog, shotFileName, slug, type ShotFs } from '../lib/shots';
import { missionFrom, runPlannedSession } from '../lib/mission-runner';
import { Budget } from '../lib/budget';
import { FindingsBook } from '../lib/findings';
import { loadPersonasAndMissions } from '../lib/files';
import type { SessionDriver, StepView } from '../lib/driver';
import type { OpenBrowser } from '../lib/browser';
import type { Store } from '../lib/store';
import type { Mission } from '../lib/missions';
import { EMPTY_CAPS } from '@/lib/demo-control/usage-cost';

const CPS = [
  { id: 'a_one', screen: 'מסך א', how: 'הראשון ברשימה' },
  { id: 'b_two', screen: 'מסך ב', how: 'השני ברשימה', path: '/b' },
  { id: 'c_three', screen: 'מסך ג', how: 'השלישי ברשימה' },
];

describe('crash helpers', () => {
  it('recognises Playwright crash / closed-target messages only', () => {
    expect(isBrowserCrash(new Error('page.evaluate: Target crashed '))).toBe(true);
    expect(isBrowserCrash(new Error('page.screenshot: Target page, context or browser has been closed'))).toBe(true);
    expect(isBrowserCrash(new Error('browser has disconnected'))).toBe(true);
    expect(isBrowserCrash(new Error('element e12 is gone — observe again'))).toBe(false);
    expect(isBrowserCrash(new Error('locator.click: Timeout 5000ms exceeded'))).toBe(false);
  });
  it('chromium gets the CI-safe args, webkit none', () => {
    expect(launchArgs('chromium')).toEqual(expect.arrayContaining(['--disable-dev-shm-usage', '--disable-gpu']));
    expect(launchArgs('webkit')).toEqual([]);
  });
  it('memory line names process + machine memory', () => {
    const line = memoryLine({ rss: 300 * 1024 ** 2, heapUsed: 100 * 1024 ** 2, heapTotal: 150 * 1024 ** 2, external: 0, arrayBuffers: 0 }, 4 * 1024 ** 3, 16 * 1024 ** 3);
    expect(line).toBe('mem rss 300MB heap 100/150MB · machine free 4.0/16.0GB');
  });
  it('resumes at the first unscored checkpoint from the current resume point', () => {
    expect(nextResumePoint(CPS, null, new Set())).toBe('a_one');
    expect(nextResumePoint(CPS, null, new Set(['a_one']))).toBe('b_two');
    expect(nextResumePoint(CPS, 'b_two', new Set(['b_two']))).toBe('c_three');
    expect(nextResumePoint(CPS, null, new Set(['a_one', 'b_two', 'c_three']))).toBeNull();
    expect(nextResumePoint(undefined, null, new Set())).toBeNull();
  });
  it('a resumed mission starts at the checkpoint path when it has one', () => {
    const m = { start: '/', checkpoints: CPS } as unknown as Mission;
    expect(missionFrom(m, 'b_two').start).toBe('/b');
    expect(missionFrom(m, 'c_three').start).toBe('/');
    expect(missionFrom(m, null)).toBe(m);
  });
});

describe('model retry', () => {
  const apiErr = (status: number, type: string, message: string) => Object.assign(new Error(`${status} ${message}`), { status, error: { type: 'error', error: { type, message } }, request_id: 'req_1' });
  it('describes the real error (status, type, message, request id)', () => {
    expect(describeModelError(apiErr(529, 'overloaded_error', 'Overloaded'))).toBe('529 overloaded_error: Overloaded (req_1)');
    expect(describeModelError(new Error('socket hang up'))).toBe('socket hang up');
  });
  it('retries overloads / rate limits / network errors, not invalid requests', () => {
    expect(isRetryableModelError(apiErr(529, 'overloaded_error', 'x'))).toBe(true);
    expect(isRetryableModelError(apiErr(429, 'rate_limit_error', 'x'))).toBe(true);
    expect(isRetryableModelError(new Error('fetch failed'))).toBe(true);
    expect(isRetryableModelError(apiErr(400, 'invalid_request_error', 'x'))).toBe(false);
  });
  it('backs off with a cap', () => {
    expect(backoffMs(1, () => 0.5)).toBe(4000);
    expect(backoffMs(2, () => 0.5)).toBe(12000);
    expect(backoffMs(5, () => 0.5)).toBe(30000);
  });
  it('bounded: retries then gives up, logging each real message', async () => {
    const logs: string[] = [];
    let calls = 0;
    const r = await withModelRetry(async () => {
      calls++;
      throw apiErr(529, 'overloaded_error', 'Overloaded');
    }, { log: (m) => logs.push(m), sleep: async () => {}, attempts: 3 });
    expect(r.ok).toBe(false);
    expect(calls).toBe(3);
    expect(logs.at(-1)).toContain('giving up): 529 overloaded_error: Overloaded');
  });
  it('a 400 fails at once; a transient error then success returns the value', async () => {
    let calls = 0;
    const bad = await withModelRetry(async () => {
      calls++;
      throw apiErr(400, 'invalid_request_error', 'bad image');
    }, { log: () => {}, sleep: async () => {} });
    expect(bad.ok).toBe(false);
    expect(calls).toBe(1);
    let n = 0;
    const good = await withModelRetry(async () => {
      if (n++ === 0) throw new Error('fetch failed');
      return 42;
    }, { log: () => {}, sleep: async () => {} });
    expect(good).toEqual({ ok: true, value: 42 });
  });
});

function memFs() {
  const files = new Map<string, Buffer | string>();
  const fs: ShotFs = { mkdir: () => {}, write: (p, d) => void files.set(p, d) };
  return { fs, files };
}

describe('shots artifact', () => {
  it('file names: NN-screen-device, unscored views by route', () => {
    expect(shotFileName(3, 'onb_goal', '/onboarding', 'iphone-13')).toBe('03-onb_goal-iphone-13.jpg');
    expect(shotFileName(12, null, '/home', 'iphone-se')).toBe('12-x_home-iphone-se.jpg');
    expect(slug('/')).toBe('root');
  });
  it('writes every view in order with its score, title and findings; manifest after each file', () => {
    const { fs, files } = memFs();
    const log = new ShotLog('qa-1', '/out/shots', fs);
    const m = { id: 'D01_x', checkpoints: CPS };
    log.capture(m, 'iphone-13', 0, '/', '/', Buffer.from('img0'));
    log.finding('f-lint');
    log.capture(m, 'iphone-13', 1, '/a', '/a', Buffer.from('img1'));
    log.score('a_one', { clarity: 4, consistency: 3, density: 5, rtl: 4 }, 'f-score');
    log.finding('f-model');
    log.finding('f-model');
    log.capture(m, 'iphone-13', 2, '/b', '/b', null); // no image → nothing kept
    log.flush();
    const shots = log.all();
    expect(shots.map((s) => s.file)).toEqual(['D01_x/01-x_root-iphone-13.jpg', 'D01_x/02-a_one-iphone-13.jpg']);
    expect(shots[0].findingIds).toEqual(['f-lint']);
    expect(shots[1]).toMatchObject({ order: 2, screenId: 'a_one', title: 'מסך א', step: 1, scoreId: 'f-score', findingIds: ['f-model'] });
    expect(shots[1].overall).toBeCloseTo(4);
    expect(files.has('/out/shots/D01_x/02-a_one-iphone-13.jpg')).toBe(true);
    const manifest = JSON.parse(String(files.get('/out/shots/manifest.json')));
    expect(manifest).toMatchObject({ runId: 'qa-1', count: 2 });
  });
  it('a failing disk never throws into the run', () => {
    const log = new ShotLog('qa-1', '/out', { mkdir: () => {}, write: () => { throw new Error('ENOSPC'); } });
    log.capture({ id: 'M', checkpoints: undefined }, 'iphone-13', 0, '/', '/', Buffer.from('x'));
    expect(() => log.flush()).not.toThrow();
  });
});

// ── The restart loop end to end with fakes (no browser, no network) ─────────────────────────

const PRICES = { 'claude-sonnet-5-5': { inputPerMTok: 2, outputPerMTok: 10, cachedPerMTok: 0.2 } };

function fakeStore(): Store {
  const noop = async () => {};
  return {
    status: async () => ({}) as never,
    stopRequested: async () => false,
    heartbeat: noop,
    addUsage: noop,
    saveFinding: noop,
    bumpFinding: noop,
    uploadScreenshot: async () => 'qa/x.png',
    readFindings: async () => [],
    latestRunId: async () => null,
    readQaSummaryRaw: async () => undefined,
    writeQaSummary: noop,
  };
}

const VIEW: StepView = { png: Buffer.from('p'), jpeg: Buffer.from('j'), observation: { elements: [], facts: {} as never }, lint: [], url: 'https://outrun.co.il/home', blocked: null };

describe('runPlannedSession — crash → fresh browser → resume', () => {
  const { personas, missions } = loadPersonasAndMissions();
  const sweep = missions.find((m) => m.kind === 'design-sweep' && !m.firstLaunch && (m.checkpoints?.length ?? 0) >= 3)!;
  const persona = personas.get(sweep.persona)!;

  function setup(crashPlan: Array<'crash_first_view' | 'crash_after_score' | 'ok'>) {
    const logs: string[] = [];
    const resumes: Array<string | null> = [];
    let browsers = 0;
    let mints = 0;
    const model = { calls: 0 };
    const anthropic = {
      beta: {
        messages: {
          create: async () => {
            model.calls++;
            const attempt = crashPlan[browsers - 1];
            const content =
              attempt === 'crash_after_score'
                ? [{ type: 'tool_use', id: `t${model.calls}`, name: 'score_screen', input: { screen: sweep.checkpoints![0].id, clarity: 4, consistency: 4, density: 4, rtl: 4, notes: '' } }, { type: 'tool_use', id: `u${model.calls}`, name: 'tap', input: { x: 10, y: 10 } }]
                : [{ type: 'tool_use', id: `e${model.calls}`, name: 'end_mission', input: { outcome: 'success', summary: 'done' } }];
            return { content, stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 10 } };
          },
        },
      },
    } as unknown as Anthropic;
    const budget = new Budget({ caps: { ...EMPTY_CAPS, dailyUsdCap: 5 }, prices: PRICES, model: 'claude-sonnet-5-5', todayUsd: 0, monthUsd: 0, sessionsToday: 0, maxSessionsThisRun: 3 });
    const fakeDriver = (b: OpenBrowser, m: Mission) => {
      const attempt = crashPlan[browsers - 1];
      let views = 0;
      resumes.push(m.start);
      return {
        repro: [],
        signIn: async () => null,
        openStart: async () => null,
        view: async () => {
          views++;
          if (attempt === 'crash_first_view') throw new Error('page.evaluate: Target crashed ');
          if (attempt === 'crash_after_score' && views > 1) throw new Error('page.evaluate: Target crashed ');
          return VIEW;
        },
        act: async () => {},
        fireWorldEvents: async () => [],
        stop: () => {},
      } as unknown as SessionDriver;
    };
    const run = () =>
      runPlannedSession(
        {
          session: { anthropic, model: 'claude-sonnet-5-5', store: fakeStore(), budget, book: new FindingsBook(), runId: 'qa-t', cohort: 'v2', dayKey: () => '2026-10-21', stopRequested: async () => false, log: (m) => logs.push(m), sleep: async () => {} },
          baseUrl: 'https://outrun.co.il',
          seed: 1,
          mint: async () => (mints++, { ok: true as const, token: 't' }),
          open: async () => (browsers++, { crashed: false, close: async () => {} } as unknown as OpenBrowser),
          driver: fakeDriver,
        },
        { mission: sweep, device: 'iphone-13', uid: 'demo_qa_x', resumeFrom: null },
        persona,
      );
    return { run, logs, resumes, counts: () => ({ browsers, mints, model: model.calls }) };
  }

  it('a crash after the first score resumes at the next checkpoint in a fresh browser', async () => {
    const t = setup(['crash_after_score', 'ok']);
    const r = await t.run();
    expect(r).toMatchObject({ outcome: 'success', attempts: 2 });
    expect(r.scored).toEqual([sweep.checkpoints![0].id]);
    expect(t.counts()).toMatchObject({ browsers: 2, mints: 2 });
    expect(t.logs.some((l) => l.includes(`restart 1/${MAX_CRASH_RESTARTS}: ${sweep.id}@${sweep.checkpoints![1].id}`))).toBe(true);
    expect(r.steps).toBe(2); // step 1 before the crash + step 2 after (caps count across browsers)
  });

  it('gives up after MAX_CRASH_RESTARTS fresh browsers, without throwing', async () => {
    const t = setup(['crash_first_view', 'crash_first_view', 'crash_first_view', 'ok']);
    const r = await t.run();
    expect(r).toMatchObject({ outcome: 'error', reason: 'browser_crashed', attempts: MAX_CRASH_RESTARTS + 1 });
    expect(t.counts().browsers).toBe(MAX_CRASH_RESTARTS + 1);
    expect(t.counts().model).toBe(0);
  });
});
