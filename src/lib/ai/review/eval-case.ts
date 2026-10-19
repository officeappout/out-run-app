/**
 * AI coach regression cases — the schema, the assertion engine and "flagged turn → case".
 * Pure. Used by the panel ("convert to regression case"), the eval runner
 * (scripts/ai-coach-evals.ts) and the committed fixtures (evals/ai-coach/*.json).
 *
 * A case replays ONE user message (optionally after earlier turns) through the real turn
 * engine against a frozen context (session facts + a user context sheet), then checks the
 * outcome: which tools were called with what, what the workout looked like, and what Kelly
 * said.
 */
import { z } from 'zod';
import { detectSafetyTrigger } from '@/lib/ai/coach/safety';
import { COACH_ACTION_IDS } from '@/lib/ai/coach/action-chips';
import {
  evidenceFromToolCall,
  findEnglish,
  findFeminineSelfReference,
  looksLikeSafetyReply,
  parseRequest,
  sentenceCount,
  weekdaysMentioned,
  type WorkoutEvidence,
} from './checks';
import { LEVEL_WORDS, MINUTES_TOLERANCE } from './prechecks';
import type { IssueCategory } from './review-types';

export const EvalAssertionsSchema = z
  .object({
    mustCallTool: z.union([z.string(), z.array(z.string())]).optional(),
    mustNotCallTool: z.array(z.string()).optional(),
    /** Workout exercises (or, without per-exercise data, the requested domains) only from this set. */
    domains: z.array(z.string()).optional(),
    location: z.enum(['home', 'park', 'office', 'street']).optional(),
    minExercises: z.number().int().min(1).optional(),
    /** Target minutes, ±30%. */
    minutes: z.number().int().min(1).optional(),
    difficulty: z.number().int().min(1).max(3).optional(),
    noEnglish: z.boolean().optional(),
    noSafetyReply: z.boolean().optional(),
    safetyReply: z.boolean().optional(),
    /** Kelly is male: no feminine first-person self-reference. */
    masculineSelfReference: z.boolean().optional(),
    maxSentences: z.number().int().min(1).optional(),
    /** Weekday names in the reply must be days that get_schedule returned entries for. */
    noInventedDays: z.boolean().optional(),
    /** When the built workout carries LEVEL_CEILING, the reply must say so. */
    mentionLevelCeilingIfPresent: z.boolean().optional(),
    /** Every planned weekday (preloaded sheet week + get_schedule results) is named in the reply. */
    namesAllScheduledDays: z.boolean().optional(),
    /** At most this many non-empty lines (the per-day schedule list is ≤ 5 lines + one sentence). */
    maxLines: z.number().int().min(1).optional(),
    /** Action chips the turn must carry (action-chips.ts ids). */
    chips: z.array(z.string().refine((v) => (COACH_ACTION_IDS as readonly string[]).includes(v), 'unknown chip id')).optional(),
    /** Action chips the turn must NOT carry. */
    noChips: z.array(z.string()).optional(),
    /** Regex sources with how often the reply may match each (e.g. the level check said once). */
    matchCount: z.array(z.object({ pattern: z.string(), min: z.number().int().min(0).default(0), max: z.number().int().min(0) })).optional(),
    /** Regex sources the reply must match (all). */
    mustMatch: z.array(z.string()).optional(),
    /** Regex sources the reply must NOT match (none). */
    mustNotMatch: z.array(z.string()).optional(),
    /** Kelly phase 2: quick-reply ids the turn must carry (suggestions/copy.ts ids). */
    suggestions: z.array(z.string()).optional(),
    /** Kelly phase 2: quick-reply ids the turn must NOT carry ('*' = none at all). */
    noSuggestions: z.array(z.string()).optional(),
    /** Kelly phase 2: a schedule proposal card was (true) / was not (false) prepared. */
    proposal: z.boolean().optional(),
    /** Kelly round 4: the aerobic card's kind (walk / easy_run / program_run). */
    aerobicKind: z.enum(['walk', 'easy_run', 'program_run']).optional(),
    /** Kelly round 4: nearby parks were (true) / were not (false) shown. */
    parksShown: z.boolean().optional(),
    /** Kelly round 4: the park option is offered (parks shown, or the "גינות כושר קרובות" chip). */
    offersParks: z.boolean().optional(),
  })
  .strict();
export type EvalAssertions = z.infer<typeof EvalAssertionsSchema>;

export const EvalContextSchema = z.object({
  firstName: z.string().max(30),
  gender: z.enum(['male', 'female', 'other']),
  /** Israel 'YYYY-MM-DD' the case pretends is today. */
  todayKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  israelDayOfWeek: z.number().int().min(0).max(6),
  israelHour: z.number().int().min(0).max(23),
  /** get_user_context result (UserContextSheet shape). Absent → a minimal sheet. */
  sheet: z.record(z.string(), z.unknown()).optional(),
  /** get_progress result. Absent → computed from the sheet's lastWorkouts. */
  progress: z.record(z.string(), z.unknown()).optional(),
  /** Kelly phase 2: the raw profile (schedule fields) propose_schedule_change plans on. */
  profile: z.record(z.string(), z.unknown()).optional(),
  /** Kelly round 4: the frozen world the round 4 tools read (eval-round4.ts). */
  round4: z
    .object({
      running: z.object({ hasRunningProgram: z.boolean(), hasPaceProfile: z.boolean(), plannedRunToday: z.boolean() }).optional(),
      daysAway: z.number().int().min(0).nullable().optional(),
      /** A loop of this length is found near the user (absent = pick on the map). */
      routeKm: z.number().optional(),
      /** null = no known area. */
      parks: z
        .array(z.object({ name: z.string(), distanceKm: z.number(), equipment: z.array(z.string()), area: z.string().nullable().optional() }))
        .nullable()
        .optional(),
      /** null / absent = weather unavailable for this user. */
      weather: z
        .object({ temperatureC: z.number(), feelsLikeC: z.number(), flag: z.enum(['rain', 'heat', 'cold', 'uv']).nullable(), rainChanceNext3hPct: z.number().nullable(), isNight: z.boolean().optional() })
        .nullable()
        .optional(),
      /** The stub workout comes back below the user's level (LEVEL_CEILING). */
      levelCeiling: z.boolean().optional(),
    })
    .optional(),
});
export type EvalContext = z.infer<typeof EvalContextSchema>;

export const EvalCaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]{2,80}$/),
  name: z.string().max(200),
  source: z.object({
    kind: z.enum(['fixture', 'review']),
    reviewDocId: z.string().optional(),
    turnIndex: z.number().int().optional(),
    issueId: z.string().optional(),
    category: z.string().optional(),
    note: z.string().max(500).optional(),
  }),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string() })).default([]),
  message: z.string().min(1).max(1000),
  context: EvalContextSchema,
  assertions: EvalAssertionsSchema,
  /**
   * Mock mode only (scriptedMockModel): the text the fake model writes, in order, one per
   * text round (the last one repeats). Lets a fixture replay a BAD model reply (e.g. the
   * feminine slip) to prove the reply guards fix it. Ignored in --live runs.
   */
  mock: z
    .object({
      replies: z.array(z.string().min(1)).min(1),
      /** Inputs the fake model sends for its tool calls (by tool name). */
      toolInputs: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
    })
    .optional(),
  /** Flags the replay runs with (default: all off, like production before they are switched on). */
  flags: z.object({ phase2: z.boolean().optional(), round4: z.boolean().optional() }).optional(),
  /**
   * Kelly phase 3 (ai_coach_memory): remembered facts, rendered into the session context
   * exactly like the route does (memory/inject.ts). Absent = no memory block.
   */
  memory: z.array(z.object({ category: z.enum(['injury', 'schedule', 'goal', 'preference']), text: z.string().min(1).max(120) })).max(20).optional(),
});
export type EvalCase = z.infer<typeof EvalCaseSchema>;

// ─── Run result + assertion engine ───────────────────────────────────────────

export interface EvalToolCall {
  name: string;
  input: unknown;
  /** What the model read back (parsed JSON when possible). */
  result: unknown;
  isError: boolean;
}

export interface EvalRunResult {
  finalText: string;
  /** The deterministic safety gate answered (no model call). */
  safetyGate: boolean;
  toolCalls: EvalToolCall[];
  /** Naming today's weekday is never an invented day. */
  todayDayOfWeek?: number;
  /** Dates of the planned (non-rest) sessions in the user sheet pre-loaded into the turn. */
  sheetWeekDates?: string[];
  /** Action chips the turn produced. */
  chips?: string[];
  /** Kelly phase 2: the quick-reply ids the turn produced. */
  suggestions?: string[];
  /** Kelly phase 2: a proposal card was prepared. */
  proposalCreated?: boolean;
  /** Kelly round 4: the aerobic card's kind, and whether parks were shown. */
  aerobicKind?: string | null;
  parksShown?: boolean;
}

export interface AssertionResult {
  name: string;
  pass: boolean;
  detail: string;
}

function workouts(run: EvalRunResult): WorkoutEvidence[] {
  return run.toolCalls.filter((c) => c.name === 'generate_workout').map((c) => evidenceFromToolCall(c.input, c.isError ? { ok: false, error: String(c.result) } : c.result));
}

function weekdayOf(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay();
}

function scheduleWeekdays(run: EvalRunResult): Set<number> {
  const out = new Set<number>();
  for (const d of run.sheetWeekDates ?? []) if (/^\d{4}-\d{2}-\d{2}$/.test(d)) out.add(weekdayOf(d));
  for (const c of run.toolCalls) {
    if (c.isError) continue;
    const r = c.result as { entries?: unknown; thisWeek?: unknown } | null;
    const entries = c.name === 'get_schedule' ? r?.entries : c.name === 'get_user_context' ? r?.thisWeek : null;
    if (!Array.isArray(entries)) continue;
    for (const e of entries) {
      const d = (e as { date?: unknown })?.date;
      if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) out.add(weekdayOf(d));
    }
  }
  return out;
}

export function checkAssertions(a: EvalAssertions, run: EvalRunResult): AssertionResult[] {
  const out: AssertionResult[] = [];
  const add = (name: string, pass: boolean, detail: string) => out.push({ name, pass, detail });
  const called = run.toolCalls.map((c) => c.name);
  const text = run.finalText ?? '';
  const built = workouts(run).filter((w) => w.ok);

  if (a.mustCallTool) {
    const need = Array.isArray(a.mustCallTool) ? a.mustCallTool : [a.mustCallTool];
    const missing = need.filter((n) => !called.includes(n));
    add('mustCallTool', missing.length === 0, missing.length ? `not called: ${missing.join(', ')} (called: ${called.join(', ') || 'none'})` : `called ${need.join(', ')}`);
  }
  if (a.mustNotCallTool) {
    const bad = a.mustNotCallTool.filter((n) => called.includes(n));
    add('mustNotCallTool', bad.length === 0, bad.length ? `called ${bad.join(', ')}` : 'ok');
  }

  const needsWorkout = a.domains || a.location || a.minExercises || a.minutes || a.difficulty;
  if (needsWorkout && built.length === 0) {
    add('workout', false, 'no successful generate_workout result to check');
  } else if (needsWorkout) {
    const w = built[built.length - 1];
    if (a.domains) {
      const allowed = new Set(a.domains);
      const exDomains = (w.exercises ?? []).map((e) => e.domain).filter((d): d is string => !!d);
      if (exDomains.length > 0) {
        const off = exDomains.filter((d) => !allowed.has(d));
        add('domains', off.length === 0, off.length ? `off-domain exercises: ${off.join(', ')}` : `all in ${a.domains.join(',')}`);
      } else {
        const sent = w.input?.domains ?? [];
        const ok = sent.length > 0 && sent.every((d) => allowed.has(d));
        add('domains', ok, `requested domains: ${sent.join(',') || '(none)'} (no per-exercise domains in result)`);
      }
    }
    if (a.location) {
      const loc = w.location ?? w.input?.location ?? null;
      const wrong = (w.exercises ?? []).filter((e) => e.locations && e.locations.length > 0 && !e.locations.includes(a.location!));
      add('location', loc === a.location && wrong.length === 0, wrong.length ? `non-${a.location} methods: ${wrong.map((e) => e.name).join(', ')}` : `location ${loc}`);
    }
    if (a.minExercises) {
      const n = w.exerciseCount ?? 0;
      add('minExercises', n >= a.minExercises, `${n} exercises (min ${a.minExercises})`);
    }
    if (a.minutes) {
      const m = w.minutes ?? w.input?.durationMin ?? 0;
      add('minutes', Math.abs(m - a.minutes) / a.minutes <= MINUTES_TOLERANCE, `${m} min (target ${a.minutes} ±${Math.round(MINUTES_TOLERANCE * 100)}%)`);
    }
    if (a.difficulty) {
      add('difficulty', w.input?.difficulty === a.difficulty, `difficulty ${w.input?.difficulty ?? '?'} (want ${a.difficulty})`);
    }
    if (a.mentionLevelCeilingIfPresent && w.reasonCodes.includes('LEVEL_CEILING')) {
      add('mentionLevelCeiling', LEVEL_WORDS.test(text), 'LEVEL_CEILING in the result; the reply must mention the level');
    }
  }

  if (a.noEnglish) {
    const en = findEnglish(text);
    add('noEnglish', !en, en ? `English: "${en}"` : 'ok');
  }
  if (a.noSafetyReply) {
    const s = run.safetyGate || looksLikeSafetyReply(text);
    add('noSafetyReply', !s, s ? (run.safetyGate ? 'the safety gate fired' : 'the model wrote a safety reply') : 'ok');
  }
  if (a.safetyReply) {
    const s = run.safetyGate || looksLikeSafetyReply(text);
    add('safetyReply', s, s ? 'ok' : 'expected the safety reply');
  }
  if (a.masculineSelfReference) {
    const f = findFeminineSelfReference(text);
    add('masculineSelfReference', !f, f ? `feminine: "${f}"` : 'ok');
  }
  if (a.maxSentences) {
    const n = sentenceCount(text);
    add('maxSentences', n <= a.maxSentences, `${n} sentences (max ${a.maxSentences})`);
  }
  if (a.noInventedDays) {
    const said = weekdaysMentioned(text);
    const known = scheduleWeekdays(run);
    if (typeof run.todayDayOfWeek === 'number') known.add(run.todayDayOfWeek);
    const invented = said.filter((d) => !known.has(d));
    add('noInventedDays', invented.length === 0, invented.length ? `days not in the schedule result: ${invented.join(',')}` : `${said.length} day(s) named, all from tool results`);
  }
  if (a.namesAllScheduledDays) {
    const said = new Set(weekdaysMentioned(text));
    const planned = Array.from(scheduleWeekdays(run)).sort();
    const missing = planned.filter((d) => !said.has(d));
    add(
      'namesAllScheduledDays',
      planned.length > 0 && missing.length === 0,
      planned.length === 0 ? 'no planned days in the evidence' : missing.length ? `planned days not named: ${missing.join(',')}` : `all ${planned.length} planned day(s) named`,
    );
  }
  if (a.maxLines) {
    const n = text.split('\n').filter((l) => l.trim()).length;
    add('maxLines', n <= a.maxLines, `${n} lines (max ${a.maxLines})`);
  }
  if (a.chips) {
    const got = run.chips ?? [];
    const missing = a.chips.filter((c) => !got.includes(c));
    add('chips', missing.length === 0, missing.length ? `missing chips: ${missing.join(', ')} (got: ${got.join(', ') || 'none'})` : `chips ${got.join(', ')}`);
  }
  if (a.noChips) {
    const got = run.chips ?? [];
    const bad = a.noChips.filter((c) => got.includes(c));
    add('noChips', bad.length === 0, bad.length ? `unexpected chips: ${bad.join(', ')}` : 'ok');
  }
  if (a.suggestions) {
    const got = run.suggestions ?? [];
    const missing = a.suggestions.filter((c) => !got.includes(c));
    add('suggestions', missing.length === 0, missing.length ? `missing quick replies: ${missing.join(', ')} (got: ${got.join(', ') || 'none'})` : `quick replies ${got.join(', ')}`);
  }
  if (a.noSuggestions) {
    const got = run.suggestions ?? [];
    const bad = a.noSuggestions.includes('*') ? got : a.noSuggestions.filter((c) => got.includes(c));
    add('noSuggestions', bad.length === 0, bad.length ? `unexpected quick replies: ${bad.join(', ')}` : 'ok');
  }
  if (typeof a.proposal === 'boolean') {
    const got = !!run.proposalCreated;
    add('proposal', got === a.proposal, got ? 'a proposal card was prepared' : 'no proposal card');
  }
  if (a.aerobicKind) {
    add('aerobicKind', run.aerobicKind === a.aerobicKind, `aerobic card: ${run.aerobicKind ?? 'none'} (want ${a.aerobicKind})`);
  }
  if (typeof a.parksShown === 'boolean') {
    add('parksShown', !!run.parksShown === a.parksShown, run.parksShown ? 'parks shown' : 'no parks');
  }
  if (a.offersParks) {
    const ok = !!run.parksShown || (run.chips ?? []).includes('find_parks');
    add('offersParks', ok, ok ? 'park option offered' : 'no parks and no parks chip');
  }
  for (const m of a.matchCount ?? []) {
    let n = 0;
    try {
      n = (text.match(new RegExp(m.pattern, 'g')) ?? []).length;
    } catch {
      n = -1;
    }
    add(`matchCount /${m.pattern}/`, n >= m.min && n <= m.max, `${n} match(es) (want ${m.min} to ${m.max})`);
  }
  for (const src of a.mustNotMatch ?? []) {
    let hit = false;
    try {
      hit = new RegExp(src).test(text);
    } catch {
      hit = false;
    }
    add(`mustNotMatch /${src}/`, !hit, hit ? 'matched' : 'ok');
  }
  for (const src of a.mustMatch ?? []) {
    let ok = false;
    try {
      ok = new RegExp(src).test(text);
    } catch {
      ok = false;
    }
    add(`mustMatch /${src}/`, ok, ok ? 'ok' : 'no match');
  }
  return out;
}

// ─── Flagged turn → case ─────────────────────────────────────────────────────

/** Default assertions for a user message, from the request parser + the flagged category. */
export function defaultAssertions(userText: string, category?: IssueCategory): EvalAssertions {
  const req = parseRequest(userText);
  const a: EvalAssertions = { noEnglish: true, masculineSelfReference: true };
  if (detectSafetyTrigger(userText) && category !== 'safety_overtrigger') a.safetyReply = true;
  else a.noSafetyReply = true;
  if (req.isWorkoutRequest) {
    a.mustCallTool = 'generate_workout';
    if (req.domains.length) a.domains = req.domains;
    if (req.location) a.location = req.location;
    if (req.minutes) a.minutes = req.minutes;
    if ((req.minutes ?? 20) >= 10) a.minExercises = 3;
    if (req.intensity === 3) {
      a.difficulty = 3;
      a.mentionLevelCeilingIfPresent = true;
    }
  } else if (req.isScheduleQuestion) {
    // The week is pre-loaded into every turn (the user sheet), so get_schedule is optional:
    // what matters is a per-day answer with no invented days, and the schedule chip.
    a.noInventedDays = true;
    a.namesAllScheduledDays = true;
    a.chips = ['open_schedule'];
  }
  if (category === 'unhelpful' || category === 'tone_gender') a.maxSentences = 4;
  return a;
}

export function caseIdFor(reviewDocId: string, issueId: string): string {
  return `rv-${reviewDocId}-${issueId}`.toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 80);
}
