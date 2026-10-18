import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/features/social/services/kelly-welcome-bot.service', () => ({
  KELLY_UID: 'system_kelly_coach',
  KELLY_NAME: 'קלי (OutRun Coach)',
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__ts', increment: (n: number) => ({ __inc: n }) },
  Timestamp: { fromMillis: (ms: number) => ({ toMillis: () => ms }) },
}));

import { executeServerTool, explainWorkout, type ServerToolContext } from '../server-tools.server';

function fakeDb(chatExists: boolean) {
  const writes: Array<{ op: string; path: string; data: any }> = [];
  const ref = (path: string): any => ({
    path,
    collection: (c: string) => ({ doc: (id?: string) => ref(`${path}/${c}/${id ?? 'auto'}`) }),
  });
  return {
    writes,
    collection: (c: string) => ({ doc: (id: string) => ref(`${c}/${id}`) }),
    runTransaction: async (fn: any) =>
      fn({
        get: async () => ({ exists: chatExists }),
        set: (r: any, data: any) => writes.push({ op: 'set', path: r.path, data }),
        update: (r: any, data: any) => writes.push({ op: 'update', path: r.path, data }),
      }),
  };
}

function ctx(db: any, cards: Array<[string, any]> = []): ServerToolContext {
  return {
    db,
    uid: 'u1',
    profile: { core: { name: 'דנה כהן', email: 'x@example.com' } },
    now: new Date('2026-10-18T09:00:00Z'),
    knownCards: new Map(cards),
    turn: { handoffDone: false },
  };
}

describe('explain_workout', () => {
  it('unknown id → error, never a made-up explanation', () => {
    const r = explainWorkout(ctx(fakeDb(false)), { workoutId: 'ai-nope-000000' });
    expect(r.isError).toBe(true);
  });

  it('renders the coach note from the stored decision record', () => {
    const record = {
      v: 1,
      seed: 1,
      reasons: [{ code: 'RETURNING', days: 6 }],
      expect: {
        structure: 'straight',
        protocol: 'straight',
        exercisesCount: 6,
        setsRange: { min: 3, max: 3 },
        repRange: { min: 10, max: 12, unit: 'reps' },
        restRange: { min: 60, max: 90 },
        intensityWord: 'balanced',
        durationMin: 25,
      },
    };
    const card = { type: 'workout', workoutId: 'ai-a-111111', title: 'אימון', minutes: 25, exerciseCount: 6, location: 'home', decisionRecord: record };
    const r = explainWorkout(ctx(fakeDb(false), [['ai-a-111111', card]]), { workoutId: 'ai-a-111111' });
    const body = JSON.parse(r.content);
    expect(body.coachNote.length).toBeGreaterThanOrEqual(2);
    expect(body.coachNote.join(' ')).toContain('6');
    expect(body.reasons).toEqual(record.reasons);
  });
});

describe('handoff_to_human', () => {
  it('existing Kelly DM: one message in the user name + chat update, once per turn', async () => {
    const db = fakeDb(true);
    const c = ctx(db);
    const r = await executeServerTool(c, 'handoff_to_human', { summary: 'רוצה לדבר עם מאמנת על תוכנית ריצה' });
    expect(JSON.parse(r.content)).toEqual({ sent: true });
    const msg = db.writes.find((w) => w.op === 'set')!;
    expect(msg.path).toBe('chats/system_kelly_coach_u1/messages/auto');
    expect(msg.data).toMatchObject({ senderUid: 'u1', senderName: 'דנה', type: 'text', source: 'ai_coach_handoff' });
    expect(msg.data.text).toBe('סיכום מקלי AI: רוצה לדבר עם מאמנת על תוכנית ריצה');
    const upd = db.writes.find((w) => w.op === 'update')!;
    expect(upd.data).toMatchObject({ lastSenderId: 'u1', 'unreadCount.system_kelly_coach': { __inc: 1 } });
    // No contact details leak into the DM.
    expect(JSON.stringify(db.writes)).not.toContain('example.com');

    const again = await executeServerTool(c, 'handoff_to_human', { summary: 'שוב' });
    expect(again.isError).toBe(true);
  });

  it('no DM yet: creates it with the welcome-bot shape', async () => {
    const db = fakeDb(false);
    await executeServerTool(ctx(db), 'handoff_to_human', { summary: 'צריכה עזרה עם התוכנית' });
    const chat = db.writes.find((w) => w.path === 'chats/system_kelly_coach_u1')!;
    expect(chat.data).toMatchObject({
      participants: ['u1', 'system_kelly_coach'],
      type: 'dm',
      lastSenderId: 'u1',
      unreadCount: { u1: 0, system_kelly_coach: 1 },
    });
  });
});
