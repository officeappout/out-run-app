/**
 * AI coach — conversation storage (Admin SDK only; firestore.rules: owner read, no client
 * writes).
 *
 *   ai_coach_threads/{uid}                 { summary, summarizedUntil, pending, messageCount, updatedAt }
 *   ai_coach_threads/{uid}/messages/{id}   { role, text, cards[], log?, createdAt, expireAt }
 *
 * `log` (assistant messages only, for the conversation-review agent; the app never
 * renders it): { model, usage: { in, out, cacheRead }, toolCalls: [{ name, input,
 * resultSummary }], guards: [{ type, action }] } — see TurnLog in turn-engine.ts.
 *
 * Retention: every message carries expireAt = createdAt + 90 days. A Firestore TTL policy
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
}

export interface PendingTurn {
  toolUseId: string;
  toolName: string;
  state: TurnState;
  pendingResults: Anthropic.ToolResultBlockParam[];
  /** Cards already produced earlier in this turn. */
  cards: StoredCard[];
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
    const body = JSON.parse(r.json) as Partial<Pick<PendingTurn, 'state' | 'pendingResults' | 'cards'>>;
    if (!body.state || !Array.isArray(body.pendingResults)) return null;
    return {
      toolUseId: r.toolUseId,
      toolName: String(r.toolName ?? ''),
      state: body.state,
      pendingResults: body.pendingResults,
      cards: Array.isArray(body.cards) ? body.cards : [],
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
  msg: { role: 'user' | 'assistant'; text: string; cards?: StoredCard[]; log?: TurnLog },
  now = Date.now(),
): Promise<string> {
  const ref = messagesCol(db, uid).doc();
  const batch = db.batch();
  batch.set(ref, {
    role: msg.role,
    text: msg.text.slice(0, 4000),
    cards: (msg.cards ?? []).map((c) => JSON.parse(JSON.stringify(c))),
    ...(msg.log ? { log: JSON.parse(JSON.stringify(msg.log)) } : {}),
    createdAt: Timestamp.fromMillis(now),
    expireAt: Timestamp.fromMillis(now + AI_COACH_RETENTION_DAYS * 86_400_000),
  });
  batch.set(threadRef(db, uid), { updatedAt: FieldValue.serverTimestamp(), messageCount: FieldValue.increment(1) }, { merge: true });
  await batch.commit();
  return ref.id;
}

export async function savePending(db: Firestore, uid: string, p: Omit<PendingTurn, 'createdAtMs'>, now = Date.now()): Promise<void> {
  await threadRef(db, uid).set(
    {
      pending: {
        toolUseId: p.toolUseId,
        toolName: p.toolName,
        json: JSON.stringify({ state: p.state, pendingResults: p.pendingResults, cards: p.cards }),
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
