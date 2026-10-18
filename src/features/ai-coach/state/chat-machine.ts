/**
 * AI coach chat screen state — a pure reducer, so the client_tool round trip is testable
 * without React:
 *
 *   idle ─SEND─► sending ─text─► streaming ─client_tool─► running_tool ─TOOL_POSTED─► sending
 *                   │               │                                                 │
 *                   └──── done ─────┴──────────────── done ◄──── card / text ─────────┘
 *   any ─FAILED / error event─► error ─DISMISS─► idle
 *
 * `workoutBuild` drives the workout card's skeleton / error state: 'building' from the
 * generate_workout client_tool until the card arrives (or the turn ends), 'failed' when the
 * device could not build it (cleared by the next SEND).
 *
 * The live assistant bubble has id LIVE_ID until `done` gives it the stored message id.
 */
import type { CoachStreamEvent, CoachErrorInput, WorkoutCard } from '@/lib/ai/coach/protocol';
import type { CoachActionId } from '@/lib/ai/coach/action-chips';

export const LIVE_ID = '__live__';

export interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  cards: WorkoutCard[];
  /** Action chips under an assistant reply ("פתח את הלו״ז"). */
  actions?: CoachActionId[];
}

export type ChatPhase = 'loading' | 'idle' | 'sending' | 'streaming' | 'running_tool' | 'error';

export type WorkoutBuildState = 'idle' | 'building' | 'failed';

export interface ChatState {
  phase: ChatPhase;
  messages: UiMessage[];
  /** A server tool is running (UI: "בודק..."). */
  toolStatus: string | null;
  /** The client tool the device must run now. */
  toolCall: { id: string; name: string; input: unknown } | null;
  error: CoachErrorInput | null;
  lastUserText: string | null;
  /** The workout card placeholder: skeleton while building, error card when it failed. */
  workoutBuild: WorkoutBuildState;
}

export type ChatAction =
  | { type: 'HISTORY_LOADED'; messages: UiMessage[] }
  | { type: 'SEND'; id: string; text: string }
  | { type: 'EVENT'; event: CoachStreamEvent }
  /** The device ran the client tool and posted its result; `ok` false = it failed. */
  | { type: 'TOOL_POSTED'; ok?: boolean }
  | { type: 'FAILED'; error: CoachErrorInput }
  | { type: 'DISMISS_ERROR' };

export const initialChatState: ChatState = {
  phase: 'loading',
  messages: [],
  toolStatus: null,
  toolCall: null,
  error: null,
  lastUserText: null,
  workoutBuild: 'idle',
};

function withLive(messages: UiMessage[], fn: (m: UiMessage) => UiMessage): UiMessage[] {
  const idx = messages.findIndex((m) => m.id === LIVE_ID);
  if (idx === -1) return [...messages, fn({ id: LIVE_ID, role: 'assistant', text: '', cards: [] })];
  const next = messages.slice();
  next[idx] = fn(next[idx]);
  return next;
}

function dropEmptyLive(messages: UiMessage[]): UiMessage[] {
  return messages.filter((m) => m.id !== LIVE_ID || m.text.trim() || m.cards.length);
}

export function isBusy(s: ChatState): boolean {
  return s.phase === 'sending' || s.phase === 'streaming' || s.phase === 'running_tool';
}

export function chatReducer(s: ChatState, a: ChatAction): ChatState {
  switch (a.type) {
    case 'HISTORY_LOADED':
      return { ...s, phase: s.phase === 'loading' ? 'idle' : s.phase, messages: [...a.messages, ...s.messages] };

    case 'SEND':
      if (isBusy(s)) return s;
      return {
        ...s,
        phase: 'sending',
        error: null,
        toolCall: null,
        toolStatus: null,
        lastUserText: a.text,
        workoutBuild: 'idle',
        messages: [...s.messages.filter((m) => m.id !== LIVE_ID), { id: a.id, role: 'user', text: a.text, cards: [] }],
      };

    case 'EVENT': {
      const ev = a.event;
      switch (ev.type) {
        case 'text':
          return { ...s, phase: 'streaming', toolStatus: null, messages: withLive(s.messages, (m) => ({ ...m, text: m.text + ev.delta })) };
        case 'tool_status':
          return { ...s, toolStatus: ev.name };
        case 'card':
          return {
            ...s,
            workoutBuild: 'idle',
            messages: withLive(s.messages, (m) =>
              m.cards.some((c) => c.workoutId === ev.card.workoutId) ? m : { ...m, cards: [...m.cards, ev.card] },
            ),
          };
        case 'actions':
          return { ...s, messages: withLive(s.messages, (m) => ({ ...m, actions: Array.from(new Set([...(m.actions ?? []), ...ev.actions])) })) };
        case 'client_tool':
          return {
            ...s,
            phase: 'running_tool',
            toolStatus: null,
            toolCall: { id: ev.id, name: ev.name, input: ev.input },
            workoutBuild: ev.name === 'generate_workout' ? 'building' : s.workoutBuild,
          };
        case 'done':
          return {
            ...s,
            phase: 'idle',
            toolStatus: null,
            toolCall: null,
            workoutBuild: s.workoutBuild === 'building' ? 'idle' : s.workoutBuild,
            messages: dropEmptyLive(s.messages).map((m) => (m.id === LIVE_ID ? { ...m, id: ev.messageId ?? `local-${s.messages.length}` } : m)),
          };
        case 'error':
          return {
            ...s,
            phase: 'error',
            toolStatus: null,
            toolCall: null,
            error: { code: ev.code },
            workoutBuild: s.workoutBuild === 'building' ? 'idle' : s.workoutBuild,
            messages: dropEmptyLive(s.messages),
          };
        default:
          return s;
      }
    }

    case 'TOOL_POSTED':
      return { ...s, phase: 'sending', toolCall: null, workoutBuild: a.ok === false && s.workoutBuild === 'building' ? 'failed' : s.workoutBuild };

    case 'FAILED':
      return {
        ...s,
        phase: 'error',
        toolStatus: null,
        toolCall: null,
        error: a.error,
        workoutBuild: s.workoutBuild === 'building' ? 'idle' : s.workoutBuild,
        messages: dropEmptyLive(s.messages),
      };

    case 'DISMISS_ERROR':
      return { ...s, phase: 'idle', error: null };

    default:
      return s;
  }
}
