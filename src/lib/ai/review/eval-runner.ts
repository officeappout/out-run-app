/**
 * AI coach regression runner — replays one EvalCase through the REAL turn engine
 * (runCoachTurn, the real system prompt, tool definitions, safety gate, client-tool round
 * trip) with everything outside the engine simulated:
 *
 *   model          injected: the live Anthropic client (scripts/ai-coach-evals.ts --live) or
 *                  scriptedMockModel() below (default; validates the harness, costs nothing)
 *   server tools   answered from the case's frozen context (sheet / schedule / progress);
 *                  handoff_to_human is simulated ({sent:true}) and writes nothing
 *   client tools   generate_workout → an injected simulator: stubWorkoutGenerator() (default,
 *                  obeys the input exactly, so it isolates the MODEL's behaviour) or the
 *                  offline engine (scripts/ai-coach-evals/offline-generator.ts)
 *
 * No Firebase, no network of its own. Pure apart from the injected calls.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { COACH_MAX_TOOL_ROUNDS, COACH_MODEL_MAX_TOKENS, COACH_SYSTEM_PROMPT, buildSessionContext } from '@/lib/ai/coach/persona';
import { detectSafetyTrigger, safetyReply } from '@/lib/ai/coach/safety';
import { coachToolDefinitions, type ClientToolOutcome, type GenerateWorkoutInputT } from '@/lib/ai/coach/tools';
import {
  clientOutcomeToToolResult,
  historyToModelMessages,
  newTurnState,
  resumeWithClientResult,
  runCoachTurn,
  type ToolExecResult,
  type TurnState,
} from '@/lib/ai/coach/turn-engine';
import { daysBetween, type UserContextSheet } from '@/lib/ai/coach/context-sheet';
import { typoHints } from '@/lib/ai/coach/intent';
import { chipsForTurn } from '@/lib/ai/coach/action-chips';
import { estimateCostUsd, usageFromSdk, type AiUsage } from '@/lib/ai/ai-pricing';
import { checkAssertions, type AssertionResult, type EvalCase, type EvalRunResult, type EvalToolCall } from './eval-case';
import { appHelpToolResult, type GetAppHelpInputT } from '@/lib/ai/coach/app-help/retrieve';
import { buildScheduleProposal, proposalToolResult } from '@/lib/ai/coach/schedule-proposal/build-proposal';
import type { ProposeScheduleChangeInputT } from '@/lib/ai/coach/schedule-proposal/types';
import type { AdvisorProfile } from '@/features/schedule/advisor/types';
import { phase2TurnExtras } from '@/lib/ai/coach/phase2-turn';
import { renderMemoryBlock } from '@/lib/ai/coach/memory/inject';
import { simulateRound4Tool } from './eval-round4';
import { ROUND4_NOTE, coachSystemPrompt } from '@/lib/ai/coach/round4/prompt';
import { newRound4TurnState, type Round4TurnState } from '@/lib/ai/coach/round4/types';
import { round4TurnActions } from '@/lib/ai/coach/round4/turn-extras';

export type CallModel = (params: Anthropic.MessageStreamParams, onText: (delta: string) => void) => Promise<Anthropic.Message>;

/** A simulated generate_workout: the outcome the model reads + the full record the assertions read. */
export interface SimulatedWorkout {
  outcome: ClientToolOutcome;
  /** Richer than the outcome: per-exercise domain / locations, decision reasons. */
  record: Record<string, unknown> | null;
}
export type SimulateWorkout = (input: GenerateWorkoutInputT, ctx: EvalCase['context']) => Promise<SimulatedWorkout>;

export interface EvalCaseReport {
  id: string;
  name: string;
  pass: boolean;
  assertions: AssertionResult[];
  run: EvalRunResult;
  usage: AiUsage;
  costUsd: number;
  error: string | null;
}

// ─── Simulated server tools ──────────────────────────────────────────────────

function minimalSheet(ctx: EvalCase['context']): Record<string, unknown> {
  return {
    firstName: ctx.firstName,
    gender: ctx.gender,
    ageBand: null,
    goals: { mainGoal: null, selected: [] },
    primaryTrack: null,
    programs: [],
    injuries: [],
    streakDays: null,
    lastWorkouts: [],
    today: [],
    thisWeek: [],
    preferredTrainingTime: null,
    equipment: { home: [], office: [], outdoor: [] },
    area: null,
  };
}

/** Per-run state of the phase 2 simulations (a proposal prepared this turn). */
export interface SimTurn {
  proposalCreated: boolean;
  /** Kelly round 4: set while the case runs with flags.round4. */
  round4?: Round4TurnState;
}

export function simulateServerTool(
  name: string,
  input: unknown,
  ctx: EvalCase['context'],
  shown: Map<string, Record<string, unknown>>,
  turn: SimTurn = { proposalCreated: false },
): ToolExecResult {
  const sheet = ctx.sheet ?? minimalSheet(ctx);
  const json = (v: unknown): ToolExecResult => ({ content: JSON.stringify(v) });
  switch (name) {
    case 'get_user_context':
      return json(sheet);
    case 'get_schedule': {
      const { from, to } = input as { from: string; to: string };
      const days = new Set(daysBetween(from, to));
      const week = Array.isArray(sheet.thisWeek) ? (sheet.thisWeek as Array<{ date?: string }>) : [];
      return json({ from, to, entries: week.filter((e) => typeof e.date === 'string' && days.has(e.date)) });
    }
    case 'get_progress': {
      if (ctx.progress) return json(ctx.progress);
      const last = Array.isArray(sheet.lastWorkouts) ? (sheet.lastWorkouts as Array<{ date?: string; minutes?: number }>) : [];
      return json({
        range: (input as { range?: string })?.range ?? 'week',
        workouts: last.length,
        totalMinutes: last.reduce((s, w) => s + (w.minutes ?? 0), 0),
        activeDays: new Set(last.map((w) => w.date)).size,
        byType: {},
        programs: sheet.programs ?? [],
        streakDays: sheet.streakDays ?? null,
      });
    }
    case 'explain_workout': {
      const w = shown.get((input as { workoutId: string }).workoutId);
      if (!w) return { content: 'No workout with this id was shown in this conversation.', isError: true };
      return json({ title: w.title, minutes: w.minutes, exercises: Array.isArray(w.exercises) ? w.exercises.length : 0, reasons: w.reasons ?? [] });
    }
    case 'handoff_to_human':
      return json({ sent: true });
    // Kelly phase 2: the REAL pure retrieval and proposal builder (nothing is written).
    case 'get_app_help':
      return json(appHelpToolResult(input as GetAppHelpInputT, turn.round4 ? { round4: true } : {}));
    case 'propose_schedule_change': {
      const built = ctx.profile
        ? buildScheduleProposal(
            { todayKey: ctx.todayKey, profile: ctx.profile as AdvisorProfile, workouts: [], scheduleDays: null },
            input as ProposeScheduleChangeInputT,
          )
        : ({ ok: false, reason: 'no_strength' } as const);
      if (built.ok) turn.proposalCreated = true;
      return json(proposalToolResult(built));
    }
    default: {
      const r4 = turn.round4 ? simulateRound4Tool(name, input, ctx, turn.round4) : null;
      return r4 ?? { content: `unknown tool ${name}`, isError: true };
    }
  }
}

// ─── Stub generator (default client-tool simulator) ──────────────────────────

const STUB_EXERCISES: Record<string, Array<{ name: string; locations: string[] }>> = {
  core: [
    { name: 'פלאנק', locations: ['home', 'park', 'office', 'street'] },
    { name: 'כפיפות בטן', locations: ['home', 'park', 'office', 'street'] },
    { name: 'הרמות רגליים בשכיבה', locations: ['home', 'park', 'street'] },
    { name: 'פלאנק צד', locations: ['home', 'park', 'office', 'street'] },
    { name: 'מטפס הרים', locations: ['home', 'park', 'street'] },
  ],
  push: [
    { name: 'שכיבות סמיכה', locations: ['home', 'park', 'office', 'street'] },
    { name: 'שכיבות סמיכה צרות', locations: ['home', 'park', 'street'] },
    { name: 'מקבילים', locations: ['park'] },
  ],
  pull: [
    { name: 'מתח', locations: ['park'] },
    { name: 'חתירה אוסטרלית', locations: ['park'] },
    { name: 'חתירה עם מגבת', locations: ['home', 'office'] },
  ],
  legs: [
    { name: 'סקוואט', locations: ['home', 'park', 'office', 'street'] },
    { name: 'מכרעים', locations: ['home', 'park', 'office', 'street'] },
    { name: 'גשר ישבן', locations: ['home', 'park', 'street'] },
  ],
};

/**
 * Obeys the input exactly (domains, location, minutes), so a failing assertion in a mock /
 * stub run is always the model's (or the mapping's) fault, never the engine's.
 */
export const stubWorkoutGenerator: SimulateWorkout = async (input, ctx) => {
  const domains = input.domains.length ? input.domains : ['push', 'pull', 'legs', 'core'];
  const count = Math.min(8, Math.max(3, Math.round(input.durationMin / 4)));
  const exercises: Array<{ name: string; sets: number; reps: number; seconds: null; domain: string; locations: string[] }> = [];
  for (let i = 0; exercises.length < count && i < 40; i++) {
    const d = domains[i % domains.length];
    const pool = (STUB_EXERCISES[d] ?? STUB_EXERCISES.core).filter((e) => e.locations.includes(input.location));
    const pick = pool[Math.floor(i / domains.length) % Math.max(1, pool.length)];
    if (!pick) continue;
    exercises.push({ name: pick.name, sets: 3, reps: 10, seconds: null, domain: d, locations: pick.locations });
  }
  const workoutId = `ai-stub-${input.location}-${input.durationMin}-${domains.join('-')}`.slice(0, 60);
  const title = 'אימון מותאם';
  const result = {
    workoutId,
    title,
    minutes: input.durationMin,
    location: input.location,
    exercises: exercises.map(({ name, sets, reps, seconds }) => ({ name, sets, reps, seconds })),
    // Kelly round 4 cases: the engine flagged "below the user's level here".
    ...(ctx?.round4?.levelCeiling ? { levelCeiling: true } : {}),
  };
  return { outcome: { ok: true, result }, record: { ...result, exercises, reasons: ctx?.round4?.levelCeiling ? [{ code: 'LEVEL_CEILING' }] : [] } };
};

// ─── Scripted mock model (default: harness validation, no API) ───────────────

function addDays(key: string, n: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * A fake model that behaves like a GOOD coach for the case: it calls the tools the
 * assertions ask for (with inputs that satisfy them), then answers in short masculine
 * Hebrew. Running the fixtures with it must pass every case — that proves the harness
 * (engine wiring, simulators, assertions) works without spending anything.
 */
export function scriptedMockModel(c: EvalCase): CallModel {
  let round = 0;
  let textRound = 0;
  return async (params, onText) => {
    round++;
    const a = c.assertions;
    const need = a.mustCallTool ? (Array.isArray(a.mustCallTool) ? a.mustCallTool : [a.mustCallTool]) : [];
    const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    const base = { id: `mock-${round}`, type: 'message', role: 'assistant', model: params.model, stop_sequence: null, usage } as const;
    if (round === 1 && need.length > 0 && params.tool_choice?.type !== 'none') {
      const content: Anthropic.ToolUseBlock[] = need.map((name, i) => {
        let input: Record<string, unknown> = {};
        if (name === 'generate_workout') {
          input = {
            durationMin: a.minutes ?? 20,
            location: a.location ?? 'park',
            difficulty: a.difficulty ?? 2,
            domains: a.domains ?? [],
            equipment: [],
          };
        } else if (name === 'get_schedule') {
          input = { from: c.context.todayKey, to: addDays(c.context.todayKey, 6) };
        } else if (name === 'get_progress') {
          input = { range: 'week' };
        } else if (name === 'get_app_help') {
          input = { query: c.message };
        }
        if (c.mock?.toolInputs?.[name]) input = { ...c.mock.toolInputs[name] };
        return { type: 'tool_use', id: `toolu_mock_${i}`, name, input } as Anthropic.ToolUseBlock;
      });
      return { ...base, content, stop_reason: 'tool_use' } as unknown as Anthropic.Message;
    }
    const text = c.mock ? c.mock.replies[Math.min(textRound, c.mock.replies.length - 1)] : goodMockReply(c, params);
    textRound++;
    onText(text);
    return { ...base, content: [{ type: 'text', text, citations: null }], stop_reason: 'end_turn' } as unknown as Anthropic.Message;
  };
}

function systemText(params: Anthropic.MessageStreamParams): string {
  const sys = params.system;
  if (typeof sys === 'string') return sys;
  return (sys ?? []).map((b) => b.text).join('\n');
}

/** What a good coach would say, from what the turn actually has (system context + tools). */
function goodMockReply(c: EvalCase, params: Anthropic.MessageStreamParams): string {
  const a = c.assertions;
  const need = a.mustCallTool ? (Array.isArray(a.mustCallTool) ? a.mustCallTool : [a.mustCallTool]) : [];
  const sys = systemText(params);
  // A level check note that allows a suggestion → one short sentence, once (persona.ts).
  const gap = sys.match(/- Level check: the user never checked a level for ([^,(.]+?)(?: \(part of [^)]*\))?[,.]? /);
  const gapLine = gap ? ` עוד אין רמה ב${gap[1].trim()}. אפשר לבדוק רמה בכפתור למטה, וככה האימונים יתאימו בדיוק.` : '';
  if (need.includes('generate_workout')) return `בניתי לך אימון ברמה המתאימה לך. אפשר ללחוץ על הכרטיס כדי להתחיל.${gapLine}`;
  if (need.includes('get_progress')) return `ההתקדמות נראית יציבה, וכדאי להמשיך באותו קצב.${gapLine}`;
  // A typo hint in the session context → confirm the intended word first.
  const typo = sys.match(/Likely typos[^\n]*?"([^"]+)" probably means "([^"]+)"/);
  if (typo) return `התכוונת "${typo[2]}"? כן, הצוות משפר אותי לפי השיחות.`;
  // Schedule: the per-day lines of the pre-loaded sheet (renderSheet), without the ISO date.
  if (a.namesAllScheduledDays || need.includes('get_schedule')) {
    const lines = sys
      .split('\n')
      .filter((l) => /^ {2}יום /.test(l))
      .map((l) => l.trim().replace(/\s\d{4}-\d{2}-\d{2}/, '').replace(/, completed$/, ', בוצע'))
      .slice(0, 5);
    return lines.length ? `${lines.join('\n')}\nאפשר לפתוח את הלו״ז בכפתור למטה.` : 'השבוע אין אימונים מתוכננים.';
  }
  return 'אני זוכר את מה שכתבנו בשיחה הזאת.';
}

// ─── Replay ──────────────────────────────────────────────────────────────────

function parseMaybeJson(s: unknown): unknown {
  if (typeof s !== 'string') return s;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function workoutDomainsOf(calls: EvalToolCall[]): string[] | null {
  const d = (calls.find((t) => t.name === 'generate_workout')?.input as { domains?: unknown } | undefined)?.domains;
  return Array.isArray(d) ? d.filter((x): x is string => typeof x === 'string') : null;
}

function refusedDomainsOf(calls: EvalToolCall[]): string[] {
  for (const t of calls) {
    const r = t.result as { ok?: boolean; error?: string; domains?: unknown } | null;
    if (t.name === 'generate_workout' && t.isError && r?.error === 'needs_assessment' && Array.isArray(r.domains)) {
      return r.domains.filter((x): x is string => typeof x === 'string');
    }
  }
  return [];
}

export async function runEvalCase(
  c: EvalCase,
  deps: { callModel: CallModel; model: string; simulateWorkout?: SimulateWorkout },
): Promise<EvalCaseReport> {
  const ctx = c.context;
  const simulate = deps.simulateWorkout ?? stubWorkoutGenerator;
  const toolCalls: EvalToolCall[] = [];
  const shown = new Map<string, Record<string, unknown>>();
  const usage: AiUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  let costUsd = 0;
  const finish = (run: EvalRunResult, error: string | null): EvalCaseReport => {
    const assertions = error ? [] : checkAssertions(c.assertions, run);
    return {
      id: c.id,
      name: c.name,
      pass: !error && assertions.every((x) => x.pass),
      assertions,
      run,
      usage,
      costUsd,
      error,
    };
  };

  const sheet = (ctx.sheet ?? minimalSheet(ctx)) as unknown as UserContextSheet;
  const sheetWeekDates = (Array.isArray(sheet.thisWeek) ? sheet.thisWeek : [])
    .filter((e) => e && e.type !== 'rest' && typeof e.date === 'string')
    .map((e) => e.date);
  const phase2 = c.flags?.phase2 === true;
  const round4 = c.flags?.round4 === true;
  const simTurn: SimTurn = { proposalCreated: false, ...(round4 ? { round4: newRound4TurnState() } : {}) };
  const finalRun = (finalText: string): EvalRunResult => {
    const toolNames = toolCalls.map((t) => t.name);
    let chips: string[] = chipsForTurn({
      userText: c.message,
      toolNames,
      sheet,
      workoutDomains: workoutDomainsOf(toolCalls),
      needsAssessmentDomains: refusedDomainsOf(toolCalls),
      // Like the route: a case without history opens a new conversation; history carries no chips.
      opening: c.history.length === 0,
    });
    let suggestions: string[] | undefined;
    if (phase2) {
      // Like the route (phase2-turn.ts), at the case's frozen hour and day.
      const built = toolCalls.find((t) => t.name === 'generate_workout' && !t.isError);
      const extras = phase2TurnExtras({
        sheet,
        profile: (ctx.profile as Record<string, unknown> | undefined) ?? null,
        gender: ctx.gender,
        now: new Date(`${ctx.todayKey}T${String(ctx.israelHour).padStart(2, '0')}:00:00+03:00`),
        todayKey: ctx.todayKey,
        hour: ctx.israelHour,
        userText: c.message,
        toolNames,
        workoutInput: (built?.input as Record<string, unknown> | undefined) ?? null,
        proposalCreated: simTurn.proposalCreated,
        actions: chips as Parameters<typeof phase2TurnExtras>[0]['actions'],
      });
      chips = extras.actions;
      suggestions = extras.suggestions.map((x) => x.id);
    }
    if (simTurn.round4) {
      const built = toolCalls.find((t) => t.name === 'generate_workout' && !t.isError);
      const r = built?.result as { location?: string; levelCeiling?: boolean; shortOfMinimum?: boolean } | undefined;
      chips = round4TurnActions({
        state: simTurn.round4,
        toolNames,
        userText: c.message,
        workout: r ? { location: r.location, levelCeiling: r.levelCeiling, shortOfMinimum: r.shortOfMinimum } : null,
        actions: chips as Parameters<typeof round4TurnActions>[0]['actions'],
      });
    }
    return {
      finalText,
      safetyGate: false,
      toolCalls,
      todayDayOfWeek: ctx.israelDayOfWeek,
      sheetWeekDates,
      chips,
      ...(phase2 ? { suggestions, proposalCreated: simTurn.proposalCreated } : {}),
      ...(simTurn.round4 ? { aerobicKind: simTurn.round4.extras.aerobic?.kind ?? null, parksShown: !!simTurn.round4.extras.parks?.length } : {}),
    };
  };

  // The route's deterministic safety gate runs before the model.
  const trigger = detectSafetyTrigger(c.message);
  if (trigger) {
    return finish({ finalText: safetyReply(trigger, ctx.gender), safetyGate: true, toolCalls, todayDayOfWeek: ctx.israelDayOfWeek }, null);
  }

  const system: Anthropic.TextBlockParam[] = [
    { type: 'text', text: round4 ? coachSystemPrompt({ round4: true }) : COACH_SYSTEM_PROMPT },
    {
      type: 'text',
      text: buildSessionContext({
        firstName: ctx.firstName,
        gender: ctx.gender,
        todayKey: ctx.todayKey,
        israelDayOfWeek: ctx.israelDayOfWeek,
        israelHour: ctx.israelHour,
        // Like the route: the user sheet and the typo hints are in every turn's context.
        sheet,
        typoHints: typoHints(c.message),
        ...(phase2 ? { phase2: true } : {}),
        ...(c.memory?.length ? { memory: renderMemoryBlock(c.memory) } : {}),
        ...(round4 ? { round4Note: ROUND4_NOTE } : {}),
      }),
    },
  ];
  const cfg = {
    model: deps.model,
    system,
    tools: coachToolDefinitions({ ...(phase2 ? { phase2: true } : {}), ...(round4 ? { round4: true } : {}) }),
    history: historyToModelMessages(c.history.map((h) => ({ role: h.role, text: h.text }))),
    maxRounds: COACH_MAX_TOOL_ROUNDS,
    maxTokens: COACH_MODEL_MAX_TOKENS,
    guards: { sheet, todayDow: ctx.israelDayOfWeek, userGender: ctx.gender, ...(round4 ? { round4: true } : {}) },
  };

  const callModel: CallModel = async (params, onText) => {
    const msg = await deps.callModel(params, onText);
    const u = usageFromSdk(msg.usage);
    usage.inputTokens += u.inputTokens;
    usage.outputTokens += u.outputTokens;
    usage.cacheReadTokens += u.cacheReadTokens;
    usage.cacheWriteTokens += u.cacheWriteTokens;
    costUsd += estimateCostUsd(params.model, u);
    return msg;
  };

  let state: TurnState = newTurnState(c.message);
  try {
    for (let hop = 0; hop < 4; hop++) {
      const outcome = await runCoachTurn(cfg, state, {
        emit: () => {},
        callModel,
        executeServerTool: async (name, input) => {
          const r = simulateServerTool(name, input, ctx, shown, simTurn);
          toolCalls.push({ name, input, result: parseMaybeJson(r.content), isError: !!r.isError });
          return r;
        },
      });
      if (outcome.kind === 'final') {
        return finish(finalRun(outcome.state.turnText.trim()), null);
      }
      // Client tool round trip (the device's part).
      const sim = await simulate(outcome.call.input as GenerateWorkoutInputT, ctx);
      if (sim.outcome.ok && sim.record) shown.set(sim.outcome.result.workoutId, sim.record);
      toolCalls.push({
        name: outcome.call.name,
        input: outcome.call.input,
        result: sim.outcome.ok ? (sim.record ?? sim.outcome.result) : { ok: false, error: sim.outcome.error },
        isError: !sim.outcome.ok,
      });
      state = resumeWithClientResult(outcome.state, outcome.pendingResults, clientOutcomeToToolResult(outcome.call.id, sim.outcome, round4 ? { round4: true } : {}));
    }
    return finish({ finalText: '', safetyGate: false, toolCalls }, 'too many client round trips');
  } catch (err) {
    return finish({ finalText: '', safetyGate: false, toolCalls }, err instanceof Error ? err.message : String(err));
  }
}
