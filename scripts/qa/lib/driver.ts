/**
 * SessionDriver — carries out the tester's tool calls in the one browser of a session:
 * actions by ref/point, the GPS feeder, offline / background, world events, and the per-step
 * observation (screenshot + elements + linter issues). Every action is fenced by the demo guard:
 * on a non-demo page or a non-tester account it acts on nothing and goes back to the mission start.
 */
import { HARD_CAPS } from './config';
import { checkPage, isTesterUid, SIGNED_IN_UID_JS } from './demo-guard';
import { GpsSim } from './gps';
import { COLLECT_JS, type Observation } from './lint/collect';
import { lintFacts, type LintIssue } from './lint/rules';
import { keyboardViewport } from './keyboard-sim';
import type { Mission, WorldEvent } from './missions';
import type { OpenBrowser } from './browser';
import type { ReproStep } from './findings';
import type { ToolCall } from './tool-input';

export interface StepView {
  png: Buffer;
  observation: Observation;
  lint: LintIssue[];
  url: string;
  /** Set when the guard refused this page / account (the runner navigated back). */
  blocked: string | null;
}

const BACKGROUND_JS = (hidden: boolean) => `(() => {
  try {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => '${hidden ? 'hidden' : 'visible'}' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => ${hidden} });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event(${hidden ? "'pagehide'" : "'pageshow'"}));
  } catch (e) {}
  return true;
})()`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class SessionDriver {
  readonly repro: ReproStep[] = [];
  private gps: GpsSim | null = null;
  private gpsTimer: NodeJS.Timeout | null = null;
  private readonly firedEvents = new Set<number>();
  private lastActionAt = 0;

  constructor(
    private readonly b: OpenBrowser,
    private readonly mission: Mission,
    private readonly baseUrl: string,
    private readonly seed: number,
  ) {}

  get startUrl(): string {
    return new URL(this.mission.start, this.baseUrl).toString();
  }

  get gpsDistanceM(): number {
    return this.gps?.distanceM ?? 0;
  }

  async signIn(customToken: string): Promise<string | null> {
    // Token in the FRAGMENT only (never sent to the server, wiped by the page at once).
    await this.b.page.goto(`${new URL('/qa/signin', this.baseUrl).toString()}#t=${customToken}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    for (let i = 0; i < 30; i++) {
      const state = await this.b.page.evaluate<string | null>(`document.querySelector('[data-qa-signin]')?.getAttribute('data-qa-signin') ?? null`).catch(() => null);
      if (state && state.startsWith('refused')) return state;
      const uid = await this.signedInUid();
      if (uid && isTesterUid(uid)) return null;
      await sleep(1000);
    }
    return 'refused:timeout';
  }

  async signedInUid(): Promise<string | null> {
    return this.b.page.evaluate<string | null>(SIGNED_IN_UID_JS).catch(() => null);
  }

  async openStart(): Promise<void> {
    await this.b.page.goto(this.startUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await this.settle();
  }

  private async settle() {
    await this.b.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await this.b.page.waitForTimeout(400);
  }

  private async gap() {
    const wait = this.lastActionAt + HARD_CAPS.minActionGapMs - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastActionAt = Date.now();
  }

  /** null = fine; else the refusal reason (and the browser is back at the mission start). */
  async guard(): Promise<string | null> {
    const page = checkPage(this.b.page.url(), this.mission.forbidden);
    const uid = await this.signedInUid();
    const reason = !page.ok ? page.reason : !isTesterUid(uid) ? 'not_signed_in_as_tester' : null;
    if (reason) {
      this.repro.push({ runner: 'guard_back', reason });
      if (reason !== 'not_signed_in_as_tester') await this.openStart().catch(() => {});
    }
    return reason;
  }

  async view(): Promise<StepView> {
    const blocked = await this.guard();
    const observation = await this.b.page.evaluate<Observation>(COLLECT_JS);
    const lint = blocked ? [] : lintFacts(observation.facts, this.b.drainErrors());
    const png = await this.b.page.screenshot({ type: 'png', scale: 'css' });
    return { png, observation, lint, url: this.b.page.url(), blocked };
  }

  private loc(ref: string) {
    return this.b.page.locator(`[data-qa-ref="${ref}"]`).first();
  }

  private async point(c: { ref?: string; x?: number; y?: number }): Promise<{ x: number; y: number }> {
    if (c.ref) {
      const box = await this.loc(c.ref).boundingBox();
      if (!box) throw new Error(`element ${c.ref} is gone — observe again`);
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }
    return { x: c.x ?? 0, y: c.y ?? 0 };
  }

  /** Runs one browser action. Throws a model-readable Error on failure. */
  async act(call: ToolCall): Promise<void> {
    const p = this.b.page;
    if (call.name !== 'observe' && call.name !== 'report_finding' && call.name !== 'score_screen' && call.name !== 'end_mission') this.repro.push({ ...call });
    switch (call.name) {
      case 'observe':
      case 'report_finding':
      case 'score_screen':
      case 'end_mission':
        return;
      case 'tap':
        await this.gap();
        if (call.ref) await this.loc(call.ref).click({ timeout: 5000 });
        else await p.mouse.click(call.x ?? 0, call.y ?? 0);
        break;
      case 'long_press': {
        await this.gap();
        const pt = await this.point(call);
        await p.mouse.move(pt.x, pt.y);
        await p.mouse.down();
        await p.waitForTimeout(call.ms);
        await p.mouse.up();
        break;
      }
      case 'type':
        await this.gap();
        await this.loc(call.ref).fill(call.text, { timeout: 5000 });
        if (call.submit) await p.keyboard.press('Enter');
        break;
      case 'scroll':
        await this.gap();
        if (call.x !== undefined && call.y !== undefined) await p.mouse.move(call.x, call.y);
        await p.mouse.wheel(0, call.direction === 'down' ? call.amount : -call.amount);
        break;
      case 'drag':
        await this.gap();
        await p.mouse.move(call.from_x, call.from_y);
        await p.mouse.down();
        await p.mouse.move(call.to_x, call.to_y, { steps: 12 });
        await p.mouse.up();
        break;
      case 'back':
        await this.gap();
        await p.goBack({ timeout: 10_000 }).catch(() => {});
        break;
      case 'background_app':
        await this.background(call.seconds);
        break;
      case 'gps':
        if (!this.mission.gps) throw new Error('this mission has no GPS route');
        if (call.action === 'start') this.startGps();
        else if (call.action === 'lose_signal') this.gps?.loseSignal(call.seconds);
        else this.gps?.poorAccuracy(call.seconds);
        break;
      case 'network':
        await this.b.context.setOffline(call.mode === 'offline');
        break;
      case 'wait':
        await p.waitForTimeout(call.seconds * 1000);
        break;
      case 'keyboard': {
        const full = this.b.viewport;
        await p.setViewportSize(call.state === 'open' ? keyboardViewport(full) : full);
        break;
      }
    }
    await this.settle();
  }

  private async background(seconds: number) {
    await this.b.page.evaluate(BACKGROUND_JS(true)).catch(() => {});
    await this.b.page.waitForTimeout(seconds * 1000);
    await this.b.page.evaluate(BACKGROUND_JS(false)).catch(() => {});
  }

  startGps() {
    const g = this.mission.gps;
    if (!g || this.gps) return;
    this.gps = new GpsSim(g.route, g.profile, g.basePaceMinPerKm, g.loop ?? true, this.seed);
    this.gpsTimer = setInterval(() => {
      const fix = this.gps?.tick(1);
      if (fix) void this.b.context.setGeolocation({ latitude: fix.latitude, longitude: fix.longitude, accuracy: fix.accuracy }).catch(() => {});
    }, 1000);
  }

  /** Mission world events due at this step / distance (each fires once). */
  async fireWorldEvents(step: number): Promise<string[]> {
    const fired: string[] = [];
    const events: WorldEvent[] = this.mission.worldEvents ?? [];
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (this.firedEvents.has(i)) continue;
      const due = (e.atStep !== undefined && step >= e.atStep) || (e.atDistanceM !== undefined && this.gpsDistanceM >= e.atDistanceM);
      if (!due) continue;
      this.firedEvents.add(i);
      this.repro.push({ world: e.do, seconds: e.seconds });
      if (e.do === 'gps_lose_signal') this.gps?.loseSignal(e.seconds);
      else if (e.do === 'gps_poor_accuracy') this.gps?.poorAccuracy(e.seconds);
      else if (e.do === 'offline') {
        await this.b.context.setOffline(true);
        setTimeout(() => void this.b.context.setOffline(false).catch(() => {}), e.seconds * 1000);
      } else if (e.do === 'background_app') await this.background(e.seconds);
      fired.push(`${e.do} ${e.seconds}s`);
    }
    return fired;
  }

  stop() {
    if (this.gpsTimer) clearInterval(this.gpsTimer);
    this.gpsTimer = null;
  }
}
