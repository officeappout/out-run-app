/**
 * AI coach ("קלי AI") — the tool registry. Pure: zod + data only, so the server (route +
 * turn engine) and the client (generate_workout executor) validate with the SAME schemas.
 *
 * Two kinds of tool:
 *   server  run inside /api/ai-coach/chat with the Admin SDK (read-only, except
 *           handoff_to_human which writes one message into the user's Kelly support DM)
 *   client  the server ends the stream with {type:'client_tool'}; the app runs the tool
 *           on the device (the workout engine reads the exercise library through the
 *           client SDK) and posts a compact result back, which resumes the turn.
 *
 * Adding a tool (e.g. generate_route for walking / running routes later):
 *   1. add an entry to COACH_TOOLS below (name, kind, description, JSON schema, zod schema)
 *   2. server tool → add a case in server-tools.server.ts; client tool → add an executor in
 *      src/features/ai-coach/services/client-tools.ts and, if it produces a card, a
 *      result schema + card builder next to WorkoutToolResultSchema
 *   3. mention when to use it in the system prompt (persona.ts)
 * The definition list is built in a fixed order and never depends on the user, so it stays
 * byte-identical between requests (it sits in the cached prompt prefix).
 */
import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import { MG_TO_DOMAIN } from '@/features/workout-engine/shared/constants/domain-mapping.constants';

// ─── Shared enums ────────────────────────────────────────────────────────────

export const COACH_LOCATIONS = ['home', 'park', 'office', 'street'] as const;
export type CoachLocation = (typeof COACH_LOCATIONS)[number];

/**
 * Training domains the model may ask for: push / pull / legs / core plus every skill domain
 * MG_TO_DOMAIN knows. Insertion order of MG_TO_DOMAIN is fixed, so this list is stable.
 */
export const COACH_DOMAINS = Array.from(new Set(Object.values(MG_TO_DOMAIN))) as [string, ...string[]];

/** Which profile.equipment bucket a coach location reads. */
export const LOCATION_GEAR_BUCKET: Record<CoachLocation, 'home' | 'office' | 'outdoor'> = {
  home: 'home',
  office: 'office',
  park: 'outdoor',
  street: 'outdoor',
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

// ─── Input schemas ───────────────────────────────────────────────────────────

export const GetUserContextInput = z.object({});

export const GetProgressInput = z.object({
  range: z.enum(['week', 'month', 'quarter']),
});

export const GetScheduleInput = z
  .object({
    from: z.string().regex(ISO_DAY),
    to: z.string().regex(ISO_DAY),
  })
  .refine((v) => Number.isFinite(Date.parse(v.from)) && Number.isFinite(Date.parse(v.to)), {
    message: 'invalid date',
  })
  .refine((v) => Date.parse(v.to) >= Date.parse(v.from), { message: 'to must be on or after from' })
  .refine((v) => (Date.parse(v.to) - Date.parse(v.from)) / DAY_MS <= 13, {
    message: 'at most 14 days',
  });

export const ExplainWorkoutInput = z.object({
  workoutId: z.string().min(1).max(80),
});

export const GetWorkoutDetailsInput = z.object({
  workoutId: z.string().min(1).max(80),
});

export const HandoffToHumanInput = z.object({
  summary: z.string().trim().min(5).max(500),
});

export const RecommendWeekInput = z.object({});
export const RecommendTodayInput = z.object({});

export const GenerateWorkoutInput = z.object({
  durationMin: z.number().int().min(5).max(90),
  location: z.enum(COACH_LOCATIONS),
  difficulty: z.number().int().min(1).max(3),
  domains: z.array(z.enum(COACH_DOMAINS)).max(4).default([]),
  equipment: z.array(z.string().min(1).max(64)).max(12).default([]),
  intent: z.string().max(80).optional(),
});
export type GenerateWorkoutInputT = z.infer<typeof GenerateWorkoutInput>;

// ─── Registry ────────────────────────────────────────────────────────────────

export type CoachToolKind = 'server' | 'client';

export interface CoachToolSpec {
  name: string;
  kind: CoachToolKind;
  description: string;
  inputSchema: Anthropic.Tool.InputSchema;
  zod: z.ZodTypeAny;
}

export const COACH_TOOLS = {
  get_user_context: {
    name: 'get_user_context',
    kind: 'server',
    description:
      "Returns a compact sheet about the user: first name, grammatical gender, age band, goals, active programs with levels, injuries, streak, the last 5 workouts, today's and this week's schedule, preferred training time, the user's own equipment ids per location, and a coarse area name. The same sheet is already in the session context at the start of every turn; call this only to refresh it.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    zod: GetUserContextInput,
  },
  get_progress: {
    name: 'get_progress',
    kind: 'server',
    description:
      'Returns workout totals for the last week, month or quarter: number of workouts, total minutes, active days, split by workout type, plus current program levels. Use it for questions like "how am I progressing".',
    inputSchema: {
      type: 'object',
      properties: { range: { type: 'string', enum: ['week', 'month', 'quarter'] } },
      required: ['range'],
      additionalProperties: false,
    },
    zod: GetProgressInput,
  },
  get_schedule: {
    name: 'get_schedule',
    kind: 'server',
    description:
      "Returns the user's planned schedule entries between two dates (inclusive, YYYY-MM-DD, at most 14 days), one per planned session: date, weekday, type, kind (strength, cardio, walking), program names, start time, planned minutes when known, title, completed, and buildNow (generate_workout settings for a strength session that can be built now).",
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'YYYY-MM-DD' },
        to: { type: 'string', description: 'YYYY-MM-DD, at most 13 days after from' },
      },
      required: ['from', 'to'],
      additionalProperties: false,
    },
    zod: GetScheduleInput,
  },
  generate_workout: {
    name: 'generate_workout',
    kind: 'client',
    description:
      "Builds a real workout with the app's workout engine on the user's device and shows it as a card the user can open and start. Use it whenever the user wants a workout. The result lists the title, the real minutes (which may differ from the request), and every main exercise with its method, where it is done (methodLocation) and the gear it needs; describe only what it returns.",
    inputSchema: {
      type: 'object',
      properties: {
        durationMin: { type: 'integer', minimum: 5, maximum: 90, description: 'Workout length in minutes' },
        location: { type: 'string', enum: [...COACH_LOCATIONS] },
        difficulty: { type: 'integer', minimum: 1, maximum: 3, description: '1 easy, 2 balanced, 3 intense' },
        domains: {
          type: 'array',
          items: { type: 'string', enum: [...COACH_DOMAINS] },
          maxItems: 4,
          description: 'Body areas to focus on. Empty means the engine decides. Abs means core.',
        },
        equipment: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 12,
          description: "Leave empty: the engine uses the user's own saved gear for that location. Only pass ids (from the user's own equipment list) when the user explicitly limits the gear for this workout.",
        },
        intent: { type: 'string', maxLength: 80, description: 'Short free-text note of what the user asked for' },
      },
      required: ['durationMin', 'location', 'difficulty'],
      additionalProperties: false,
    },
    zod: GenerateWorkoutInput,
  },
  explain_workout: {
    name: 'explain_workout',
    kind: 'server',
    description:
      'Explains why a workout shown earlier in this conversation was built the way it was (the engine decision record): reasons, what to expect, sets, reps and rest. Pass the workoutId from the generate_workout result.',
    inputSchema: {
      type: 'object',
      properties: { workoutId: { type: 'string' } },
      required: ['workoutId'],
      additionalProperties: false,
    },
    zod: ExplainWorkoutInput,
  },
  get_workout_details: {
    name: 'get_workout_details',
    kind: 'server',
    description:
      'Returns the exercise list of a workout card shown in this conversation: each main exercise with its method, where it is done (home, park, office), the gear it needs and whether it has a video. Use it to answer questions about a shown workout, like whether it fits home or which gear it needs. Pass the workoutId from the card.',
    inputSchema: {
      type: 'object',
      properties: { workoutId: { type: 'string' } },
      required: ['workoutId'],
      additionalProperties: false,
    },
    zod: GetWorkoutDetailsInput,
  },
  handoff_to_human: {
    name: 'handoff_to_human',
    kind: 'server',
    description:
      "Sends a short summary into the user's chat with the human Kelly coaching team, so a person follows up. Only call it after the user explicitly agreed to be passed to a human coach.",
    inputSchema: {
      type: 'object',
      properties: { summary: { type: 'string', minLength: 5, maxLength: 500, description: 'Hebrew, what the user needs' } },
      required: ['summary'],
      additionalProperties: false,
    },
    zod: HandoffToHumanInput,
  },
  // ── Schedule advisor (phase A, read-only) — offered only while
  // system_config/feature_flags.ai_coach_schedule_advisor is on (coachToolDefinitions).
  recommend_week: {
    name: 'recommend_week',
    kind: 'server',
    description:
      "Recommends how the user's week should look, from the app's schedule rules (strength and running together: no strength on the long-run day, no legs the day before a key run, quality run before strength on a shared day, at least 2 strength days). Returns per weekday the strength program names and the run type, short Hebrew reasons (text), and reason codes. A proposal only: it changes nothing. To apply it, the user opens the schedule builder (a button under your reply). Use it for \"how should I arrange my week\", \"I can only train 3 days\", or when adding running to strength.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    zod: RecommendWeekInput,
  },
  recommend_today: {
    name: 'recommend_today',
    kind: 'server',
    description:
      "Recommends what to do today from the plan and the last 14 days: strength, run, combined, walk or rest, with generate_workout settings (buildNow) for a strength session, whether today's session is already done (doneToday), the mode (on_track, makeup, welcome_back, fresh_start) and short Hebrew reasons. Never lists or counts missed workouts: after a break, welcome the user back without guilt. Read-only. Use it for \"what should I do today\" before building a workout.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    zod: RecommendTodayInput,
  },
} as const satisfies Record<string, CoachToolSpec>;

/** Tools that exist only while the schedule advisor flag (ai_coach_schedule_advisor) is on. */
export const SCHEDULE_ADVISOR_TOOL_NAMES: readonly string[] = ['recommend_week', 'recommend_today'];

export type CoachToolName = keyof typeof COACH_TOOLS;

export function isCoachToolName(name: string): name is CoachToolName {
  return Object.prototype.hasOwnProperty.call(COACH_TOOLS, name);
}

export function toolKind(name: string): CoachToolKind | null {
  return isCoachToolName(name) ? COACH_TOOLS[name].kind : null;
}

/**
 * Tool definitions for the Messages API, fixed order (cache-stable per flag state). The
 * schedule advisor tools are appended only with `scheduleAdvisor` — off = exactly today's list.
 */
export function coachToolDefinitions(opts: { scheduleAdvisor?: boolean } = {}): Anthropic.Tool[] {
  return Object.values(COACH_TOOLS)
    .filter((t) => opts.scheduleAdvisor || !SCHEDULE_ADVISOR_TOOL_NAMES.includes(t.name))
    .map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
}

export type ToolInputValidation =
  | { ok: true; input: unknown }
  | { ok: false; error: string };

/** zod-validates a model-supplied tool input. Unknown tool → error (never executed). */
export function validateToolInput(name: string, input: unknown): ToolInputValidation {
  if (!isCoachToolName(name)) return { ok: false, error: `unknown tool ${name}` };
  const parsed = COACH_TOOLS[name].zod.safeParse(input ?? {});
  if (!parsed.success) {
    const msg = parsed.error.issues
      .slice(0, 4)
      .map((i) => `${i.path.join('.') || 'input'}: ${i.message}`)
      .join('; ');
    return { ok: false, error: `invalid input (${msg})` };
  }
  return { ok: true, input: parsed.data };
}

/**
 * Keeps only equipment the user actually owns for that location. Run on BOTH sides: the
 * server strips before sending the client_tool event, the client strips again before the
 * engine sees it (never trust the wire).
 */
export function sanitizeWorkoutEquipment(
  input: GenerateWorkoutInputT,
  userEquipment: Partial<Record<'home' | 'office' | 'outdoor', unknown>> | null | undefined,
): GenerateWorkoutInputT {
  const bucket = userEquipment?.[LOCATION_GEAR_BUCKET[input.location]];
  const owned = new Set(Array.isArray(bucket) ? bucket.filter((x): x is string => typeof x === 'string') : []);
  return { ...input, equipment: Array.from(new Set(input.equipment.filter((id) => owned.has(id)))) };
}

// ─── Client tool results (device → server) ───────────────────────────────────

const DecisionRecordLoose = z
  .object({
    v: z.literal(1),
    seed: z.number(),
    reasons: z.array(z.object({ code: z.string().max(40) }).passthrough()).max(20),
    expect: z.object({}).passthrough(),
  })
  .passthrough();

export const WorkoutToolResultSchema = z.object({
  workoutId: z.string().regex(/^ai-[a-z0-9-]{4,60}$/),
  title: z.string().min(1).max(80),
  minutes: z.number().int().min(1).max(180),
  location: z.enum(COACH_LOCATIONS),
  exercises: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        sets: z.number().int().min(0).max(20),
        reps: z.number().int().min(0).max(300).nullable(),
        seconds: z.number().int().min(0).max(900).nullable(),
        /** The execution method's name ("חתירות באמצעות מגבת"). */
        method: z.string().max(80).optional(),
        /** Where the chosen method is done (home / park / office / …). */
        methodLocation: z.string().max(20).nullable().optional(),
        /** Hebrew names of the gear the method needs (empty = bodyweight). */
        gear: z.array(z.string().max(40)).max(6).optional(),
        /** The method has a video in the app. */
        video: z.boolean().optional(),
        /** Base body area: push / pull / legs / core. */
        area: z.string().max(20).nullable().optional(),
      }),
    )
    .max(20),
  /** What the user asked for (the card shows the real `minutes`). */
  requestedMinutes: z.number().int().min(1).max(180).optional(),
  domains: z.array(z.string().max(40)).max(8).optional(),
  difficulty: z.number().int().min(1).max(3).optional(),
  structure: z.string().max(20).optional(),
  warmupCount: z.number().int().min(0).max(20).optional(),
  cooldownCount: z.number().int().min(0).max(20).optional(),
  /** The engine clamped the level down: little content at the user's level for this location. */
  levelCeiling: z.boolean().optional(),
  /** Fewer main exercises than the short-session minimum were available. */
  shortOfMinimum: z.boolean().optional(),
  decisionRecord: DecisionRecordLoose.optional(),
});
export type WorkoutToolResult = z.infer<typeof WorkoutToolResultSchema>;

export const CLIENT_TOOL_ERRORS = ['needs_assessment', 'generation_failed', 'invalid_input', 'offline'] as const;
export type ClientToolErrorCode = (typeof CLIENT_TOOL_ERRORS)[number];

export const ClientToolOutcomeSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), result: WorkoutToolResultSchema }),
  z.object({ ok: z.literal(false), error: z.enum(CLIENT_TOOL_ERRORS), domains: z.array(z.string().max(40)).max(8).optional() }),
]);
export type ClientToolOutcome = z.infer<typeof ClientToolOutcomeSchema>;
