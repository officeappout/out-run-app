/**
 * Unified Kelly (kelly_unified_v1) — the screen reducer with the live listener: SNAPSHOT is
 * the truth, optimistic / streaming bubbles are dropped once their stored copy arrives, and
 * team-only sends end without an AI turn.
 */
import { describe, expect, it } from 'vitest';
import { LIVE_ID, chatReducer, initialChatState, mergeSnapshot, type UiMessage } from '../state/chat-machine';

const stored = (id: string, role: 'user' | 'assistant', text: string, source: UiMessage['source']): UiMessage => ({ id, role, text, cards: [], source });

describe('mergeSnapshot', () => {
  it('first snapshot ends loading', () => {
    const s = chatReducer(initialChatState, { type: 'SNAPSHOT', messages: [stored('w', 'assistant', 'ברוך הבא', 'system')] });
    expect(s.phase).toBe('idle');
    expect(s.messages.map((m) => m.id)).toEqual(['w']);
  });

  it('optimistic user bubble is replaced by its stored copy', () => {
    let s = chatReducer({ ...initialChatState, phase: 'idle' }, { type: 'SEND', id: 'u-1', text: 'שאלה' });
    expect(s.messages.map((m) => m.id)).toEqual(['u-1']);
    s = chatReducer(s, { type: 'SNAPSHOT', messages: [stored('s1', 'user', 'שאלה', 'user')] });
    expect(s.messages.map((m) => m.id)).toEqual(['s1']);
  });

  it('streaming bubble stays until its stored copy (by text, or by id after done)', () => {
    const live: UiMessage = { id: LIVE_ID, role: 'assistant', text: 'חלק', cards: [] };
    expect(mergeSnapshot([live], [stored('s1', 'user', 'q', 'user')]).map((m) => m.id)).toEqual(['s1', LIVE_ID]);
    const full = { ...live, text: 'תשובה מלאה' };
    expect(mergeSnapshot([full], [stored('a1', 'assistant', 'תשובה מלאה', 'ai')]).map((m) => m.id)).toEqual(['a1']);
    const done = { ...full, id: 'a1' };
    expect(mergeSnapshot([done], [stored('a1', 'assistant', 'תשובה מלאה', 'ai')]).map((m) => m.id)).toEqual(['a1']);
  });

  it('a team reply arriving mid-conversation shows with its source', () => {
    const prev = [stored('s1', 'user', 'q', 'user')];
    const next = [...prev, { ...stored('h1', 'assistant', 'מהצוות', 'human'), senderName: 'קלי · צוות OUT' }];
    const out = mergeSnapshot(prev, next);
    expect(out.map((m) => [m.id, m.source])).toEqual([['s1', 'user'], ['h1', 'human']]);
  });

  it('TEAM_SENT ends the send without an AI turn', () => {
    let s = chatReducer({ ...initialChatState, phase: 'idle' }, { type: 'SEND', id: 'u-1', text: 'שאלה' });
    expect(s.phase).toBe('sending');
    s = chatReducer(s, { type: 'TEAM_SENT' });
    expect(s.phase).toBe('idle');
  });
});
