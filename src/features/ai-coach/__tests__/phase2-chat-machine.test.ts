/**
 * Kelly phase 2 — the screen state: quick replies and the proposal card land on the live
 * reply, survive `done`, and the card's status updates locally.
 */
import { describe, it, expect } from 'vitest';
import { chatReducer, initialChatState, LIVE_ID, type ChatState } from '../state/chat-machine';

const run = (s: ChatState, ...events: Parameters<typeof chatReducer>[1][]) => events.reduce(chatReducer, s);

describe('chat machine — phase 2 events', () => {
  it('suggestions + proposal attach to the live reply and keep the stored id after done', () => {
    let s = run({ ...initialChatState, phase: 'idle' }, { type: 'SEND', id: 'u-1', text: 'תזיז את האימון של שלישי לרביעי' });
    s = run(
      s,
      { type: 'EVENT', event: { type: 'text', delta: 'הכנתי הצעה.' } },
      { type: 'EVENT', event: { type: 'proposal', proposal: { id: 'p1', status: 'pending', scope: 'from_now', title: 't', lines: ['x'] } } },
      { type: 'EVENT', event: { type: 'suggestions', suggestions: [{ id: 'week', label: 'מה בתוכנית השבוע?' }] } },
    );
    const live = s.messages.find((m) => m.id === LIVE_ID)!;
    expect(live.proposal?.id).toBe('p1');
    expect(live.suggestions?.[0].id).toBe('week');
    s = run(s, { type: 'EVENT', event: { type: 'done', messageId: 'm9' } });
    const stored = s.messages.find((m) => m.id === 'm9')!;
    expect(stored.proposal?.status).toBe('pending');
    s = run(s, { type: 'PROPOSAL_STATUS', messageId: 'm9', status: 'applied' });
    expect(s.messages.find((m) => m.id === 'm9')!.proposal?.status).toBe('applied');
  });
  it('PROPOSAL_STATUS on a message without a proposal changes nothing', () => {
    const s = { ...initialChatState, phase: 'idle' as const, messages: [{ id: 'a', role: 'assistant' as const, text: 'x', cards: [] }] };
    expect(chatReducer(s, { type: 'PROPOSAL_STATUS', messageId: 'a', status: 'applied' }).messages[0]).toEqual(s.messages[0]);
  });
});
