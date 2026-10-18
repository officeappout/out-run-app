import { describe, it, expect } from 'vitest';
import { chatReducer, initialChatState, isBusy, LIVE_ID, type ChatAction, type ChatState } from '../state/chat-machine';
import type { WorkoutCard } from '@/lib/ai/coach/protocol';

const run = (actions: ChatAction[], from: ChatState = initialChatState) => actions.reduce(chatReducer, from);

const CARD: WorkoutCard = { type: 'workout', workoutId: 'ai-x-123456', title: 'אימון בטן ורגליים', minutes: 25, exerciseCount: 6, location: 'home' };

describe('chat state machine', () => {
  it('client_tool round trip: send → text → client_tool → posted → card → text → done', () => {
    let s = run([{ type: 'HISTORY_LOADED', messages: [] }]);
    expect(s.phase).toBe('idle');

    s = run([{ type: 'SEND', id: 'u1', text: 'אימון בטן ורגליים בבית' }], s);
    expect(s.phase).toBe('sending');
    expect(isBusy(s)).toBe(true);

    s = run([{ type: 'EVENT', event: { type: 'text', delta: 'בונה לך אימון.' } }], s);
    expect(s.phase).toBe('streaming');

    s = run([{ type: 'EVENT', event: { type: 'client_tool', id: 'gw1', name: 'generate_workout', input: {} } }], s);
    expect(s.phase).toBe('running_tool');
    expect(s.toolCall?.id).toBe('gw1');

    // Sending while the tool runs is ignored.
    expect(run([{ type: 'SEND', id: 'u2', text: 'עוד' }], s)).toBe(s);

    s = run([{ type: 'TOOL_POSTED' }], s);
    expect(s.phase).toBe('sending');
    expect(s.toolCall).toBeNull();

    s = run(
      [
        { type: 'EVENT', event: { type: 'card', card: CARD } },
        { type: 'EVENT', event: { type: 'card', card: CARD } }, // duplicate ignored
        { type: 'EVENT', event: { type: 'text', delta: '\nלחץ על הכרטיס.' } },
        { type: 'EVENT', event: { type: 'done', messageId: 'm9' } },
      ],
      s,
    );
    expect(s.phase).toBe('idle');
    expect(s.messages.map((m) => m.id)).toEqual(['u1', 'm9']);
    expect(s.messages[1]).toMatchObject({ role: 'assistant', text: 'בונה לך אימון.\nלחץ על הכרטיס.', cards: [CARD] });
  });

  it('a stream error drops an empty live bubble and stores the error', () => {
    const s = run([
      { type: 'HISTORY_LOADED', messages: [] },
      { type: 'SEND', id: 'u1', text: 'x' },
      { type: 'EVENT', event: { type: 'error', code: 'overloaded' } },
    ]);
    expect(s.phase).toBe('error');
    expect(s.error).toEqual({ code: 'overloaded' });
    expect(s.messages.some((m) => m.id === LIVE_ID)).toBe(false);
  });

  it('HTTP 429 → error phase with status + retryAfter, then dismiss → idle', () => {
    let s = run([
      { type: 'HISTORY_LOADED', messages: [] },
      { type: 'SEND', id: 'u1', text: 'x' },
      { type: 'FAILED', error: { status: 429, code: 'rate_limited', retryAfterSec: 3600 } },
    ]);
    expect(s.phase).toBe('error');
    expect(s.error).toMatchObject({ status: 429, retryAfterSec: 3600 });
    s = run([{ type: 'DISMISS_ERROR' }], s);
    expect(s.phase).toBe('idle');
    expect(s.error).toBeNull();
  });

  it('history arriving after the first local message keeps order (history first)', () => {
    const s = run([
      { type: 'HISTORY_LOADED', messages: [{ id: 'h1', role: 'assistant', text: 'old', cards: [] }] },
    ]);
    expect(s.messages[0].id).toBe('h1');
  });
});
