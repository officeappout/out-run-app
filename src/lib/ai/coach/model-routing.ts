/**
 * Kelly model routing (23.10.2026, owner-approved) — which model answers a coach turn.
 * Pure: no Firebase, no SDK client (type-only import), unit-tested in
 * __tests__/model-routing.test.ts.
 *
 *   ai_coach_smart_routing   per turn, simple messages stay on the fast tier (Haiku 5.5) and
 *                            complex ones (building / changing a workout, planning the week,
 *                            long multi-request messages, complaints, follow-ups of a smart
 *                            turn) go to the smart tier (Sonnet 5.5) with adaptive thinking.
 *   ai_coach_fast_thinking   fast-tier turns run with adaptive thinking at effort medium
 *                            instead of thinking off at effort low.
 *   ai_coach_model_routing_all_users
 *                            audience gate for BOTH flags above: OFF (default) = super admins
 *                            only, so the owner tries it alone first; ON = every AI user.
 *
 * All three default OFF and fail closed (a flag read error → FLAG_DEFS defaults → off).
 * Off for a user = coachModelOptions() returns null and the turn engine sends exactly the
 * request it sent before this module existed.
 *
 * Model facts the options below rely on (claude-api skill, model-migration guide, checked
 * 23.10.2026):
 *   - claude-sonnet-5-5 REJECTS thinking {type:'disabled'} (400) — the smart tier must send
 *     adaptive. Effort low…max, API default high; guide starting point: medium for
 *     multistep tool use, low for chat. We use medium (tool loops: build / plan).
 *   - claude-haiku-5-5 runs adaptive by default; {type:'disabled'} is accepted only at effort
 *     low / medium / high (today's request: disabled + low — valid). Adaptive + medium is
 *     supported (medium is its API default).
 *   - Thinking tokens count toward max_tokens, so a thinking turn needs far more room than
 *     the 600-token reply cap of a thinking-off turn, or the reply is cut off after thinking.
 *   - Both models 400 on forced tool_choice any/tool (Sonnet) — the engine only sends
 *     auto / none, which stay valid with thinking on.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { inferBodyIntent, inferLocation, inferMinutes, inferProgressQuestion, inferScheduleQuestion } from './intent';

export type CoachModelTier = 'fast' | 'smart';

// ─── Gate ────────────────────────────────────────────────────────────────────

export interface ModelRoutingFlagValues {
  aiCoachSmartRouting?: boolean;
  aiCoachFastThinking?: boolean;
  aiCoachModelRoutingAllUsers?: boolean;
}

export interface CoachModelRouting {
  /** Route complex turns to the smart tier. */
  smartRouting: boolean;
  /** Fast-tier turns think (adaptive, effort medium). */
  fastThinking: boolean;
}

/**
 * The real (server-read) flag values + the caller's own isSuperAdmin. The audience gate is
 * explicit: without ai_coach_model_routing_all_users only a super admin gets either flag.
 */
export function coachModelRoutingFor(
  flags: ModelRoutingFlagValues | null | undefined,
  isSuperAdmin: boolean | null | undefined,
): CoachModelRouting {
  const audience = flags?.aiCoachModelRoutingAllUsers === true || isSuperAdmin === true;
  return {
    smartRouting: audience && flags?.aiCoachSmartRouting === true,
    fastThinking: audience && flags?.aiCoachFastThinking === true,
  };
}

/** Either flag is live for this user (the turn is labelled by tier in the usage ledger). */
export function isModelRoutingActive(r: CoachModelRouting): boolean {
  return r.smartRouting || r.fastThinking;
}

// ─── Request options per tier ────────────────────────────────────────────────

export interface CoachModelOptions {
  thinking: Anthropic.ThinkingConfigParam;
  effort: 'low' | 'medium' | 'high';
  maxTokens: number;
}

/** Smart tier: adaptive thinking (disabled is a 400 on Sonnet 5.5) at effort medium. */
export const COACH_SMART_EFFORT = 'medium' as const;
/** Room for the thinking + the short reply (thinking counts toward max_tokens). */
export const COACH_SMART_MAX_TOKENS = 6000;
/** Fast tier with ai_coach_fast_thinking: Haiku 5.5 adaptive at effort medium. */
export const COACH_FAST_THINKING_EFFORT = 'medium' as const;
export const COACH_FAST_THINKING_MAX_TOKENS = 4000;

/**
 * The model options for this turn, or null = the turn engine's defaults (thinking disabled,
 * effort low, COACH_MODEL_MAX_TOKENS — exactly today's request).
 */
export function coachModelOptions(tier: CoachModelTier, routing: CoachModelRouting): CoachModelOptions | null {
  if (tier === 'smart' && routing.smartRouting) {
    return { thinking: { type: 'adaptive' }, effort: COACH_SMART_EFFORT, maxTokens: COACH_SMART_MAX_TOKENS };
  }
  if (tier === 'fast' && routing.fastThinking) {
    return { thinking: { type: 'adaptive' }, effort: COACH_FAST_THINKING_EFFORT, maxTokens: COACH_FAST_THINKING_MAX_TOKENS };
  }
  return null;
}

/** The ai_usage byFeature label: one label per tier while routing is live for the user. */
export const COACH_FEATURE = 'ai_coach_chat';
export function coachUsageFeature(tier: CoachModelTier, routing: CoachModelRouting): string {
  return isModelRoutingActive(routing) ? `${COACH_FEATURE}_${tier}` : COACH_FEATURE;
}

// ─── Classifier ──────────────────────────────────────────────────────────────

export type RoutingReason =
  | 'complaint'
  | 'workout_build'
  | 'workout_combo'
  | 'workout_format'
  | 'schedule_planning'
  | 'long_message'
  | 'follow_up'
  | 'acknowledgement'
  | 'factual_lookup'
  | 'short_default';

export interface RoutingDecision {
  tier: CoachModelTier;
  reason: RoutingReason;
}

export interface RoutingInput {
  /** The user's message of this turn. */
  text: string;
  /** Kelly's previous answer in this conversation was produced on the smart tier. */
  previousTurnSmart?: boolean;
}

const NIQQUD = /[֑-ׇ]/g;
const PREFIX = /^[והבלמשכ]{1,2}$/;

function normalize(text: string): string {
  return (text ?? '').normalize('NFC').replace(NIQQUD, '').toLowerCase();
}

function tokens(raw: string): string[] {
  return raw.split(/[^א-תa-z0-9]+/).filter(Boolean);
}

/** `token` is `stem` or `stem` with up to two one-letter prefixes (ו ה ב ל מ ש כ). */
function tokenIs(token: string, stem: string): boolean {
  if (token === stem) return true;
  if (token.length <= stem.length || !token.endsWith(stem)) return false;
  return PREFIX.test(token.slice(0, token.length - stem.length));
}

function hasStem(toks: string[], stems: readonly string[]): boolean {
  return toks.some((t) => stems.some((s) => tokenIs(t, s)));
}

/** Build / change a workout ("תבנה לי", "תחליף את", "תוסיף עוד"). */
const BUILD_VERBS = [
  'תבנה', 'תבני', 'תבנו', 'לבנות', 'בנה', 'תכין', 'תכיני', 'להכין', 'תרכיב', 'תרכיבי', 'להרכיב',
  'תשנה', 'תשני', 'לשנות', 'תחליף', 'תחליפי', 'להחליף', 'החלף', 'תוסיף', 'תוסיפי', 'להוסיף',
  'תוריד', 'תורידי', 'להוריד', 'תקצר', 'תקצרי', 'לקצר', 'תאריך', 'תאריכי', 'להאריך', 'תתאים', 'תתאימי', 'להתאים',
  'build',
] as const;

/** Intensity / format asks ("טבטה", "EMOM", "משהו עצים", "קצר"). */
const FORMAT_STEMS = [
  'טבטה', 'טאבטה', 'tabata', 'emom', 'amrap', 'hiit', 'אינטרוול', 'אינטרוולים', 'סופרסט', 'סופרסטים',
  'מעגל', 'מעגלים', 'עצים', 'עצימות', 'עצימה', 'אינטנסיבי', 'אינטנסיבית', 'קצר', 'קצרצר', 'ארוך', 'פירמידה',
] as const;

/** Skills / moves that aren't a base domain on their own ("מתח ופלאנץ׳"). */
const SKILL_STEMS = ['פלאנץ', 'planche', 'מאסל', 'מוסל', 'muscle', 'לבר', 'פרונט', 'handstand', 'עמידת', 'דיפס', 'dips'] as const;

/** Aerobic activities ("ריצה ובסוף בטן"). */
const AEROBIC_STEMS = ['ריצה', 'לרוץ', 'ריצת', 'הליכה', 'ללכת', 'אופניים', 'רכיבה', 'שחייה', 'run', 'walk'] as const;

const WORKOUT_NOUNS = ['אימון', 'אימונים', 'האימון', 'workout'] as const;

/** Week / schedule planning verbs (recommend_week / propose_schedule_change). */
const PLAN_VERBS = [
  'תכנן', 'תכנני', 'לתכנן', 'תתכנן', 'תמליץ', 'תמליצי', 'להמליץ', 'תזיז', 'תזיזי', 'להזיז', 'תעביר', 'תעבירי', 'להעביר',
  'תסדר', 'תסדרי', 'לסדר', 'תארגן', 'תארגני', 'לארגן', 'plan',
] as const;
const SCHEDULE_NOUNS = ['שבוע', 'שבועי', 'שבועית', 'לוז', 'לוח', 'תוכנית', 'תכנית', 'מערכת', 'ימים', 'ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] as const;

/** Complaints / corrections — the answer missed; reason it out properly this time. */
const COMPLAINT =
  /לא\s+קשור|טעית|טעות|לא\s+נכון|לא\s+ביקשתי|לא\s+מה\s+ש|לא\s+הבנת|לא\s+הבנתי|כבר\s+אמרתי|אמרתי\s+לך|אמרתי\s+ש|זה\s+לא\s+מה|רובוטי|שטויות|לא\s+הגיוני|לא\s+רלוונטי|לא\s+עונה|לא\s+ענית|לא\s+עובד|מה\s+קשור|wrong|why/;

/** Greetings / acknowledgements — nothing to reason about. */
const ACK_TOKENS: ReadonlySet<string> = new Set([
  'היי', 'הי', 'שלום', 'הלו', 'אהלן', 'בוקר', 'ערב', 'לילה', 'טוב', 'תודה', 'רבה', 'סבבה', 'אחלה', 'מעולה', 'מגניב',
  'יופי', 'אוקיי', 'אוקי', 'ok', 'okay', 'thanks', 'hi', 'hey', 'תותח', 'מדהים', 'נהדר', 'אחי',
]);

/** Long, multi-request messages. */
const LONG_TOKENS = 22;
const LONG_CHARS = 140;

function questionCount(raw: string): number {
  return (raw.match(/\?/g) ?? []).length;
}

/**
 * Fast vs smart for one user message. Order matters: a complaint or a workout / schedule
 * ask is smart even when it's one word ("טבטה"); a greeting or thanks is always fast; a short
 * factual lookup ("מה יש לי היום", "מה הרמה שלי") is fast; anything else short follows the
 * previous turn's tier (a follow-up of a smart turn — "כן", "ומה עם רגליים?" — stays smart).
 */
export function classifyCoachTurn(input: RoutingInput): RoutingDecision {
  const raw = normalize(input.text);
  const toks = tokens(raw);

  // "למה" as a whole word only ("שלמה" — whole / complete — is not a complaint).
  if (COMPLAINT.test(raw) || toks.some((t) => t === 'למה' || t === 'ולמה')) return { tier: 'smart', reason: 'complaint' };

  const body = inferBodyIntent(input.text);
  const skills = hasStem(toks, SKILL_STEMS);
  const aerobic = hasStem(toks, AEROBIC_STEMS);
  const named = body.domains.length + (skills ? 1 : 0) + (aerobic ? 1 : 0) + (body.fullBody ? 1 : 0);
  if (named >= 2) return { tier: 'smart', reason: 'workout_combo' };

  const format = hasStem(toks, FORMAT_STEMS) || /יותר\s+(קשה|קל|קצר|ארוך)|(קשה|קל|קצר|ארוך)\s+יותר/.test(raw);
  if (format) return { tier: 'smart', reason: 'workout_format' };

  const planVerb = hasStem(toks, PLAN_VERBS);
  const scheduleNoun = hasStem(toks, SCHEDULE_NOUNS) || /לו["״']ז/.test(raw);
  if (planVerb || (scheduleNoun && /(לשנות|תשנה|תשני|להחליף|תחליף|תחליפי|לבנות|תבנה|תבני)/.test(raw))) {
    return { tier: 'smart', reason: 'schedule_planning' };
  }

  const buildVerb = hasStem(toks, BUILD_VERBS) || /(תן|תני|תנו)\s+לי\s+(אימון|משהו)/.test(raw);
  const workoutNoun = hasStem(toks, WORKOUT_NOUNS);
  const workoutDetail = named >= 1 || inferLocation(input.text) !== null || inferMinutes(input.text) !== null;
  if (buildVerb || (workoutNoun && workoutDetail)) return { tier: 'smart', reason: 'workout_build' };

  if (toks.length > LONG_TOKENS || raw.length > LONG_CHARS || questionCount(raw) >= 2) {
    return { tier: 'smart', reason: 'long_message' };
  }

  if (toks.length === 0 || toks.every((t) => ACK_TOKENS.has(t))) return { tier: 'fast', reason: 'acknowledgement' };
  const whatQuestion = /(^|\s)ו?מה\s/.test(raw);
  if (inferProgressQuestion(input.text) || inferScheduleQuestion(input.text) || /מה\s+יש\s+לי/.test(raw) || (whatQuestion && scheduleNoun)) {
    return { tier: 'fast', reason: 'factual_lookup' };
  }
  if (input.previousTurnSmart) return { tier: 'smart', reason: 'follow_up' };
  return { tier: 'fast', reason: 'short_default' };
}
