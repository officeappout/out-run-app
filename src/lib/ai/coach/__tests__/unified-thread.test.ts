/**
 * Unified Kelly (kelly_unified_v1) — pure pieces: source mapping, TTL / push rules, model
 * history labelling (with the real historyToModelMessages), team-only flood guard, admin reply
 * validation, header badge, the welcome copy, and the DM migration mapping + idempotency.
 * Synthetic data only.
 */
import { describe, expect, it } from 'vitest';
import {
  KELLY_TEAM_REPLY_MAX_CHARS,
  TEAM_MESSAGE_MODEL_NOTE,
  TEAM_MSG_MAX_PER_WINDOW,
  TEAM_MSG_WINDOW_MS,
  hasTtl,
  labelTeamMessagesForModel,
  messageSourceOf,
  nextTeamWindow,
  normalizeTeamReply,
  previewOf,
  roleForSource,
  shouldPushForSource,
  unifiedChatBadge,
  type KellyMessageSource,
} from '../unified-thread';
import { historyToModelMessages } from '../turn-engine';
import { kellyAdminMessage, kellyThreadRow, sortQueue } from '../kelly-admin';
import { migrationWrites, planKellyDmMigration, userUidOfKellyChat, type LegacyDmMessage } from '../kelly-dm-migration';
import { buildKellyWelcomeMessage } from '@/features/social/services/kelly-welcome-bot.service';

const KELLY = 'system_kelly_coach';

describe('source mapping', () => {
  it('reads `source`, falls back to role for messages stored before unified Kelly', () => {
    expect(messageSourceOf({ role: 'assistant', source: 'human' })).toBe('human');
    expect(messageSourceOf({ role: 'assistant', source: 'system' })).toBe('system');
    expect(messageSourceOf({ role: 'assistant' })).toBe('ai');
    expect(messageSourceOf({ role: 'user' })).toBe('user');
    expect(messageSourceOf({ role: 'assistant', source: 'ai_coach_handoff' })).toBe('ai');
  });
  it('model role: user → user, everything else → assistant', () => {
    expect((['user', 'ai', 'human', 'system'] as KellyMessageSource[]).map(roleForSource)).toEqual(['user', 'assistant', 'assistant', 'assistant']);
  });
  it('TTL only for the AI chat; team / system / team-only user messages never expire', () => {
    expect(hasTtl('ai')).toBe(true);
    expect(hasTtl('user')).toBe(true);
    expect(hasTtl('user', { teamOnly: true })).toBe(false);
    expect(hasTtl('human')).toBe(false);
    expect(hasTtl('system')).toBe(false);
  });
  it('push only for human / system, never for AI or user', () => {
    expect(['human', 'system', 'ai', 'user', undefined].map(shouldPushForSource)).toEqual([true, true, false, false, false]);
  });
  it('preview collapses whitespace and caps the length', () => {
    expect(previewOf('  שלום \n עולם ')).toBe('שלום עולם');
    expect(previewOf('א'.repeat(300)).length).toBe(120);
  });
});

describe('model history with team messages', () => {
  const recent = [
    { role: 'user' as const, text: 'רוצה לדבר עם מאמן', source: 'user' as const },
    { role: 'assistant' as const, text: 'העברתי לצוות', source: 'ai' as const },
    { role: 'assistant' as const, text: 'היי, כאן מהצוות. מה הכאב?', source: 'human' as const },
    { role: 'user' as const, text: 'כואב לי הברך', source: 'user' as const },
  ];

  it('a team reply becomes an assistant turn with the team note; the rest is untouched', () => {
    const out = historyToModelMessages(labelTeamMessagesForModel(recent));
    // ends with an assistant turn (the trailing user message is the new one in `state`)
    expect(out).toHaveLength(2);
    expect(out[1].role).toBe('assistant');
    expect(out[1].content).toBe(`העברתי לצוות\n${TEAM_MESSAGE_MODEL_NOTE}\nהיי, כאן מהצוות. מה הכאב?`);
  });

  it('flag-off parity: messages without `source` give the exact old history', () => {
    const legacy = recent.map(({ role, text }) => ({ role, text }));
    expect(historyToModelMessages(labelTeamMessagesForModel(legacy))).toEqual(historyToModelMessages(legacy));
  });

  it('does not mutate the input', () => {
    const copy = JSON.parse(JSON.stringify(recent));
    labelTeamMessagesForModel(recent);
    expect(recent).toEqual(copy);
  });
});

describe('team-only flood guard', () => {
  it('opens a window, counts, refuses at the cap, reopens after the window', () => {
    const t0 = 1_000_000;
    let w = nextTeamWindow(null, t0);
    expect(w).toMatchObject({ allowed: true, window: { startMs: t0, count: 1 } });
    for (let i = 1; i < TEAM_MSG_MAX_PER_WINDOW; i++) w = nextTeamWindow(w.window, t0 + i);
    expect(w.window.count).toBe(TEAM_MSG_MAX_PER_WINDOW);
    const refused = nextTeamWindow(w.window, t0 + 1000);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSec).toBe(Math.ceil((TEAM_MSG_WINDOW_MS - 1000) / 1000));
    expect(nextTeamWindow(w.window, t0 + TEAM_MSG_WINDOW_MS)).toMatchObject({ allowed: true, window: { count: 1 } });
  });
  it('treats garbage as no window', () => {
    expect(nextTeamWindow({ startMs: 'x' }, 5).allowed).toBe(true);
  });
});

describe('admin reply text', () => {
  it('trims, rejects empty / non-strings, caps', () => {
    expect(normalizeTeamReply('  היי \r\n שם ')).toBe('היי \n שם');
    expect(normalizeTeamReply('   ')).toBeNull();
    expect(normalizeTeamReply(5)).toBeNull();
    expect(normalizeTeamReply('x'.repeat(5000))!.length).toBe(KELLY_TEAM_REPLY_MAX_CHARS);
  });
});

describe('header badge', () => {
  it('drops the old Kelly DM, adds the unified unread', () => {
    const threads = [
      { participants: ['u1', KELLY], unreadCount: { u1: 3 } },
      { participants: ['u1', 'u2'], unreadCount: { u1: 2 } },
    ];
    expect(unifiedChatBadge(threads, 'u1', KELLY, 4)).toBe(6);
    expect(unifiedChatBadge(threads, 'u1', KELLY, 0)).toBe(2);
  });
});

describe('admin panel shaping', () => {
  const ts = (ms: number) => ({ toMillis: () => ms });
  it('thread row + queue order (newest request first)', () => {
    const a = kellyThreadRow('a', { needsHuman: true, needsHumanAt: ts(10), unreadForUser: 1 }, { core: { name: 'דנה כהן', gender: 'female', ageGroup: 'adult' } });
    const b = kellyThreadRow('b', { needsHuman: true, needsHumanAt: ts(20) }, {});
    expect(a).toMatchObject({ firstName: 'דנה', gender: 'female', needsHuman: true, needsHumanAtMs: 10, unreadForUser: 1 });
    expect(b.firstName).toBe('משתמש');
    expect(sortQueue([a, b]).map((r) => r.uid)).toEqual(['b', 'a']);
  });
  it('message: every source, no log, migrated marker', () => {
    const m = kellyAdminMessage('m', { role: 'assistant', text: 'x', log: { secret: 1 }, createdAt: ts(5), migratedFrom: { chatId: 'c' } });
    expect(m).toEqual({ id: 'm', source: 'ai', text: 'x', senderName: null, createdAtMs: 5, cards: [], migrated: true });
  });
});

describe('welcome message copy', () => {
  for (const mode of ['ai', 'team'] as const) {
    it(`${mode}: male Kelly, brand OUT, gendered toward the user, no slashes, no "נחזור אליך"`, () => {
      const m = buildKellyWelcomeMessage('דנה', 'female', mode);
      const d = buildKellyWelcomeMessage('דני', 'male', mode);
      const n = buildKellyWelcomeMessage('', undefined, mode);
      for (const t of [m, d, n]) {
        expect(t).toContain('OUT');
        expect(t).not.toContain('OutRun');
        expect(t).toContain('המאמן שלך');
        expect(t).not.toMatch(/המאמנת|הווירטואלית/);
        expect(t).not.toContain('נחזור אליך');
        expect(t).not.toMatch(/[א-ת]\/[א-ת]/);
      }
      expect(m).toContain('ברוכה הבאה');
      expect(d).toContain('ברוך הבא');
      expect(n).not.toMatch(/ברוך|ברוכה/);
    });
  }
  it('ai mode says what Kelly can do and that the team is there', () => {
    const t = buildKellyWelcomeMessage('דני', 'male', 'ai');
    expect(t).toMatch(/לבנות לך אימון/);
    expect(t).toMatch(/לסדר לך את השבוע/);
    expect(t).toMatch(/האפליקציה/);
    expect(t).toMatch(/הצוות/);
  });
  it('team mode promises no AI capability', () => {
    expect(buildKellyWelcomeMessage('דני', 'male', 'team')).not.toMatch(/לבנות לך אימון/);
  });
});

describe('Kelly DM migration', () => {
  const chatId = ['u1', KELLY].sort().join('_');
  const msgs: LegacyDmMessage[] = [
    { id: 'w', senderUid: KELLY, text: 'היי דנה, איזה כיף לראות אותך ב-OutRun! אני קלי, המאמנת הווירטואלית שלך', sentAtMs: 100 },
    { id: 'q1', senderUid: 'u1', text: 'יש לי שאלה', sentAtMs: 200 },
    { id: 'a1', senderUid: KELLY, text: 'בטח, מה השאלה?', sentAtMs: 300 },
    { id: 'h1', senderUid: 'u1', text: 'סיכום מקלי AI: רוצה תוכנית ריצה', sentAtMs: 400, source: 'ai_coach_handoff' },
    { id: 'e', senderUid: 'u1', text: '   ', sentAtMs: 450 },
  ];

  it('finds the user uid of a Kelly DM', () => {
    expect(userUidOfKellyChat(chatId, ['u1', KELLY], KELLY)).toBe('u1');
    expect(userUidOfKellyChat(chatId, undefined, KELLY)).toBe('u1');
    expect(userUidOfKellyChat('a_b', ['a', 'b'], KELLY)).toBeNull();
  });

  it('maps sources, keeps timestamps, skips the old welcome + handoff + empty, no TTL field, marks migratedFrom', () => {
    const plan = planKellyDmMigration(chatId, 'u1', KELLY, msgs);
    expect(plan.messages.map((m) => [m.id, m.source, m.role, m.createdAtMs])).toEqual([
      ['legacy_q1', 'user', 'user', 200],
      ['legacy_a1', 'human', 'assistant', 300],
    ]);
    expect(plan.skipped).toEqual({ handoff: 1, empty: 1, welcome: 1 });
    expect(plan.messages.every((m) => !('expireAt' in m) && m.migratedFrom.chatId === chatId)).toBe(true);
    expect(plan.messages[1].senderName).toBe('קלי · צוות OUT');
    // last user-side item is the unanswered handoff → needsHuman with its summary
    expect(plan).toMatchObject({ needsHuman: true, needsHumanAtMs: 400, needsHumanSummary: 'רוצה תוכנית ריצה', lastHumanReplyAtMs: 300 });
  });

  it('answered thread → no needsHuman; a welcome is not an answer; welcome-only → nothing to write', () => {
    expect(planKellyDmMigration(chatId, 'u1', KELLY, msgs.slice(0, 3)).needsHuman).toBe(false);
    expect(planKellyDmMigration(chatId, 'u1', KELLY, msgs.slice(0, 2)).needsHuman).toBe(true);
    const welcomeOnly = planKellyDmMigration(chatId, 'u1', KELLY, msgs.slice(0, 1));
    expect(welcomeOnly.needsHuman).toBe(false);
    expect(migrationWrites(welcomeOnly, new Set(), { lastMessageAtMs: 0, lastHumanReplyAtMs: 0, needsHuman: false })).toEqual({ toWrite: [], thread: null });
  });

  it('a later Kelly message that is not the first is a team reply, not system', () => {
    const plan = planKellyDmMigration(chatId, 'u1', KELLY, [
      { id: 'q', senderUid: 'u1', text: 'היי', sentAtMs: 1 },
      { id: 'k', senderUid: KELLY, text: 'אני קלי, ברוך הבא ל-OUT', sentAtMs: 2 },
    ]);
    expect(plan.messages.map((m) => m.source)).toEqual(['user', 'human']);
  });

  it('idempotent: a re-run writes nothing; a partial run writes only the rest', () => {
    const plan = planKellyDmMigration(chatId, 'u1', KELLY, msgs);
    const empty = { lastMessageAtMs: 0, lastHumanReplyAtMs: 0, needsHuman: false };
    const first = migrationWrites(plan, new Set(), empty);
    expect(first.toWrite).toHaveLength(2);
    expect(first.thread).toMatchObject({ messageCountIncrement: 2, lastMessageAtMs: 300, lastHumanReplyAtMs: 300, setNeedsHuman: { atMs: 400 } });
    const all = new Set(plan.messages.map((m) => m.id));
    const afterFirst = { lastMessageAtMs: 300, lastHumanReplyAtMs: 300, needsHuman: true, raisedNeedsHumanAtMs: 400 };
    expect(migrationWrites(plan, all, afterFirst)).toEqual({ toWrite: [], thread: null });
    // …and also once an admin resolved it (needsHuman false) — the marker stops a re-raise
    expect(migrationWrites(plan, all, { ...afterFirst, needsHuman: false })).toEqual({ toWrite: [], thread: null });
    const partial = migrationWrites(plan, new Set(['legacy_q1']), empty);
    expect(partial.toWrite.map((m) => m.id)).toEqual(['legacy_a1']);
    expect(partial.thread?.messageCountIncrement).toBe(1);
  });

  it('never re-raises needsHuman after a newer team reply in the unified thread', () => {
    const plan = planKellyDmMigration(chatId, 'u1', KELLY, msgs);
    const w = migrationWrites(plan, new Set(['legacy_q1']), { lastMessageAtMs: 999, lastHumanReplyAtMs: 500, needsHuman: false });
    expect(w.thread?.setNeedsHuman).toBeUndefined();
    expect(w.thread?.lastMessageAtMs).toBeUndefined();
  });

  it('a handoff-only chat still raises needsHuman once (no messages to copy)', () => {
    const plan = planKellyDmMigration(chatId, 'u1', KELLY, [msgs[0], msgs[3]]);
    expect(plan.messages).toHaveLength(0);
    const empty = { lastMessageAtMs: 0, lastHumanReplyAtMs: 0, needsHuman: false };
    const w = migrationWrites(plan, new Set(), empty);
    expect(w.thread).toEqual({ messageCountIncrement: 0, setNeedsHuman: { atMs: 400, summary: 'רוצה תוכנית ריצה' } });
    // re-run after an admin resolved it without replying → not raised again
    expect(migrationWrites(plan, new Set(), { ...empty, raisedNeedsHumanAtMs: 400 })).toEqual({ toWrite: [], thread: null });
  });
});
