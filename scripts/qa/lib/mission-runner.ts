/**
 * One planned session end to end: mint → open the browser → sign in → the tester loop → close.
 * When the browser crashes mid-session (run 39550288326: "page.evaluate: Target crashed" on
 * D01 / iphone-13 after one screen took the whole run down), the session goes on in a FRESH
 * browser (new mint, new sign-in) from the first screen that was not scored yet — at most
 * MAX_CRASH_RESTARTS times. Steps and minutes keep counting across attempts (same caps).
 */
import { DEVICES } from './config';
import { isBrowserCrash, MAX_CRASH_RESTARTS, memoryLine, nextResumePoint } from './crash';
import { isSweep } from './design/checkpoints';
import { SessionDriver } from './driver';
import type { OpenBrowser } from './browser';
import type { MintResult } from './mint';
import type { Mission, Persona } from './missions';
import type { PlannedSession } from './plan';
import { runSession, type SessionDeps, type SessionResult } from './session';

export interface MissionRunDeps {
  session: SessionDeps;
  baseUrl: string;
  /** Session number in the run (GPS seed). */
  seed: number;
  mint: (uid: string) => Promise<MintResult>;
  open: (device: (typeof DEVICES)[string], startAt: { latitude: number; longitude: number }) => Promise<OpenBrowser>;
  /** Driver factory (tests inject a fake). */
  driver?: (b: OpenBrowser, mission: Mission) => SessionDriver;
}

export interface MissionRunResult extends SessionResult {
  /** Browsers opened for this session (1 = no crash). */
  attempts: number;
}

/** The mission as it starts from `checkpoint` (its path, when it has one). */
export function missionFrom(planned: Mission, checkpoint: string | null): Mission {
  const cp = checkpoint ? planned.checkpoints?.find((c) => c.id === checkpoint) : undefined;
  return cp?.path ? { ...planned, start: cp.path } : planned;
}

export async function runPlannedSession(deps: MissionRunDeps, s: PlannedSession, persona: Persona): Promise<MissionRunResult> {
  const log = deps.session.log;
  const scored = new Set<string>();
  const startedAt = Date.now();
  let resumeFrom = s.resumeFrom;
  let mission = s.mission;
  let stepOffset = 0;
  let newFindings = 0;

  for (let attempt = 1; ; attempt++) {
    const minted = await deps.mint(s.uid);
    if (!minted.ok) {
      log(`mint refused: ${minted.error}`);
      return { outcome: 'error', reason: `mint_${minted.error}`, summary: '', steps: stepOffset, newFindings, scored: [...scored], attempts: attempt };
    }
    const start = mission.gps?.route[0] ?? [32.0853, 34.7818];
    const browser = await deps.open(DEVICES[s.device], { latitude: start[0], longitude: start[1] });
    log(`browser ${attempt} open (${s.device}) · ${memoryLine()}`);
    const driver = deps.driver ? deps.driver(browser, mission) : new SessionDriver(browser, mission, deps.baseUrl, deps.seed);
    let r: SessionResult;
    try {
      const refused = await driver.signIn(minted.token);
      if (refused && !browser.crashed) {
        log(`sign-in refused: ${refused}`);
        return { outcome: 'error', reason: refused, summary: '', steps: stepOffset, newFindings, scored: [...scored], attempts: attempt };
      }
      if (refused) throw new Error('Target crashed during sign-in');
      const bootErrors = await driver.openStart({ afterSignIn: true });
      if (bootErrors && (bootErrors.console.length || bootErrors.failedRequests.length)) {
        // Not linted as the mission's (sign-in + the app's own first redirect); kept in the log.
        log(`sign-in/boot errors (not reported): ${[...bootErrors.failedRequests, ...bootErrors.console].slice(0, 6).join(' | ')}`);
      }
      r = await runSession(deps.session, persona, mission, s.device, driver, { resumeFrom, stepOffset, startedAt, scored });
    } catch (e) {
      if (!isBrowserCrash(e)) throw e;
      log(`browser crashed before the tester loop (${e instanceof Error ? e.message.split('\n')[0].slice(0, 160) : 'unknown'}) · ${memoryLine()}`);
      r = { outcome: 'error', reason: 'browser_crashed', summary: '', steps: stepOffset, newFindings: 0, scored: [...scored] };
    } finally {
      driver.stop();
      await browser.close();
    }

    newFindings += r.newFindings;
    const done: MissionRunResult = { ...r, newFindings, scored: [...scored], attempts: attempt };
    if (r.reason !== 'browser_crashed') return done;
    if (attempt > MAX_CRASH_RESTARTS) {
      log(`browser crashed ${attempt} times — giving up on ${s.mission.id}`);
      return done;
    }
    let next: string | null = null;
    if (isSweep(s.mission)) {
      next = nextResumePoint(s.mission.checkpoints, resumeFrom, scored);
      if (!next) {
        log(`browser crashed after every screen of ${s.mission.id} was scored — not restarting`);
        return { ...done, summary: 'all checkpoints scored before the crash' };
      }
    }
    log(`restart ${attempt}/${MAX_CRASH_RESTARTS}: ${s.mission.id}${next ? `@${next}` : ' from its start'} in a fresh browser (${r.steps} steps used)`);
    resumeFrom = next;
    mission = missionFrom(s.mission, next);
    stepOffset = r.steps;
  }
}
