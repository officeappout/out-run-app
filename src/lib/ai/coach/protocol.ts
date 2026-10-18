/**
 * AI coach — the wire protocol between the app and POST /api/ai-coach/chat. Pure.
 *
 * Request (JSON):
 *   { message: string }                                  a new user turn
 *   { toolResult: { id, outcome: ClientToolOutcome } }   answer to a client_tool event
 *
 * Response: text/event-stream, one JSON object per `data:` line:
 *   text         a chunk of Kelly's reply
 *   tool_status  a server tool is running (UI: "בודק...")
 *   card         a workout card to render (after a generate_workout result came back)
 *   actions      action chips under the reply (ids; label + target in action-chips.ts)
 *   client_tool  run this tool on the device, then POST {toolResult}; the stream ends here
 *   done         the turn is complete and saved
 *   error        the turn failed after the stream started
 * Denials before the stream starts (401/403/429/503) are plain JSON { error: code }.
 */
import { z } from 'zod';
import { ClientToolOutcomeSchema, type CoachLocation } from './tools';
import type { CoachGender } from './persona';
import type { CoachActionId } from './action-chips';

export const CHAT_MESSAGE_MAX_CHARS = 1000;

export const ChatRequestSchema = z.union([
  z.object({ message: z.string().trim().min(1).max(CHAT_MESSAGE_MAX_CHARS) }),
  z.object({
    toolResult: z.object({ id: z.string().min(1).max(100), outcome: ClientToolOutcomeSchema }),
  }),
]);
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export interface WorkoutCard {
  type: 'workout';
  workoutId: string;
  title: string;
  minutes: number;
  exerciseCount: number;
  location: CoachLocation;
  /** Base domains the workout was built for (push / pull / legs / core; empty = full body). Absent on older cards. */
  domains?: string[];
  /** 1 easy, 2 balanced, 3 intense. Absent on older cards. */
  difficulty?: number;
}

export type CoachStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_status'; name: string }
  | { type: 'card'; card: WorkoutCard }
  | { type: 'actions'; actions: CoachActionId[] }
  | { type: 'client_tool'; id: string; name: string; input: unknown }
  | { type: 'done'; messageId: string | null }
  | { type: 'error'; code: CoachStreamErrorCode };

export type CoachStreamErrorCode = 'model_error' | 'rate_limited' | 'overloaded' | 'internal';

export function encodeSse(event: CoachStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Incremental SSE parser: feed raw text chunks, get complete events back. Tolerates
 * chunk boundaries anywhere (mid-line, mid-JSON). Malformed lines are skipped.
 */
export function createSseParser(): (chunk: string) => CoachStreamEvent[] {
  let buf = '';
  return (chunk: string) => {
    buf += chunk;
    const out: CoachStreamEvent[] = [];
    let idx: number;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue;
        try {
          out.push(JSON.parse(line.slice(5).trim()) as CoachStreamEvent);
        } catch {
          /* skip malformed frame */
        }
      }
    }
    return out;
  };
}

/** "אימון בטן ורגליים בבית · 25 דק׳ · 6 תרגילים" */
export function workoutCardLabel(card: Pick<WorkoutCard, 'title' | 'minutes' | 'exerciseCount'>): string {
  const ex = card.exerciseCount === 1 ? 'תרגיל אחד' : `${card.exerciseCount} תרגילים`;
  return `${card.title} · ${card.minutes} דק׳ · ${ex}`;
}

// ─── Errors → friendly Hebrew (UI) ───────────────────────────────────────────

export interface CoachUiError {
  title: string;
  body: string;
  /** Offer the regular workout builder sheet as the way forward. */
  offerBuilder: boolean;
  /** The user can just try again (button shown). */
  retryable: boolean;
}

export interface CoachErrorInput {
  offline?: boolean;
  status?: number;
  code?: string;
  retryAfterSec?: number;
}

const tryAgain: Record<CoachGender, string> = {
  male: 'נסה שוב בעוד רגע.',
  female: 'נסי שוב בעוד רגע.',
  other: 'אפשר לנסות שוב בעוד רגע.',
};

/** Maps a failed request (or no network) to what the chat screen shows. Never English. */
export function describeCoachError(e: CoachErrorInput, gender: CoachGender): CoachUiError {
  if (e.offline) {
    return {
      title: 'אין חיבור',
      body: 'קלי AI צריך אינטרנט. בינתיים אפשר לבנות אימון בבונה האימונים.',
      offerBuilder: true,
      retryable: true,
    };
  }
  if (e.status === 429 || e.code === 'rate_limited') {
    const daily = (e.retryAfterSec ?? 0) > 3600;
    return {
      title: 'הגענו למכסה',
      body: daily
        ? 'להיום סיימנו את מכסת ההודעות. נמשיך מחר, ובינתיים אפשר לבנות אימון בבונה האימונים.'
        : 'הרבה הודעות בזמן קצר. אפשר לחזור אליי בעוד שעה, ובינתיים לבנות אימון בבונה האימונים.',
      offerBuilder: true,
      retryable: false,
    };
  }
  if (e.status === 503 || e.code === 'kill_switch' || e.code === 'over_budget' || e.code === 'unavailable' || e.code === 'overloaded') {
    return {
      title: 'קלי AI לא זמין כרגע',
      body: 'אפשר לבנות אימון בבונה האימונים הרגיל, ולחזור אליי מאוחר יותר.',
      offerBuilder: true,
      retryable: true,
    };
  }
  if (e.status === 403) {
    return {
      title: 'קלי AI עוד לא פתוח כאן',
      body: 'הגישה לקלי AI עדיין לא פתוחה לחשבון הזה.',
      offerBuilder: true,
      retryable: false,
    };
  }
  if (e.status === 401) {
    return { title: 'צריך להתחבר מחדש', body: 'החיבור לחשבון פג. אחרי התחברות נמשיך מאותה נקודה.', offerBuilder: false, retryable: false };
  }
  return { title: 'משהו השתבש', body: tryAgain[gender], offerBuilder: false, retryable: true };
}
