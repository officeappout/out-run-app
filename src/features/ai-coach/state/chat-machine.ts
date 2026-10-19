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
import type { CoachActionId, WorkoutRating } from '@/lib/ai/coach/action-chips';
import type { KellyMessageSource } from '@/lib/ai/coach/unified-thread';
import type { SuggestionChip } from '@/lib/ai/coach/suggestions/types';
import type { ProposalStatus, ProposalView } from '@/lib/ai/coach/schedule-proposal/types';

export const LIVE_ID = '__live__';

export interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  cards: WorkoutCard[];
  /** Action chips under an assistant reply ("פתח את הלו״ז"). */
  actions?: CoachActionId[];
  /** Unified Kelly only: who wrote a stored message (team replies get their own bubble). */
  source?: KellyMessageSource;
  senderName?: string;
  /** Kelly phase 2: quick replies under this reply (shown under the newest one only). */
  suggestions?: SuggestionChip[];
  /** Kelly phase 2: a schedule change awaiting the user's "אשר". */
  proposal?: ProposalView;
  /** Kelly phase 3: the user's answer to a post-workout "איך היה?" (stored server-side). */
  rated?: WorkoutRating;
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
  /** Unified Kelly: the live listener's current stored messages (oldest first). */
  | { type: 'SNAPSHOT'; messages: UiMessage[] }
  /** Unified Kelly, team-only mode: the message was stored for the team (no AI turn). */
  | { type: 'TEAM_SENT' }
  | { type: 'SEND'; id: string; text: string }
  | { type: 'EVENT'; event: CoachStreamEvent }
  /** The device ran the client tool and posted its result; `ok` false = it failed. */
  | { type: 'TOOL_POSTED'; ok?: boolean }
  | { type: 'FAILED'; error: CoachErrorInput }
  /** Kelly phase 2: the confirm card's status changed on this device (before the stored copy arrives). */
  | { type: 'PROPOSAL_STATUS'; messageId: string; status: ProposalStatus }
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

/**
 * Unified Kelly: the stored messages from the live listener are the truth; what's local on top
 * of them is the optimistic user bubble ('u-…'), the streaming bubble (LIVE_ID) and a finished
 * reply whose stored copy hasn't arrived yet. Each local is dropped once its stored copy is in
 * the snapshot (same id, or the same text for the optimistic / live bubbles).
 */
export function mergeSnapshot(current: UiMessage[], stored: UiMessage[]): UiMessage[] {
  const ids = new Set(stored.map((m) => m.id));
  const recent = stored.slice(-12);
  const userTexts = recent.filter((m) => m.role === 'user').map((m) => m.text.trim());
  const replyTexts = recent.filter((m) => m.role === 'assistant').map((m) => m.text.trim());
  const locals = current.filter((m) => {
    if (ids.has(m.id)) return false;
    if (m.id.startsWith('u-')) return !userTexts.includes(m.text.trim());
    if (m.id === LIVE_ID) return !(m.text.trim() && replyTexts.includes(m.text.trim()));
    // A finished reply still waiting for its stored copy; anything else was stored before.
    return m.role === 'assistant' && !m.source;
  });
  return [...stored, ...locals];
}

export function isBusy(s: ChatState): boolean {
  return s.phase === 'sending' || s.phase === 'streaming' || s.phase === 'running_tool';
}

export function chatReducer(s: ChatState, a: ChatAction): ChatState {
  switch (a.type) {
    case 'HISTORY_LOADED':
      return { ...s, phase: s.phase === 'loading' ? 'idle' : s.phase, messages: [...a.messages, ...s.messages] };

    case 'SNAPSHOT':
      return { ...s, phase: s.phase === 'loading' ? 'idle' : s.phase, messages: mergeSnapshot(s.messages, a.messages) };

    case 'TEAM_SENT':
      return s.phase === 'sending' ? { ...s, phase: 'idle' } : s;

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
        case 'suggestions':
          return { ...s, messages: withLive(s.messages, (m) => ({ ...m, suggestions: ev.suggestions })) };
        case 'proposal':
          return { ...s, messages: withLive(s.messages, (m) => ({ ...m, proposal: ev.proposal })) };
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

    case 'PROPOSAL_STATUS':
      return {
        ...s,
        messages: s.messages.map((m) => (m.id === a.messageId && m.proposal ? { ...m, proposal: { ...m.proposal, status: a.status } } : m)),
      };

    case 'DISMISS_ERROR':
      return { ...s, phase: 'idle', error: null };

    default:
      return s;
  }
}
