/**
 * thread-store.server — an admin's own assistant chat (plan §2.7, §2.6 rolling history).
 *
 *   admin_ai_threads/{uid}               { summary, summarizedUntilMs, messageCount, updatedAt }
 *   admin_ai_threads/{uid}/messages/{id} { role, text, links[], evidence?, auditId?, createdAt, expireAt }
 *
 * Admin SDK only (rules: if false). Each admin sees only their own thread (owner decision:
 * privacy between admins). Messages expire after 90 days (TTL policy on expireAt — the owner
 * creates it in the console). The prompt carries the last ADMIN_AI_VERBATIM_TURNS turns
 * verbatim and a ≤150-token Haiku summary of everything older.
 */
import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { getAiModel } from '@/lib/ai/anthropic.server';
import { isPricedModel } from '@/lib/ai/ai-pricing';
import { ADMIN_AI_THREADS } from './collections';
import { ADMIN_AI_THREAD_RETENTION_DAYS, ADMIN_AI_VERBATIM_TURNS } from './limits';
import { smallAdminModelCall, textOf } from './model-call.server';
import type { EvidenceItem } from './sse';

const DAY_MS = 24 * 60 * 60 * 1000;
/** stored text cap per message (characters) */
const MAX_STORED_TEXT = 4000;

export interface StoredAdminMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  links: Array<{ href: string; title: string; pageId: string }>;
  evidence?: EvidenceItem[];
  auditId?: string | null;
  unverified?: boolean;
  createdAtMs: number;
}

export interface AdminThreadState {
  summary: string | null;
  summarizedUntilMs: number;
  /** newest last */
  recent: StoredAdminMessage[];
}

const msOf = (v: unknown): number =>
  v instanceof Timestamp ? v.toMillis() : v instanceof Date ? v.getTime() : typeof (v as { toMillis?: () => number })?.toMillis === 'function' ? (v as { toMillis: () => number }).toMillis() : 0;

function toStored(id: string, d: Record<string, unknown>): StoredAdminMessage {
  return {
    id,
    role: d.role === 'assistant' ? 'assistant' : 'user',
    text: typeof d.text === 'string' ? d.text : '',
    links: Array.isArray(d.links) ? (d.links as StoredAdminMessage['links']).slice(0, 5) : [],
    ...(Array.isArray(d.evidence) ? { evidence: d.evidence as EvidenceItem[] } : {}),
    auditId: typeof d.auditId === 'string' ? d.auditId : null,
    unverified: d.unverified === true,
    createdAtMs: msOf(d.createdAt),
  };
}

/** Thread summary + the newest messages (default: enough for the verbatim turns + a margin). */
export async function loadAdminThread(db: Firestore, uid: string, limit = ADMIN_AI_VERBATIM_TURNS * 2 + 4): Promise<AdminThreadState> {
  const ref = db.collection(ADMIN_AI_THREADS).doc(uid);
  const [snap, msgs] = await Promise.all([ref.get(), ref.collection('messages').orderBy('createdAt', 'desc').limit(limit).get()]);
  const data = snap.data() ?? {};
  return {
    summary: typeof data.summary === 'string' && data.summary ? data.summary : null,
    summarizedUntilMs: typeof data.summarizedUntilMs === 'number' ? data.summarizedUntilMs : 0,
    recent: msgs.docs.map((d) => toStored(d.id, d.data())).reverse(),
  };
}

/**
 * The history part of the prompt: the last N turns verbatim (text only — no tool blocks, no
 * thinking blocks), with a cache breakpoint on the last history block (plan §2.6 breakpoint 2).
 */
export function historyMessages(thread: AdminThreadState): Anthropic.MessageParam[] {
  const verbatim = thread.recent.filter((m) => m.createdAtMs > thread.summarizedUntilMs).slice(-ADMIN_AI_VERBATIM_TURNS * 2);
  // the API needs alternating roles starting with user
  const msgs: Anthropic.MessageParam[] = [];
  for (const m of verbatim) {
    const text = m.text.trim() || (m.role === 'assistant' ? '(קישורים בלבד)' : '…');
    const last = msgs[msgs.length - 1];
    if (last && last.role === m.role) {
      (last.content as Anthropic.TextBlockParam[]).push({ type: 'text', text });
    } else if (msgs.length || m.role === 'user') {
      msgs.push({ role: m.role, content: [{ type: 'text', text }] });
    }
  }
  if (msgs.length && msgs[msgs.length - 1].role === 'user') msgs.pop(); // a dangling question (failed turn)
  const lastMsg = msgs[msgs.length - 1];
  if (lastMsg) {
    const blocks = lastMsg.content as Anthropic.TextBlockParam[];
    blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], cache_control: { type: 'ephemeral' } };
  }
  return msgs;
}

export async function appendAdminMessage(
  db: Firestore,
  uid: string,
  msg: Omit<StoredAdminMessage, 'id' | 'createdAtMs'>,
  now: Date = new Date(),
): Promise<string> {
  const ref = db.collection(ADMIN_AI_THREADS).doc(uid);
  const doc = ref.collection('messages').doc();
  const batch = db.batch();
  batch.set(doc, {
    role: msg.role,
    text: msg.text.slice(0, MAX_STORED_TEXT),
    links: msg.links.slice(0, 5),
    ...(msg.evidence?.length ? { evidence: msg.evidence.slice(0, 6) } : {}),
    auditId: msg.auditId ?? null,
    unverified: msg.unverified === true,
    createdAt: Timestamp.fromMillis(now.getTime()),
    expireAt: Timestamp.fromMillis(now.getTime() + ADMIN_AI_THREAD_RETENTION_DAYS * DAY_MS),
  });
  batch.set(ref, { messageCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();
  return doc.id;
}

/**
 * When more than the verbatim window is unsummarized, fold the older messages into the summary
 * with Haiku (≤150 tokens). Never throws — a failed summary just keeps the old one.
 */
export async function maybeRollAdminSummary(
  db: Firestore,
  client: Anthropic,
  uid: string,
  thread: AdminThreadState,
): Promise<void> {
  const unsummarized = thread.recent.filter((m) => m.createdAtMs > thread.summarizedUntilMs);
  const keep = ADMIN_AI_VERBATIM_TURNS * 2;
  if (unsummarized.length <= keep + 2) return;
  const older = unsummarized.slice(0, unsummarized.length - keep);
  const model = getAiModel('fast');
  if (!isPricedModel(model)) return;
  try {
    const transcript = older.map((m) => `${m.role === 'user' ? 'מנהל' : 'עוזר'}: ${m.text.slice(0, 600)}`).join('\n');
    const { message } = await smallAdminModelCall(client, uid, {
      model,
      max_tokens: 150,
      system: 'Summarize this admin-panel assistant conversation in Hebrew, ≤60 words: what was asked and the key numbers given. No personal data.',
      messages: [{ role: 'user', content: `${thread.summary ? `סיכום קודם: ${thread.summary}\n` : ''}${transcript}` }],
    });
    const summary = textOf(message).trim().slice(0, 800);
    if (!summary) return;
    await db.collection(ADMIN_AI_THREADS).doc(uid).set(
      { summary, summarizedUntilMs: older[older.length - 1].createdAtMs, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  } catch (err) {
    console.warn('[admin-ai] summary roll failed (kept the old one)', err);
  }
}
