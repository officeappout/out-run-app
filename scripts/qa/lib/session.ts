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
}

const imageBlock = (png: Buffer): ResultContent => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: png.toString('base64') } });

export async function runSession(deps: SessionDeps, persona: Persona, mission: Mission, deviceId: string, driver: SessionDriver): Promise<SessionResult> {
  const startedAt = Date.now();
  const system: Anthropic.Beta.BetaTextBlockParam[] = [{ type: 'text', text: buildSystemPrompt(persona, mission), cache_control: { type: 'ephemeral' } }];
  let step = 0;
  let newFindings = 0;
  let lastStopPoll = 0;
  let view: StepView = await driver.view();
  if (view.blocked === 'not_signed_in_as_tester') return { outcome: 'error', reason: 'not_signed_in_as_tester', summary: '', steps: 0, newFindings: 0 };
  newFindings += await recordLint(deps, mission, persona, deviceId, view, step, driver);

  const messages: MessageParam[] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: observationText({ url: view.url, elements: view.observation.elements, lint: view.lint, blocked: view.blocked, events: [], note: 'You are signed in and the app is open. Begin the mission.' }) },
        imageBlock(view.png),
      ],
    },
  ];

  const finish = (outcome: Outcome, reason: string | null, summary = ''): SessionResult => ({ outcome, reason, summary, steps: step, newFindings });

  while (true) {
    const gate = sessionGate(step, startedAt, Date.now(), mission.budget);
    if (!gate.ok) {
      newFindings += await recordRunnerFinding(deps, mission, persona, deviceId, view, step, driver, gate.reason);
      return finish('capped', gate.reason);
    }
    const money = deps.budget.money();
    if (!money.ok) return finish('capped', money.reason);
    if (Date.now() - lastStopPoll >= HARD_CAPS.stopPollMs) {
      lastStopPoll = Date.now();
      if (await deps.stopRequested()) return finish('stopped', 'stop_requested');
    }
    step += 1;

    let res: Anthropic.Beta.BetaMessage;
    try {
      res = await deps.anthropic.beta.messages.create({
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
      });
    } catch (e) {
      deps.log(`model call failed: ${e instanceof Error ? e.name : 'unknown'}`);
      return finish('error', 'model_call_failed');
    }

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
    for (const tu of toolUses) {
      const parsed = parseToolCall(tu.name, tu.input);
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
      if (call.name === 'report_finding') {
        const isNew = await recordModelFinding(deps, mission, persona, deviceId, view, step, driver, call);
        if (isNew) newFindings += 1;
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: isNew ? 'recorded' : 'already recorded (counted)' });
        continue;
      }
      try {
        await driver.act(call);
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: 'done' });
        needsView = true;
      } catch (e) {
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
      if (view.blocked === 'not_signed_in_as_tester') return finish('error', 'not_signed_in_as_tester');
      newFindings += await recordLint(deps, mission, persona, deviceId, view, step, driver);
      // The fresh screen goes with the last tool result of this turn.
      const last = results[results.length - 1];
      const text = observationText({ url: view.url, elements: view.observation.elements, lint: view.lint, blocked: view.blocked, events });
      last.content = [{ type: 'text', text: typeof last.content === 'string' ? `${last.content}\n${text}` : text }, imageBlock(view.png)];
    }
    messages.push({ role: 'user', content: results });
  }
}

// ── Findings ──────────────────────────────────────────────────────────────────

function baseFinding(deps: SessionDeps, mission: Mission, persona: Persona, deviceId: string, view: StepView, step: number, driver: SessionDriver) {
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
    repro: driver.repro.slice(-25),
    count: 1,
    createdAtMs: Date.now(),
  };
}

async function persist(deps: SessionDeps, f: Finding, view: StepView, shotCache: { path?: string | null }): Promise<boolean> {
  const { isNew, finding } = deps.book.add(f);
  const id = findingDocId(deps.runId, finding.fingerprint);
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

async function recordLint(deps: SessionDeps, mission: Mission, persona: Persona, deviceId: string, view: StepView, step: number, driver: SessionDriver): Promise<number> {
  if (view.blocked) return 0;
  const shot: { path?: string | null } = {};
  let n = 0;
  for (const issue of view.lint) {
    const b = baseFinding(deps, mission, persona, deviceId, view, step, driver);
    const f: Finding = {
      ...b,
      id: '',
      // Runtime errors vary per step — one finding per screen and severity, not per message.
      fingerprint: fingerprint(b.route, issue.rule, issue.rule === 'STAB-CONSOLE' ? issue.severity : (issue.examples[0] ?? '')),
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
    if (await persist(deps, f, view, shot)) n += 1;
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
): Promise<boolean> {
  const b = baseFinding(deps, mission, persona, deviceId, view, step, driver);
  const f: Finding = {
    ...b,
    id: '',
    fingerprint: fingerprint(b.route, c.rule ?? c.category, c.element || c.title),
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
  return persist(deps, f, view, {});
}

async function recordRunnerFinding(deps: SessionDeps, mission: Mission, persona: Persona, deviceId: string, view: StepView, step: number, driver: SessionDriver, reason: RefuseReason): Promise<number> {
  const b = baseFinding(deps, mission, persona, deviceId, view, step, driver);
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
