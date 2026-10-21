/* eslint-disable @typescript-eslint/no-explicit-any -- in-memory Firestore stand-in */
/**
 * K0 F6 — the nightly memory pass reads the NEWEST messages after the checkpoint (it used to
 * read the oldest 120, so a long history kept today's conversation unread for weeks), and the
 * checkpoint moves to the newest message read. Fake db: a real ordered / filtered / limited
 * query over ai_coach_threads/{uid}/messages, Timestamp-shaped createdAt (toMillis, no getTime).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const st = vi.hoisted(() => ({ prompts: [] as string[], answer: '{"add":[],"update":[],"remove":[]}' }));

vi.mock('server-only', () => ({}));
vi.mock('firebase-admin/firestore', () => ({
  Timestamp: { fromMillis: (ms: number) => ({ toMillis: () => ms }) },
  FieldValue: { serverTimestamp: () => '__ts__' },
}));
vi.mock('@/lib/ai/anthropic.server', () => ({
  assertAiBudget: async () => {},
  getAiModel: () => 'fast-test',
  withPromptCaching: (x: unknown) => x,
  recordAiUsage: async () => ({ costUsd: 0.001 }),
  getAnthropicClient: () => ({
    messages: {
      create: async (req: any) => {
        st.prompts.push(req.messages[0].content);
        return { content: [{ type: 'text', text: st.answer }], usage: { input_tokens: 10, output_tokens: 5 }, stop_reason: 'end_turn' };
      },
    },
  }),
}));

import { MEMORY_BATCH_MAX, MEMORY_READ_WINDOW, extractMemoryForUser, newUserMessages } from '../extract.server';

type Msg = { id: string; role?: string; source?: string; text: string; at: number };

function makeDb(messages: Msg[], memory: Record<string, unknown> | null = null) {
  const store: { memory: Record<string, unknown> | null } = { memory };
  const reads: Array<{ dir: string; limit: number }> = [];
  const messagesQuery = () => {
    let since = -Infinity;
    let dir = 'asc';
    let lim = Infinity;
    const q: any = {
      where: (field: string, op: string, v: any) => {
        expect(field).toBe('createdAt');
        expect(op).toBe('>');
        since = v.toMillis();
        return q;
      },
      orderBy: (_f: string, d: string) => {
        dir = d;
        return q;
      },
      limit: (n: number) => {
        lim = n;
        return q;
      },
      get: async () => {
        reads.push({ dir, limit: lim });
        const rows = messages.filter((m) => m.at > since).sort((a, b) => (dir === 'desc' ? b.at - a.at : a.at - b.at)).slice(0, lim);
        return {
          docs: rows.map((m) => ({
            id: m.id,
            data: () => ({ role: m.role, ...(m.source ? { source: m.source } : {}), text: m.text, createdAt: { toMillis: () => m.at } }),
          })),
        };
      },
    };
    return q;
  };
  const db: any = {
    collection: (name: string) => ({
      doc: () => {
        if (name === 'ai_coach_memory') {
          return {
            get: async () => ({ exists: !!store.memory, data: () => store.memory }),
            set: async (v: Record<string, unknown>) => {
              store.memory = { ...(store.memory ?? {}), ...v };
            },
          };
        }
        expect(name).toBe('ai_coach_threads');
        return { collection: (sub: string) => (expect(sub).toBe('messages'), messagesQuery()) };
      },
    }),
  };
  return { db, store, reads };
}

/** A long chat: user / Kelly alternating, one minute apart. */
function longChat(n: number, opts: { unified?: boolean } = {}): Msg[] {
  return Array.from({ length: n }, (_, k) => {
    const user = k % 2 === 0;
    const base = { id: `m${String(k).padStart(4, '0')}`, text: `הודעה ${k}`, at: 1_000_000 + k * 60_000 };
    if (opts.unified) return { ...base, role: user ? 'user' : 'assistant', source: user ? 'user' : 'ai' };
    return { ...base, role: user ? 'user' : 'assistant' };
  });
}

beforeEach(() => {
  st.prompts = [];
});

describe('K0 F6: memory reads the newest messages after the checkpoint', () => {
  it('a backlog > 120: the newest window, newest 40 user messages oldest-first, checkpoint = the newest message', async () => {
    const msgs = longChat(300);
    const { db, store, reads } = makeDb(msgs);
    const r = await extractMemoryForUser(db, 'u1', 5_000_000_000);
    expect(r.status).toBe('unchanged');
    expect(reads[0]).toEqual({ dir: 'desc', limit: MEMORY_READ_WINDOW });
    const prompt = st.prompts[0];
    // The very last user message (k = 298) is in; the oldest ones (k = 0 … 178) are not.
    expect(prompt).toContain('m0298: הודעה 298');
    expect(prompt).not.toContain('m0000:');
    expect(prompt).not.toContain('m0170:');
    // At most 40, oldest first.
    const ids = (prompt.match(/m\d{4}:/g) ?? []).map((m) => Number(m.slice(1, 5)));
    expect(ids).toHaveLength(MEMORY_BATCH_MAX);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(ids[0]).toBe(298 - 2 * (MEMORY_BATCH_MAX - 1));
    // Kelly's reply (k = 299) is the newest message: the checkpoint moves past it.
    expect(store.memory?.extractedUntil).toBe(msgs[299].at);
  });

  it('the next pass after that checkpoint has nothing new (no model call)', async () => {
    const msgs = longChat(300);
    const { db } = makeDb(msgs, { facts: [], extractedUntil: msgs[299].at });
    expect(await extractMemoryForUser(db, 'u1')).toEqual({ status: 'no_new_messages' });
    expect(st.prompts).toHaveLength(0);
  });

  it('only what came after the checkpoint is read, and a later message moves it forward', async () => {
    const msgs = longChat(10);
    const { db, store } = makeDb(msgs, { facts: [], extractedUntil: msgs[5].at });
    await extractMemoryForUser(db, 'u1');
    expect(st.prompts[0]).toContain('m0006:');
    expect(st.prompts[0]).toContain('m0008:');
    expect(st.prompts[0]).not.toContain('m0004:');
    expect(store.memory?.extractedUntil).toBe(msgs[9].at);
  });

  it('unified Kelly messages (source user / ai) are read from the same thread: only the user-written ones', async () => {
    const msgs = [...longChat(6, { unified: true }), { id: 'team1', role: 'assistant', source: 'human', text: 'צוות', at: 2_000_000_000 }];
    const { db } = makeDb(msgs);
    const r = await newUserMessages(db, 'u1', 0);
    expect(r.user.map((m) => m.id)).toEqual(['m0000', 'm0002', 'm0004']);
    expect(r.newestAt).toBe(2_000_000_000);
  });

  it('a broken model answer still marks the batch read (no second bill), at the newest message', async () => {
    st.answer = 'not json';
    const msgs = longChat(200);
    const { db, store } = makeDb(msgs);
    const r = await extractMemoryForUser(db, 'u1');
    expect(r.status).toBe('model_unusable');
    expect(store.memory?.extractedUntil).toBe(msgs[199].at);
    st.answer = '{"add":[],"update":[],"remove":[]}';
  });
});
