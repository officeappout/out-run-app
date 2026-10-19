/**
 * AI coach — conversation storage (Admin SDK only; firestore.rules: owner read, no client
 * writes).
 *
 *   ai_coach_threads/{uid}                 { summary, summarizedUntil, pending, messageCount, updatedAt }
 *   ai_coach_threads/{uid}/messages/{id}   { role, text, cards[], actions?, log?, createdAt, expireAt }
 *
 * `actions` (assistant messages only): action chip ids (action-chips.ts), e.g. ['open_schedule'].
 *
 * `log` (assistant messages only, for the conversation-review agent; the app never
 * renders it): { model, usage: { in, out, cacheRead }, toolCalls: [{ name, input,
 * resultSummary }], guards: [{ type, action }] } — see TurnLog in turn-engine.ts.
 *
 * Unified Kelly (kelly_unified_v1, see unified-thread.ts): messages also carry `source`
 * ('user' | 'ai' | 'human' | 'system'), and the thread doc gains needsHuman,
 * needsHumanSummary, needsHumanAt, lastHumanReplyAt, unreadForUser, lastMessageAt,
 * lastMessagePreview, needsHumanReason (why it is in the queue, ai-pause.ts), aiPause (the last
 * "Kelly is paused" reply, for once-per-window). Team / system messages (and team-only user
 * messages) have NO expireAt.
 *
 * Retention: every AI-chat message carries expireAt = createdAt + 90 days. A Firestore TTL policy
 * on the `messages` collection group, field `expireAt`, deletes them (one-time console
 * setup, see the PR). Account deletion removes the whole tree (functions/src/onUserDelete.ts).
 *
 * `pending` holds a turn that is waiting for the device to run a client tool: the exact
 * assistant content (with the tool_use) is kept server-side, so the device only ever sends
 * back a validated tool RESULT and can't rewrite what Kelly said. Stored as a JSON string
 * (tool inputs may hold shapes Firestore doesn't accept, e.g. undefined).
 */
import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { COACH_HISTORY_TURNS } from './persona';
import type { WorkoutCard } from './protocol';
import type { HistoryMessage, TurnLog, TurnState } from './turn-engine';
import type { WorkoutToolResult } from './tools';
import { isCoachActionId, type CoachActionId } from './action-chips';
import { aiPauseReply, needsHumanReasonFor, nextAiPause, pausedMessageNeedsHuman, shouldSendPauseReply, type AiPauseCode, type NeedsHumanReason } from './ai-pause';
import type { CoachGender } from './persona';
import type { SuggestionChip } from './suggestions/types';
import type { StoredProposal } from './schedule-proposal/types';
import { hasTtl, isKellyMessageSource, nextTeamWindow, previewOf, roleForSource, type KellyMessageSource } from './unified-thread';

export const AI_COACH_THREADS = 'ai_coach_threads';
export const AI_COACH_RETENTION_DAYS = 90;
const PENDING_TTL_MS = 10 * 60 * 1000;

export interface StoredCard extends WorkoutCard {
  /** Engine decision record (for explain_workout). Not rendered. */
  decisionRecord?: Record<string, unknown> | null;
  /** Main exercises with method, location, gear, video (for get_workout_details). Not rendered. */
  exercises?: WorkoutToolResult['exercises'];
  requestedMinutes?: number | null;
  levelCeiling?: boolean;
}

export interface StoredMessage extends HistoryMessage {
  id: string;
  cards: StoredCard[];
  createdAtMs: number;
  /** Action chip ids stored on an assistant message (unknown ids dropped). */
  actions?: CoachActionId[];
  /** Unified Kelly (kelly_unified_v1): who wrote it. Absent on messages stored before it. */
  source?: KellyMessageSource;
}

export interface PendingTurn {
  toolUseId: string;
  toolName: string;
  state: TurnState;
  pendingResults: Anthropic.ToolResultBlockParam[];
  /** Cards already produced earlier in this turn. */
  cards: StoredCard[];
  /** Kelly phase 2: a schedule proposal prepared earlier in this turn (absent = none). */
  proposal?: StoredProposal | null;
  createdAtMs: number;
}

export interface ThreadSnapshot {
  summary: string | null;
  summarizedUntilMs: number;
  pending: PendingTurn | null;
  /** Last COACH_HISTORY_TURNS * 2 messages, oldest first. */
  recent: StoredMessage[];
}

const threadRef = (db: Firestore, uid: string) => db.collection(AI_COACH_THREADS).doc(uid);
const messagesCol = (db: Firestore, uid: string) => threadRef(db, uid).collection('messages');

function msOf(v: unknown): number {
  if (v && typeof (v as { toMillis?: unknown }).toMillis === 'function') return (v as Timestamp).toMillis();
  if (v instanceof Date) return v.getTime();
  return typeof v === 'number' ? v : 0;
}

function parsePending(raw: unknown, now: number): PendingTurn | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.json !== 'string' || typeof r.toolUseId !== 'string') return null;
  const createdAtMs = msOf(r.createdAt);
  if (now - createdAtMs > PENDING_TTL_MS) return null;
  try {
    const body = JSON.parse(r.json) as Partial<Pick<PendingTurn, 'state' | 'pendingResults' | 'cards' | 'proposal'>>;
    if (!body.state || !Array.isArray(body.pendingResults)) return null;
    return {
      toolUseId: r.toolUseId,
      toolName: String(r.toolName ?? ''),
      state: body.state,
      pendingResults: body.pendingResults,
      cards: Array.isArray(body.cards) ? body.cards : [],
      ...(body.proposal ? { proposal: body.proposal } : {}),
      createdAtMs,
    };
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw Firestore document data, read through field guards
function toStored(id: string, d: Record<string, any>): StoredMessage {
  return {
    id,
    role: d.role === 'assistant' ? 'assistant' : 'user',
    text: typeof d.text === 'string' ? d.text : '',
    cards: Array.isArray(d.cards) ? (d.cards as StoredCard[]) : [],
    createdAtMs: msOf(d.createdAt),
    ...(Array.isArray(d.actions) ? { actions: (d.actions as unknown[]).filter(isCoachActionId) } : {}),
    ...(isKellyMessageSource(d.source) ? { source: d.source } : {}),
  };
}

export async function loadThread(db: Firestore, uid: string, now = Date.now()): Promise<ThreadSnapshot> {
  const [tSnap, mSnap] = await Promise.all([
    threadRef(db, uid).get(),
    messagesCol(db, uid).orderBy('createdAt', 'desc').limit(COACH_HISTORY_TURNS * 2).get(),
  ]);
  const t = (tSnap.exists ? tSnap.data() : {}) ?? {};
  return {
    summary: typeof t.summary === 'string' ? t.summary : null,
    summarizedUntilMs: msOf(t.summarizedUntil),
    pending: parsePending(t.pending, now),
    recent: mSnap.docs.map((d) => toStored(d.id, d.data())).reverse(),
  };
}

export async function appendMessage(
  db: Firestore,
  uid: string,
  msg: {
    role: 'user' | 'assistant';
    text: string;
    cards?: StoredCard[];
    actions?: CoachActionId[];
    log?: TurnLog;
    /**
     * Unified Kelly only (kelly_unified_v1 ON): stored on the message, and the thread doc
     * also gets lastMessageAt + lastMessagePreview. Absent = the exact pre-unified writes.
     */
    source?: KellyMessageSource;
    /** Kelly phase 2 (ai_coach_phase2): quick replies under this reply. Absent = not written. */
    suggestions?: SuggestionChip[];
    /** Kelly phase 2: the schedule proposal (confirm card) of this reply. Absent = not written. */
    proposal?: StoredProposal | null;
  },
  now = Date.now(),
): Promise<string> {
  const ref = messagesCol(db, uid).doc();
  const batch = db.batch();
  const ttl = msg.source ? hasTtl(msg.source) : true;
  batch.set(ref, {
    role: msg.role,
    text: msg.text.slice(0, 4000),
    cards: (msg.cards ?? []).map((c) => JSON.parse(JSON.stringify(c))),
    ...(msg.actions?.length ? { actions: [...msg.actions] } : {}),
    ...(msg.log ? { log: JSON.parse(JSON.stringify(msg.log)) } : {}),
    ...(msg.source ? { source: msg.source } : {}),
    ...(msg.suggestions?.length ? { suggestions: msg.suggestions.map((c) => ({ ...c })) } : {}),
    ...(msg.proposal ? { proposal: JSON.parse(JSON.stringify(msg.proposal)) } : {}),
    createdAt: Timestamp.fromMillis(now),
    ...(ttl ? { expireAt: Timestamp.fromMillis(now + AI_COACH_RETENTION_DAYS * 86_400_000) } : {}),
  });
  batch.set(
    threadRef(db, uid),
    {
      updatedAt: FieldValue.serverTimestamp(),
      messageCount: FieldValue.increment(1),
      ...(msg.source ? { lastMessageAt: Timestamp.fromMillis(now), lastMessagePreview: previewOf(msg.text) } : {}),
    },
    { merge: true },
  );
  await batch.commit();
  return ref.id;
}

// ── Unified Kelly (kelly_unified_v1) — non-AI writes into the same conversation ──────────

/**
 * The AI asked for a person (handoff_to_human): flag the thread for the admin queue. No
 * message is written — the user already sees the AI's own reply about it.
 */
export async function markNeedsHuman(db: Firestore, uid: string, summary: string, now = Date.now()): Promise<void> {
  await threadRef(db, uid).set(
    {
      needsHuman: true,
      needsHumanSummary: summary.replace(/\s+/g, ' ').trim().slice(0, 600),
      needsHumanAt: Timestamp.fromMillis(now),
      needsHumanReason: 'handoff' satisfies NeedsHumanReason,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

/**
 * A message that is not an AI turn: a team reply ('human'), an app message ('system'), or the
 * user's message in team-only mode ('user', which also puts the thread in the admin queue).
 * No TTL (see hasTtl). 'human' / 'system' count toward unreadForUser and are pushed by the
 * onKellyThreadMessage function; a team reply also clears needsHuman.
 */
export async function appendNonAiMessage(
  db: Firestore,
  uid: string,
  msg: { source: Exclude<KellyMessageSource, 'ai'>; text: string; senderName?: string; id?: string },
  now = Date.now(),
): Promise<string> {
  const ref = msg.id ? messagesCol(db, uid).doc(msg.id) : messagesCol(db, uid).doc();
  const at = Timestamp.fromMillis(now);
  const batch = db.batch();
  batch.set(ref, {
    role: roleForSource(msg.source),
    source: msg.source,
    text: msg.text.slice(0, 4000),
    cards: [],
    ...(msg.senderName ? { senderName: msg.senderName } : {}),
    createdAt: at,
  });
  const thread: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
    messageCount: FieldValue.increment(1),
    lastMessageAt: at,
    lastMessagePreview: previewOf(msg.text),
  };
  if (msg.source === 'human' || msg.source === 'system') thread.unreadForUser = FieldValue.increment(1);
  if (msg.source === 'human') {
    thread.needsHuman = false;
    thread.needsHumanSummary = FieldValue.delete();
    thread.needsHumanReason = FieldValue.delete();
    thread.lastHumanReplyAt = at;
  }
  if (msg.source === 'user') {
    thread.needsHuman = true;
    thread.needsHumanAt = at;
    thread.needsHumanReason = 'team_only' satisfies NeedsHumanReason;
  }
  batch.set(threadRef(db, uid), thread, { merge: true });
  await batch.commit();
  return ref.id;
}

/**
 * Team-only mode: the user's message goes into the conversation and the admin queue, behind a
 * per-user flood guard (teamWindow on the thread doc, read and written in one transaction).
 */
export async function appendTeamOnlyUserMessage(
  db: Firestore,
  uid: string,
  text: string,
  now = Date.now(),
): Promise<{ ok: true; id: string } | { ok: false; retryAfterSec: number }> {
  const tRef = threadRef(db, uid);
  const ref = messagesCol(db, uid).doc();
  const at = Timestamp.fromMillis(now);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(tRef);
    const gate = nextTeamWindow(snap.exists ? snap.data()?.teamWindow : null, now);
    if (!gate.allowed) return { ok: false as const, retryAfterSec: gate.retryAfterSec ?? 60 };
    tx.set(ref, { role: 'user', source: 'user', text: text.slice(0, 4000), cards: [], createdAt: at });
    tx.set(
      tRef,
      {
        updatedAt: FieldValue.serverTimestamp(),
        messageCount: FieldValue.increment(1),
        lastMessageAt: at,
        lastMessagePreview: previewOf(text),
        needsHuman: true,
        needsHumanAt: at,
        needsHumanReason: 'team_only' satisfies NeedsHumanReason,
        teamWindow: gate.window,
      },
      { merge: true },
    );
    return { ok: true as const, id: ref.id };
  });
}

/**
 * The AI gate refused a chat message (rate limit, kill switch, budget, outage — see
 * ai-pause.ts). In one transaction: the user's message is stored (team-only style, no TTL,
 * behind the same teamWindow flood guard); the thread enters the admin queue only per
 * pausedMessageNeedsHuman (or a safety trigger), with needsHumanReason; and Kelly's paused
 * reply is written as a 'system' message once per pause window (aiPause on the thread doc).
 * A safety reply (`safetyText`) is always written. The replies are noPush and don't count as
 * unread: the user is looking at the chat.
 */
export async function appendAiPausedUserMessage(
  db: Firestore,
  uid: string,
  text: string,
  opts: { code: AiPauseCode; gender: CoachGender; retryAfterSec?: number; teamChannel?: boolean; safetyText?: string | null },
  now = Date.now(),
): Promise<
  | { ok: true; id: string; replyId: string | null; replyText: string | null; needsHuman: boolean }
  | { ok: false; retryAfterSec: number }
> {
  const tRef = threadRef(db, uid);
  const userRef = messagesCol(db, uid).doc();
  const replyRef = messagesCol(db, uid).doc();
  const at = Timestamp.fromMillis(now);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(tRef);
    const t = (snap.exists ? snap.data() : {}) ?? {};
    const gate = nextTeamWindow(t.teamWindow, now);
    if (!gate.allowed) return { ok: false as const, retryAfterSec: gate.retryAfterSec ?? 60 };

    const safety = !!opts.safetyText;
    const needsHuman = safety || pausedMessageNeedsHuman(opts.code, text);
    const sendPause = !safety && shouldSendPauseReply(t.aiPause, opts.code, now);
    const replyText = safety
      ? (opts.safetyText as string)
      : sendPause
        ? aiPauseReply(opts.code, opts.gender, { retryAfterSec: opts.retryAfterSec, now: new Date(now), teamChannel: opts.teamChannel })
        : null;

    tx.set(userRef, { role: 'user', source: 'user', text: text.slice(0, 4000), cards: [], createdAt: at });
    if (replyText) {
      // 1 ms later so it sorts after the user's message.
      tx.set(replyRef, { role: 'assistant', source: 'system', text: replyText, cards: [], noPush: true, createdAt: Timestamp.fromMillis(now + 1) });
    }
    tx.set(
      tRef,
      {
        updatedAt: FieldValue.serverTimestamp(),
        messageCount: FieldValue.increment(replyText ? 2 : 1),
        lastMessageAt: Timestamp.fromMillis(replyText ? now + 1 : now),
        lastMessagePreview: previewOf(replyText ?? text),
        teamWindow: gate.window,
        ...(sendPause ? { aiPause: nextAiPause(opts.code, now, opts.retryAfterSec) } : {}),
        ...(needsHuman
          ? { needsHuman: true, needsHumanAt: at, needsHumanReason: safety ? 'safety' : needsHumanReasonFor(opts.code) }
          : {}),
      },
      { merge: true },
    );
    return { ok: true as const, id: userRef.id, replyId: replyText ? replyRef.id : null, replyText, needsHuman };
  });
}

/**
 * Takes the pending client-tool turn if it is the one `toolUseId` answers, and removes it in the
 * same transaction, so a tool result can resume a turn exactly once (the continuation is not
 * rate-limited again — see /api/ai-coach/chat). Null when there is none, it expired, or it is
 * another call.
 */
export async function claimPending(db: Firestore, uid: string, toolUseId: string, now = Date.now()): Promise<PendingTurn | null> {
  const tRef = threadRef(db, uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(tRef);
    const pending = parsePending(snap.exists ? snap.data()?.pending : null, now);
    if (!pending || pending.toolUseId !== toolUseId) return null;
    tx.set(tRef, { pending: FieldValue.delete() }, { merge: true });
    return pending;
  });
}

/** The user opened the conversation: nothing unread. */
export async function markThreadRead(db: Firestore, uid: string): Promise<void> {
  await threadRef(db, uid).set({ unreadForUser: 0 }, { merge: true });
}

/** Admin: drop a thread from the queue without replying. */
export async function resolveNeedsHuman(db: Firestore, uid: string): Promise<void> {
  await threadRef(db, uid).set(
    { needsHuman: false, needsHumanSummary: FieldValue.delete(), needsHumanReason: FieldValue.delete() },
    { merge: true },
  );
}

export async function savePending(db: Firestore, uid: string, p: Omit<PendingTurn, 'createdAtMs'>, now = Date.now()): Promise<void> {
  await threadRef(db, uid).set(
    {
      pending: {
        toolUseId: p.toolUseId,
        toolName: p.toolName,
        json: JSON.stringify({ state: p.state, pendingResults: p.pendingResults, cards: p.cards, ...(p.proposal ? { proposal: p.proposal } : {}) }),
        createdAt: Timestamp.fromMillis(now),
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function clearPending(db: Firestore, uid: string): Promise<void> {
  await threadRef(db, uid).set({ pending: FieldValue.delete() }, { merge: true });
}

/**
 * Rolling summary: when more than HISTORY + 4 messages exist after the last summary
 * watermark, the oldest ones (everything but the last HISTORY messages) are folded into
 * the summary by `summarize`. Best effort: any failure leaves the thread as it was.
 */
export async function maybeRollSummary(
  db: Firestore,
  uid: string,
  current: { summary: string | null; summarizedUntilMs: number },
  summarize: (previous: string | null, messages: StoredMessage[]) => Promise<string | null>,
): Promise<boolean> {
  const keep = COACH_HISTORY_TURNS * 2;
  try {
    const snap = await messagesCol(db, uid)
      .where('createdAt', '>', Timestamp.fromMillis(current.summarizedUntilMs))
      .orderBy('createdAt', 'asc')
      .limit(keep + 40)
      .get();
    const msgs = snap.docs.map((d) => toStored(d.id, d.data()));
    if (msgs.length <= keep + 4) return false;
    const fold = msgs.slice(0, msgs.length - keep);
    const summary = await summarize(current.summary, fold);
    if (!summary) return false;
    await threadRef(db, uid).set(
      { summary: summary.slice(0, 1500), summarizedUntil: Timestamp.fromMillis(fold[fold.length - 1].createdAtMs) },
      { merge: true },
    );
    return true;
  } catch (err) {
    console.warn('[ai-coach] rolling summary skipped', err);
    return false;
  }
}
