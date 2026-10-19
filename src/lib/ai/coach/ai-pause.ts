/**
 * Kelly paused — what the user sees, and what the team queue gets, when the AI gate refuses a
 * chat message (unified Kelly, kelly_unified_v1). Pure: no Firebase imports.
 *
 * Before this, a refused message was silently routed to the team queue: from the user's side
 * Kelly simply stopped answering (incident 19.10.2026: 47 messages in a day, past
 * rateLimitPerDay 40). Now the chat route stores the message and, once per pause window, a
 * short system reply in Kelly's (male) voice that says why and when he is back.
 *
 * Team queue rule (needsHuman):
 *   - rate_limited: the user is just chatting a lot, so the message is stored (the team can read
 *     it under "recent") but does NOT enter the queue, unless it looks like a real support
 *     request (looksLikeSupportRequest: "דחוף", a bug, payment, account, asking for a person…).
 *     The paused reply tells the user to write "דחוף" if it is urgent, which is exactly what
 *     puts the next message in the queue.
 *   - kill_switch / over_budget / unavailable: the AI is down for everyone and nobody else will
 *     answer, so every message enters the queue (as before).
 *   - a safety trigger (detectSafetyTrigger) always enters the queue, reason 'safety'.
 * The reason is stored as needsHumanReason on the thread doc so the admin queue can show and
 * filter it.
 */
import type { CoachGender } from './persona';

/** Gate denials the chat route answers itself (stores the message + a paused reply). */
export const AI_PAUSE_CODES = ['rate_limited', 'kill_switch', 'over_budget', 'unavailable'] as const;
export type AiPauseCode = (typeof AI_PAUSE_CODES)[number];

export function isAiPauseCode(v: unknown): v is AiPauseCode {
  return typeof v === 'string' && (AI_PAUSE_CODES as readonly string[]).includes(v);
}

/** Why a thread is in the admin queue (thread doc field needsHumanReason). */
export type NeedsHumanReason =
  | 'handoff'
  | 'team_only'
  | 'safety'
  | 'ai_rate_limited'
  | 'ai_kill_switch'
  | 'ai_over_budget'
  | 'ai_unavailable';

export const NEEDS_HUMAN_REASON_LABEL: Record<NeedsHumanReason, string> = {
  handoff: 'קלי ביקש צוות',
  team_only: 'ללא AI',
  safety: 'בטיחות',
  ai_rate_limited: 'מכסת AI',
  ai_kill_switch: 'AI כבוי',
  ai_over_budget: 'תקציב AI',
  ai_unavailable: 'AI לא זמין',
};

export function needsHumanReasonFor(code: AiPauseCode): NeedsHumanReason {
  return `ai_${code}` as NeedsHumanReason;
}

const SUPPORT_RE =
  /דחוף|בדחיפות|עזרה|תעזרו|תקלה|באג|בעיה|לא עובד|לא עובדת|לא נפתח|לא נטען|נתקע|תשלום|חיוב|חייבו|מנוי|לבטל|ביטול|החזר|חשבון|סיסמה|להתחבר|התחברות|למחוק|מחיקה|נציג|בן אדם|אדם אמיתי|מישהו מהצוות|תמיכה|שירות לקוחות|\b(?:urgent|help|bug|support|refund)\b/i;

/** A message that reads like a support request rather than more coaching chat. */
export function looksLikeSupportRequest(text: string): boolean {
  return SUPPORT_RE.test((text ?? '').normalize('NFC'));
}

/** Whether a paused message enters the admin queue (see the rule above). */
export function pausedMessageNeedsHuman(code: AiPauseCode, text: string): boolean {
  return code !== 'rate_limited' || looksLikeSupportRequest(text);
}

// ── Once per window ─────────────────────────────────────────────────────────

/** Re-notify at most this often when the reopen time is unknown (kill switch, outage). */
export const AI_PAUSE_UNKNOWN_WINDOW_MS = 60 * 60 * 1000;

/** Thread doc field aiPause: the last paused reply the user got. */
export interface AiPauseState {
  code: AiPauseCode;
  untilMs: number;
}

export function nextAiPause(code: AiPauseCode, nowMs: number, retryAfterSec?: number): AiPauseState {
  const ms = typeof retryAfterSec === 'number' && retryAfterSec > 0 ? retryAfterSec * 1000 : AI_PAUSE_UNKNOWN_WINDOW_MS;
  return { code, untilMs: nowMs + ms };
}

/** Send the paused reply unless the user already got one for this same pause. */
export function shouldSendPauseReply(prev: unknown, code: AiPauseCode, nowMs: number): boolean {
  const p = prev && typeof prev === 'object' ? (prev as Partial<AiPauseState>) : null;
  if (!p || p.code !== code || typeof p.untilMs !== 'number') return true;
  return nowMs >= p.untilMs;
}

// ── The reply text (Kelly is male; the user is addressed by core.gender; no slashes) ──

const TZ = 'Asia/Jerusalem';

function israelDateKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function israelClock(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
}

/**
 * "בסביבות 14:35" / "מחר בסביבות 09:10" (Israel time), rounded UP to 5 minutes so Kelly never
 * promises a time before he is actually back.
 */
export function reopenPhrase(retryAfterSec: number, now: Date): string {
  const fiveMin = 5 * 60 * 1000;
  const at = new Date(Math.ceil((now.getTime() + retryAfterSec * 1000) / fiveMin) * fiveMin);
  const today = israelDateKey(now);
  const tomorrow = israelDateKey(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const day = israelDateKey(at);
  const prefix = day === today ? '' : day === tomorrow ? 'מחר ' : 'בעוד יום ';
  return `${prefix}בסביבות ${israelClock(at)}`;
}

const WRITE_URGENT: Record<CoachGender, string> = {
  male: 'אם זה דחוף, תכתוב לי שזה דחוף והצוות שלנו יענה לך כאן.',
  female: 'אם זה דחוף, תכתבי לי שזה דחוף והצוות שלנו יענה לך כאן.',
  other: 'אם זה דחוף, אפשר לכתוב לי שזה דחוף והצוות שלנו יענה כאן.',
};

const TEAM_SEES = 'הצוות שלנו רואה את ההודעה שלך ויענה כאן בהקדם.';

/**
 * The paused reply, in Kelly's voice rules (persona.ts: no emoji, dashes, slashes or English).
 * `teamChannel` false (unified Kelly off): there is no team inbox behind the
 * chat, so the reply doesn't promise one.
 */
export function aiPauseReply(
  code: AiPauseCode,
  gender: CoachGender,
  opts: { retryAfterSec?: number; now?: Date; teamChannel?: boolean } = {},
): string {
  const now = opts.now ?? new Date();
  const team = opts.teamChannel !== false;
  if (code === 'rate_limited') {
    const sec = opts.retryAfterSec ?? 0;
    const opener = sec > 0 && sec <= 3600 ? 'דיברנו המון בשעה האחרונה.' : 'דיברנו המון היום.';
    const back = sec > 0 ? `אני חוזר לענות ${reopenPhrase(sec, now)}.` : 'אני חוזר לענות בהמשך.';
    return [opener, back, team ? WRITE_URGENT[gender] : ''].filter(Boolean).join(' ');
  }
  if (code === 'over_budget') {
    return ['אני לא זמין יותר היום, חוזר לענות מחר.', team ? TEAM_SEES : ''].filter(Boolean).join(' ');
  }
  return ['אני לא זמין כרגע.', team ? TEAM_SEES : 'כדאי לנסות שוב מאוחר יותר.'].filter(Boolean).join(' ');
}

// ── Client: what the chat screen does with a refused send ────────────────────

/**
 * - 'stored': the chat route already stored the message and Kelly's paused reply (unified);
 *   the live thread shows both, the screen just goes idle. AI stays the default, so the next
 *   message tries Kelly again (he answers as soon as the window reopens).
 * - 'team': unified, but this user has no AI (minor, no entitlement), or an older server: send
 *   the message to the team (/api/ai-coach/thread) and stay in team-only mode.
 * - 'error': show the error card (unified Kelly off, or anything else).
 */
export function refusedSendAction(
  err: { code?: string; storedForTeam?: boolean },
  ctx: { unified: boolean; isMessage: boolean; teamFallbackCodes: readonly string[] },
): 'stored' | 'team' | 'error' {
  if (!ctx.unified || !ctx.isMessage) return 'error';
  if (err.storedForTeam === true) return 'stored';
  if (ctx.teamFallbackCodes.includes(err.code ?? '')) return 'team';
  return 'error';
}
