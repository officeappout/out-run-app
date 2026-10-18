/**
 * Unified Kelly migration — pure mapping of the old human Kelly DM
 * (chats/{[uid, KELLY_UID].sort().join('_')}/messages) into the unified conversation
 * (ai_coach_threads/{uid}/messages). Used by scripts/migrate-kelly-dms.ts; no Firebase imports.
 *
 * Mapping:
 *   senderUid === KELLY_UID, first message of the chat that reads like the welcome → not copied
 *       (the old welcome text is the female-Kelly / "OutRun" copy this change fixes, and a
 *       welcome-only chat would otherwise create a thread for nothing; counted in skipped.welcome)
 *   senderUid === KELLY_UID otherwise (a team member answering as Kelly)              → 'human'
 *   senderUid === uid, source 'ai_coach_handoff' (the AI's summary sent as the user)  → not copied;
 *       it only feeds needsHuman / needsHumanSummary (the AI conversation already has it)
 *   senderUid === uid                                                               → 'user'
 *   anyone else                                                                     → 'human'
 *
 * Idempotent: target message id = `legacy_${oldId}` and every copy carries
 * migratedFrom { chatId, messageId } (the push trigger skips those). No expireAt (no TTL).
 * Timestamps are preserved (sentAt → createdAt).
 */
import { previewOf, roleForSource, type KellyMessageSource } from './unified-thread';

export interface LegacyDmMessage {
  id: string;
  senderUid: string;
  senderName?: string;
  text: string;
  sentAtMs: number;
  type?: string;
  source?: string;
}

export interface MigratedMessage {
  id: string;
  source: Exclude<KellyMessageSource, 'ai'>;
  role: 'user' | 'assistant';
  text: string;
  senderName?: string;
  createdAtMs: number;
  migratedFrom: { chatId: string; messageId: string };
}

export interface MigrationPlan {
  chatId: string;
  uid: string;
  messages: MigratedMessage[];
  skipped: { handoff: number; empty: number; welcome: number };
  /** Thread-doc state derived from the legacy chat (before comparing with the target). */
  lastMessageAtMs: number;
  lastMessagePreview: string;
  lastHumanReplyAtMs: number;
  needsHuman: boolean;
  needsHumanAtMs: number;
  needsHumanSummary: string | null;
}

export const LEGACY_ID_PREFIX = 'legacy_';
export const KELLY_TEAM_NAME_ON_MIGRATION = 'קלי · צוות OUT';

const HANDOFF_PREFIX = /^סיכום מקלי AI:\s*/;

/** The uid of the user in a Kelly DM id, or null when it isn't one. */
export function userUidOfKellyChat(chatId: string, participants: readonly string[] | undefined, kellyUid: string): string | null {
  const others = (participants ?? []).filter((p) => p !== kellyUid);
  if (others.length === 1 && (participants ?? []).includes(kellyUid)) return others[0];
  // Fallback on the id convention ([a, b].sort().join('_')).
  if (!chatId.includes(kellyUid)) return null;
  const rest = chatId.replace(kellyUid, '').replace(/^_+|_+$/g, '');
  return rest || null;
}

function isWelcomeText(text: string): boolean {
  return /(אני קלי|כאן קלי)/.test(text) && /(OutRun|OUT|ברוך הבא|ברוכה הבאה|שהצטרפת)/.test(text);
}

export function planKellyDmMigration(
  chatId: string,
  uid: string,
  kellyUid: string,
  raw: readonly LegacyDmMessage[],
): MigrationPlan {
  const sorted = [...raw].sort((a, b) => a.sentAtMs - b.sentAtMs || a.id.localeCompare(b.id));
  const messages: MigratedMessage[] = [];
  const skipped = { handoff: 0, empty: 0, welcome: 0 };
  let lastUserSideAtMs = 0;
  let lastUserSideSummary: string | null = null;
  let lastHumanReplyAtMs = 0;

  sorted.forEach((m, index) => {
    const text = (m.text ?? '').trim();
    const fromUser = m.senderUid === uid;
    if (fromUser && (m.source === 'ai_coach_handoff' || HANDOFF_PREFIX.test(text))) {
      skipped.handoff += 1;
      if (m.sentAtMs >= lastUserSideAtMs) {
        lastUserSideAtMs = m.sentAtMs;
        lastUserSideSummary = text.replace(HANDOFF_PREFIX, '').slice(0, 600) || null;
      }
      return;
    }
    if (!text) {
      skipped.empty += 1;
      return;
    }
    if (!fromUser && m.senderUid === kellyUid && index === 0 && isWelcomeText(text)) {
      skipped.welcome += 1;
      return;
    }
    const source: MigratedMessage['source'] = fromUser ? 'user' : 'human';

    if (source === 'user' && m.sentAtMs >= lastUserSideAtMs) {
      lastUserSideAtMs = m.sentAtMs;
      lastUserSideSummary = null;
    }
    if (source === 'human') lastHumanReplyAtMs = Math.max(lastHumanReplyAtMs, m.sentAtMs);

    messages.push({
      id: `${LEGACY_ID_PREFIX}${m.id}`,
      source,
      role: roleForSource(source),
      text: text.slice(0, 4000),
      ...(source === 'human' ? { senderName: KELLY_TEAM_NAME_ON_MIGRATION } : {}),
      createdAtMs: m.sentAtMs,
      migratedFrom: { chatId, messageId: m.id },
    });
  });

  const last = messages[messages.length - 1];
  // Unanswered: the newest user-side message (a user message or an AI handoff) is newer than
  // the newest team reply. A welcome message doesn't answer anything.
  const needsHuman = lastUserSideAtMs > 0 && lastUserSideAtMs > lastHumanReplyAtMs;
  return {
    chatId,
    uid,
    messages,
    skipped,
    lastMessageAtMs: last?.createdAtMs ?? 0,
    lastMessagePreview: last ? previewOf(last.text) : '',
    lastHumanReplyAtMs,
    needsHuman,
    needsHumanAtMs: needsHuman ? lastUserSideAtMs : 0,
    needsHumanSummary: needsHuman ? lastUserSideSummary : null,
  };
}

/**
 * What to write for one chat, given which legacy ids already exist in the target and the
 * target thread's current state. Re-running after a full migration writes nothing.
 */
export function migrationWrites(
  plan: MigrationPlan,
  existingIds: ReadonlySet<string>,
  target: {
    lastMessageAtMs: number;
    lastHumanReplyAtMs: number;
    needsHuman: boolean;
    /** kellyDmMigration.needsHumanAt from an earlier run (0 = never raised by the migration). */
    raisedNeedsHumanAtMs?: number;
  },
): {
  toWrite: MigratedMessage[];
  thread: {
    messageCountIncrement: number;
    lastMessageAtMs?: number;
    lastMessagePreview?: string;
    lastHumanReplyAtMs?: number;
    setNeedsHuman?: { atMs: number; summary: string | null };
  } | null;
} {
  const toWrite = plan.messages.filter((m) => !existingIds.has(m.id));
  // Only raise the flag for a legacy request newer than any team reply already in the target
  // (a reply sent from the new panel after a first migration must not be undone by a re-run),
  // and never twice for the same request (an admin may have resolved it without replying).
  const raise =
    plan.needsHuman &&
    !target.needsHuman &&
    plan.needsHumanAtMs > target.lastHumanReplyAtMs &&
    plan.needsHumanAtMs > (target.raisedNeedsHumanAtMs ?? 0);
  if (toWrite.length === 0 && !raise) return { toWrite, thread: null };
  const thread: NonNullable<ReturnType<typeof migrationWrites>['thread']> = { messageCountIncrement: toWrite.length };
  if (toWrite.length && plan.lastMessageAtMs > target.lastMessageAtMs) {
    thread.lastMessageAtMs = plan.lastMessageAtMs;
    thread.lastMessagePreview = plan.lastMessagePreview;
  }
  if (plan.lastHumanReplyAtMs > target.lastHumanReplyAtMs) thread.lastHumanReplyAtMs = plan.lastHumanReplyAtMs;
  if (raise) thread.setNeedsHuman = { atMs: plan.needsHumanAtMs, summary: plan.needsHumanSummary };
  return { toWrite, thread };
}
