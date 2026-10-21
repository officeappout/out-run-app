/**
 * One tester session: persona + mission in one browser, the model ↔ tools loop, findings.
 * Caps are enforced here before every model call (steps, time, money, stop flag).
 *
 * Context: tools + system prompt are cached; old screenshots are cleared SERVER-side by context
 * editing (clear_tool_uses, keep the last few) — the history is never edited client-side.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { HARD_CAPS, KEEP_TOOL_RESULTS, MAX_TOKENS_PER_TURN, SCREENSHOT_PREFIX } from './config';
import { sessionGate, type Budget, type RefuseReason } from './budget';
import { buildSystemPrompt } from './prompt';
import { TOOLS } from './tools';
import { parseToolCall, type ToolCall } from './tool-input';
import { observationText } from './observation';
import { fingerprint, findingDocId, type Finding, type FindingsBook } from './findings';
import { routePattern, type LintIssue } from './lint/rules';
import type { Mission, Persona } from './missions';
import type { SessionDriver, StepView } from './driver';
import type { Store } from './store';
import type { UsageDelta } from './budget';
import { buildScoreFinding, scoreAck, withScreen } from './design/score-finding';
import { isBrowserCrash, memoryLine } from './crash';
import { withModelRetry } from './model-retry';
import type { ShotLog } from './shots';
import { SCORE_RULE_ID } from './design/dimensions';
import { RULE_IDS } from './checklist';
import { EMPTY_LEARNING, isSuppressed, type Learning } from './owner/learning';
import { ownerRuleIds, type OwnerRule } from './owner/owner-rules';
import { backResultText, type BackOutcome } from './android-back';

type MessageParam = Anthropic.Beta.BetaMessageParam;
type ToolResult = Anthropic.Beta.BetaToolResultBlockParam;
type ResultContent = Anthropic.Beta.BetaTextBlockParam | Anthropic.Beta.BetaImageBlockParam;

export type Outcome = 'success' | 'blocked' | 'gave_up' | 'stopped' | 'capped' | 'error';

export interface SessionResult {
  outcome: Outcome;
  reason: string | null;
  summary: string;
  steps: number;
  newFindings: number;
  /** Screen ids scored in this session (all attempts) — where a crashed sweep resumes from. */
  scored?: string[];
}

export interface SessionDeps {
  anthropic: Anthropic;
  model: string;
  store: Store;
  budget: Budget;
  book: FindingsBook;
  runId: string;
  cohort: string;
  dayKey: () => string;
  /** Polled at most every HARD_CAPS.stopPollMs. */
  stopRequested: () => Promise<boolean>;
  onUsage?: (d: UsageDelta) => void;
  log: (msg: string) => void;
  /** Every view goes into the run's artifact folder (screens in order for the owner). */
  shots?: ShotLog;
  /** Retry pause (tests pass a no-op). */
  sleep?: (ms: number) => Promise<void>;
  /** Owner rules (file + panel notes) and what was learned from the owner's triage. */
  owner?: { rules: readonly OwnerRule[]; learning: Learning };
}

/** The Android-back owner rule; its findings cite it when the rule exists. */
export const ANDROID_BACK_RULE = 'OWN-007';

const imageBlock = (png: Buffer): ResultContent => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: png.toString('base64') } });

export interface SessionOptions {
  /** Design sweep resumed from this checkpoint (plan.ts). */
  resumeFrom?: string | null;
  /** After a browser crash: steps already used and the session's start (caps cover the whole mission). */
  stepOffset?: number;
  startedAt?: number;
  /** Shared across a crashed session's attempts. */
  scored?: Set<string>;
}

/** Log the process memory every this many steps (crash diagnosis on CI). */
const MEMORY_LOG_EVERY = 10;

/**
 * One attempt of a session. A browser crash (renderer / process gone) does not throw: it ends
 * the attempt as error/browser_crashed with the screens scored so far, and the caller
 * (./mission-runner.ts) decides whether to resume in a fresh browser.
 */
export async function runSession(
  deps: SessionDeps,
  persona: Persona,
  mission: Mission,
  deviceId: string,
  driver: SessionDriver,
  opts: SessionOptions = {},
): Promise<SessionResult> {
  const scored = opts.scored ?? new Set<string>();
  const progress = { step: opts.stepOffset ?? 0, newFindings: 0 };
  try {
    const r = await runLoop(deps, persona, mission, deviceId, driver, opts, scored, progress);
    return { ...r, scored: Array.from(scored) };
  } catch (e) {
    if (!isBrowserCrash(e)) throw e;
    deps.log(`browser crashed at step ${progress.step} (${e instanceof Error ? e.message.split('\n')[0].slice(0, 160) : 'unknown'}) · ${memoryLine()}`);
    return { outcome: 'error', reason: 'browser_crashed', summary: '', steps: progress.step, newFindings: progress.newFindings, scored: Array.from(scored) };
  } finally {
    deps.shots?.flush();
  }
}

async function runLoop(
  deps: SessionDeps,
  persona: Persona,
  mission: Mission,
  deviceId: string,
  driver: SessionDriver,
  opts: SessionOptions,
  scored: Set<string>,
  progress: { step: number; newFindings: number },
): Promise<SessionResult> {
  const startedAt = opts.startedAt ?? Date.now();
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: 'text', text: buildSystemPrompt(persona, mission, { deviceId, resumeFrom: opts.resumeFrom ?? null, owner: deps.owner }), cache_control: { type: 'ephemeral' } },
  ];
  const ruleIds = new Set([...Array.from(RULE_IDS), ...Array.from(ownerRuleIds(deps.owner?.rules ?? []))]);
  let step = progress.step;
  let newFindings = 0;
  const note = (n: number) => {
    newFindings += n;
    progress.newFindings = newFindings;
  };
  let lastStopPoll = 0;
  /** The screen id the tester last scored — findings without their own screen id go under it. */
  let currentScreen: string | null = null;
  let view: StepView = await driver.view();
  captureShot(deps, mission, deviceId, view, step);
  if (view.blocked === 'not_signed_in_as_tester') return { outcome: 'error', reason: 'not_signed_in_as_tester', summary: '', steps: step, newFindings: 0 };
  note(await recordLint(deps, mission, persona, deviceId, view, step, driver, currentScreen));

  const messages: MessageParam[] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: observationText({ url: view.url, elements: view.observation.elements, lint: view.lint, blocked: view.blocked, events: [], note: opts.stepOffset ? 'The browser was restarted after a crash; you are signed in again. Continue the mission from the first screen you have not scored yet.' : 'You are signed in and the app is open. Begin the mission.' }) },
        imageBlock(view.png),
      ],
    },
  ];

  const finish = (outcome: Outcome, reason: string | null, summary = ''): SessionResult => ({ outcome, reason, summary, steps: step, newFindings });

  while (true) {
    const gate = sessionGate(step, startedAt, Date.now(), mission.budget);
    if (!gate.ok) {
      note(await recordRunnerFinding(deps, mission, persona, deviceId, view, step, driver, gate.reason));
      return finish('capped', gate.reason);
    }
    const money = deps.budget.money();
    if (!money.ok) return finish('capped', money.reason);
    if (Date.now() - lastStopPoll >= HARD_CAPS.stopPollMs) {
      lastStopPoll = Date.now();
      if (await deps.stopRequested()) return finish('stopped', 'stop_requested');
    }
    step += 1;
    progress.step = step;
    if (step % MEMORY_LOG_EVERY === 0) deps.log(`step ${step} · ${memoryLine()}`);

    const reply = await withModelRetry(
      () =>
        deps.anthropic.beta.messages.create({
        model: deps.model,
        max_tokens: MAX_TOKENS_PER_TURN,
        system,
        tools: TOOLS,
        messages,
        output_config: { effort: 'medium' },
        betas: ['context-management-2025-06-27'],
        context_management: {
          edits: [
            {
              type: 'clear_tool_uses_20250919',
              trigger: { type: 'tool_uses', value: KEEP_TOOL_RESULTS + 3 },
              keep: { type: 'tool_uses', value: KEEP_TOOL_RESULTS },
              exclude_tools: ['report_finding', 'end_mission'],
            },
          ],
        },
      }),
      { log: deps.log, sleep: deps.sleep },
    );
    if (!reply.ok) return finish('error', 'model_call_failed');
    const res: Anthropic.Beta.BetaMessage = reply.value;

    const delta = deps.budget.record(res.usage);
    deps.onUsage?.(delta);
    await deps.store.addUsage(deps.dayKey(), delta, false).catch(() => deps.log('usage write failed'));

    if (res.stop_reason === 'refusal') return finish('blocked', 'model_refusal');
    messages.push({ role: 'assistant', content: res.content });

    const toolUses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (toolUses.length === 0) {
      messages.push({ role: 'user', content: 'Use one of the tools: act on the screen, report_finding, or end_mission.' });
      continue;
    }

    const results: ToolResult[] = [];
    let ended: { outcome: 'success' | 'blocked' | 'gave_up'; summary: string } | null = null;
    let needsView = false;
    const pendingBack: Array<{ outcome: BackOutcome; screen: string | null }> = [];
    for (const tu of toolUses) {
      const parsed = parseToolCall(tu.name, tu.input, ruleIds);
      if (!parsed.ok) {
        results.push({ type: 'tool_result', tool_use_id: tu.id, is_error: true, content: parsed.error });
        continue;
      }
      const call = parsed.call;
      if (call.name === 'end_mission') {
        ended = { outcome: call.outcome, summary: call.summary };
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: 'ok' });
        continue;
      }
      if (call.name === 'score_screen') {
        currentScreen = call.screen;
        scored.add(call.screen);
        const b = baseFinding(deps, mission, persona, deviceId, view, step, driver, null);
        const f = buildScoreFinding(b, call.screen, call.scores, call.notes);
        f.id = findingDocId(deps.runId, f.fingerprint);
        deps.shots?.score(call.screen, call.scores, f.id);
        if (await persist(deps, f, view, {})) note(1);
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: scoreAck(call.screen, call.scores) });
        continue;
      }
      if (call.name === 'report_finding') {
        const isNew = await recordModelFinding(deps, mission, persona, deviceId, view, step, driver, call, call.screen ?? currentScreen);
        if (isNew) note(1);
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: isNew ? 'recorded' : 'already recorded (counted)' });
        continue;
      }
      if (call.name === 'back_button') {
        try {
          const outcome = await driver.backButton();
          // Recorded with the fresh screen below (one view per turn: view() drains the error log).
          if (!outcome.ok) pendingBack.push({ outcome, screen: currentScreen });
          results.push({ type: 'tool_result', tool_use_id: tu.id, content: backResultText(outcome) });
        } catch (e) {
          results.push({ type: 'tool_result', tool_use_id: tu.id, is_error: true, content: e instanceof Error ? e.message.slice(0, 300) : 'back failed' });
        }
        needsView = true;
        continue;
      }
      try {
        await driver.act(call);
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: 'done' });
        needsView = true;
      } catch (e) {
        if (isBrowserCrash(e)) throw e;
        results.push({ type: 'tool_result', tool_use_id: tu.id, is_error: true, content: e instanceof Error ? e.message.slice(0, 300) : 'action failed' });
        needsView = true;
      }
    }
    if (ended) {
      return finish(ended.outcome, null, ended.summary);
    }

    const events = await driver.fireWorldEvents(step);
    if (needsView || events.length) {
      view = await driver.view();
      captureShot(deps, mission, deviceId, view, step);
      if (view.blocked === 'not_signed_in_as_tester') return finish('error', 'not_signed_in_as_tester');
      note(await recordLint(deps, mission, persona, deviceId, view, step, driver, currentScreen));
      for (const pb of pendingBack) if (await recordBackFinding(deps, mission, persona, deviceId, view, step, driver, pb.outcome, pb.screen, ruleIds)) note(1);
      // The fresh screen goes with the last tool result of this turn.
      const last = results[results.length - 1];
      const text = observationText({ url: view.url, elements: view.observation.elements, lint: view.lint, blocked: view.blocked, events });
      last.content = [{ type: 'text', text: typeof last.content === 'string' ? `${last.content}\n${text}` : text }, imageBlock(view.png)];
    }
    messages.push({ role: 'user', content: results });
  }
}

function captureShot(deps: SessionDeps, mission: Mission, deviceId: string, view: StepView, step: number): void {
  if (!deps.shots) return;
  let path = '/';
  try {
    path = new URL(view.url).pathname;
  } catch {
    /* keep / */
  }
  deps.shots.capture(mission, deviceId, step, path, routePattern(path), view.jpeg);
}

// ── Findings ──────────────────────────────────────────────────────────────────

function baseFinding(deps: SessionDeps, mission: Mission, persona: Persona, deviceId: string, view: StepView, step: number, driver: SessionDriver, screen: string | null) {
  const route = routePattern(new URL(view.url).pathname);
  return {
    runId: deps.runId,
    mission: mission.id,
    persona: persona.id,
    device: deviceId,
    cohort: deps.cohort,
    url: new URL(view.url).pathname,
    route,
    step,
    repro: withScreen(driver.repro, screen),
    count: 1,
    createdAtMs: Date.now(),
  };
}

/** The owner dismissed this rule on this screen repeatedly → not written (owner/learning.ts). */
function suppressed(deps: SessionDeps, f: Finding, screen: string | null): boolean {
  if (f.rule === SCORE_RULE_ID) return false;
  if (!isSuppressed(deps.owner?.learning ?? EMPTY_LEARNING, f.rule, [screen, f.route])) return false;
  deps.log(`suppressed by owner triage: ${f.rule} on ${screen ?? f.route}`);
  return true;
}

async function persist(deps: SessionDeps, f: Finding, view: StepView, shotCache: { path?: string | null }, screen: string | null = null): Promise<boolean> {
  if (suppressed(deps, f, screen)) return false;
  const { isNew, finding } = deps.book.add(f);
  const id = findingDocId(deps.runId, finding.fingerprint);
  if (f.rule !== SCORE_RULE_ID) deps.shots?.finding(id);
  if (!isNew) {
    await deps.store.bumpFinding(id).catch(() => {});
    return false;
  }
  if (shotCache.path === undefined) {
    // Unique per finding (the qa-runner may only CREATE objects, never overwrite).
    shotCache.path = await deps.store.uploadScreenshot(`${SCREENSHOT_PREFIX}/${deps.runId}/${f.mission}/${String(f.step).padStart(3, '0')}-${f.fingerprint.slice(0, 8)}.png`, view.png);
  }
  finding.screenshot = shotCache.path ?? null;
  await deps.store.saveFinding(id, finding).catch(() => deps.log('finding write failed'));
  return true;
}

async function recordLint(
  deps: SessionDeps,
  mission: Mission,
  persona: Persona,
  deviceId: string,
  view: StepView,
  step: number,
  driver: SessionDriver,
  screen: string | null,
): Promise<number> {
  if (view.blocked) return 0;
  const shot: { path?: string | null } = {};
  let n = 0;
  for (const issue of view.lint) {
    const b = baseFinding(deps, mission, persona, deviceId, view, step, driver, screen);
    // Runtime errors vary per step — one finding per screen and severity, not per message.
    const label = issue.rule === 'STAB-CONSOLE' ? issue.severity : (issue.examples[0] ?? '');
    const f: Finding = {
      ...b,
      id: '',
      fingerprint: fingerprint(b.route, issue.rule, screen ? `${screen}|${label}` : label),
      category: issue.rule === 'STAB-CONSOLE' ? 'broken' : issue.rule.startsWith('MOB-') ? 'a11y' : 'design-rule',
      severity: issue.severity,
      rule: issue.rule,
      title: issue.title,
      expected: lintExpected(issue),
      actual: issue.examples.join(' | '),
      screenshot: null,
      confidence: 1,
      source: 'lint',
    };
    f.id = findingDocId(deps.runId, f.fingerprint);
    if (await persist(deps, f, view, shot, screen)) n += 1;
  }
  return n;
}

function lintExpected(i: LintIssue): string {
  return `לפי החוק ${i.rule}`;
}

async function recordModelFinding(
  deps: SessionDeps,
  mission: Mission,
  persona: Persona,
  deviceId: string,
  view: StepView,
  step: number,
  driver: SessionDriver,
  c: Extract<ToolCall, { name: 'report_finding' }>,
  screen: string | null,
): Promise<boolean> {
  const b = baseFinding(deps, mission, persona, deviceId, view, step, driver, screen);
  const label = c.element || c.title;
  const f: Finding = {
    ...b,
    id: '',
    fingerprint: fingerprint(b.route, c.rule ?? c.category, screen ? `${screen}|${label}` : label),
    category: c.category,
    severity: c.severity,
    rule: c.rule,
    title: c.title,
    expected: c.expected,
    actual: c.actual,
    screenshot: null,
    confidence: c.confidence,
    source: 'llm',
  };
  f.id = findingDocId(deps.runId, f.fingerprint);
  return persist(deps, f, view, {}, screen);
}

/** A wrong Android back outcome (android-back.ts), recorded by the runner itself. */
async function recordBackFinding(
  deps: SessionDeps,
  mission: Mission,
  persona: Persona,
  deviceId: string,
  view: StepView,
  step: number,
  driver: SessionDriver,
  o: BackOutcome,
  screen: string | null,
  ruleIds: ReadonlySet<string>,
): Promise<boolean> {
  const b = baseFinding(deps, mission, persona, deviceId, view, step, driver, screen);
  const rule = ruleIds.has(ANDROID_BACK_RULE) ? ANDROID_BACK_RULE : null;
  const route = routePattern(o.from);
  const f: Finding = {
    ...b,
    url: o.from,
    route,
    id: '',
    fingerprint: fingerprint(route, rule ?? 'android-back', `${screen ?? ''}|back:${o.kind}`),
    category: 'ux',
    severity: o.severity ?? 'P2',
    rule,
    title: o.midFlow ? 'כפתור חזרה באנדרואיד שובר את התהליך' : 'כפתור חזרה באנדרואיד לא מתנהג כמצופה',
    expected: 'חזרה סוגרת מגירה פתוחה, אחרת חוזרת שלב/מסך אחורה; אף פעם לא דף ריק ולא יציאה מהאפליקציה באמצע תהליך',
    actual: `${o.kind}: ${o.he}`,
    screenshot: null,
    confidence: o.confidence,
    source: 'runner',
  };
  f.id = findingDocId(deps.runId, f.fingerprint);
  return persist(deps, f, view, {}, screen);
}

async function recordRunnerFinding(deps: SessionDeps, mission: Mission, persona: Persona, deviceId: string, view: StepView, step: number, driver: SessionDriver, reason: RefuseReason): Promise<number> {
  const b = baseFinding(deps, mission, persona, deviceId, view, step, driver, null);
  const f: Finding = {
    ...b,
    id: '',
    fingerprint: fingerprint(`mission:${mission.id}`, 'runner', reason),
    category: 'ux',
    severity: 'P1',
    rule: null,
    title: reason === 'steps_per_session_cap' ? 'הבודק לא סיים את המשימה בתקציב הצעדים' : 'הבודק לא סיים את המשימה בזמן',
    expected: `לסיים את "${mission.goal.slice(0, 80)}" בתוך התקציב`,
    actual: `נעצר אחרי ${step} צעדים (${reason})`,
    screenshot: null,
    confidence: 0.6,
    source: 'runner',
  };
  f.id = findingDocId(deps.runId, f.fingerprint);
  return (await persist(deps, f, view, {})) ? 1 : 0;
}
