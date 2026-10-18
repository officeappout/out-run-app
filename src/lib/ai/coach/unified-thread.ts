/**
 * Unified Kelly (phase 1, flag kelly_unified_v1) — pure pieces shared by the server routes,
 * the client screen, the admin panel and the migration script. No Firebase imports.
 *
 * ONE conversation per user: ai_coach_threads/{uid}/messages. Every message carries
 * `source`:
 *   'user'   — the user wrote it (AI mode or team-only mode)
 *   'ai'     — the AI coach replied (synchronous, never pushed)
 *   'human'  — a team member replied from the admin panel, shown as KELLY_TEAM_SENDER_NAME
 *   'system' — an app-written Kelly message (the welcome message)
 * `role` stays the model-history role: user → 'user', everything else → 'assistant'.
 * Messages stored before this change have no `source`; they are read as role → 'user'|'ai'.
 *
 * Thread doc fields added by phase 1 (all server-written):
 *   needsHuman: boolean, needsHumanSummary?, needsHumanAt?, lastHumanReplyAt?,
 *   unreadForUser: number (human/system messages the user hasn't seen), lastMessageAt,
 *   lastMessagePreview (short text for the inbox row).
 */

export type KellyMessageSource = 'user' | 'ai' | 'human' | 'system';

export const KELLY_MESSAGE_SOURCES: readonly KellyMessageSource[] = ['user', 'ai', 'human', 'system'];

/** Shown above a team member's message, in the app and in the admin panel. */
export const KELLY_TEAM_SENDER_NAME = 'קלי · צוות OUT';

export const KELLY_PREVIEW_MAX = 120;
export const KELLY_TEAM_REPLY_MAX_CHARS = 2000;

/** Denials of the AI gate after which the screen falls back to "team only" for the message. */
export const TEAM_FALLBACK_CODES: readonly string[] = ['not_adult', 'ai_not_available', 'kill_switch', 'over_budget', 'rate_limited'];

export function isKellyMessageSource(v: unknown): v is KellyMessageSource {
  return typeof v === 'string' && (KELLY_MESSAGE_SOURCES as readonly string[]).includes(v);
}

/** A stored message's source; legacy messages (no `source`) fall back to their role. */
export function messageSourceOf(raw: { role?: unknown; source?: unknown }): KellyMessageSource {
  if (isKellyMessageSource(raw.source)) return raw.source;
  return raw.role === 'assistant' ? 'ai' : 'user';
}

export function roleForSource(source: KellyMessageSource): 'user' | 'assistant' {
  return source === 'user' ? 'user' : 'assistant';
}

/**
 * Whether a message gets the 90-day TTL (expireAt). AI turns and the user's messages to the
 * AI keep it (unchanged retention for the AI chat). Team replies, system messages and the
 * user's messages in team-only mode are support correspondence: they don't expire (same as
 * the old chats/ DM they replace, which never expired); account deletion still removes them.
 */
export function hasTtl(source: KellyMessageSource, opts: { teamOnly?: boolean } = {}): boolean {
  if (source === 'ai') return true;
  if (source === 'user') return !opts.teamOnly;
  return false;
}

/** Push only for messages a person (or the app) wrote to the user — never for AI replies. */
export function shouldPushForSource(source: unknown): boolean {
  return source === 'human' || source === 'system';
}

export function previewOf(text: string): string {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > KELLY_PREVIEW_MAX ? `${t.slice(0, KELLY_PREVIEW_MAX - 1)}…` : t;
}

/**
 * Prefix for a team member's message in the MODEL history (never shown to the user). The
 * model plays Kelly; a team reply sits in an assistant turn, so the note tells it a person
 * wrote it, to continue from it in Kelly's own (male) voice and not to repeat it.
 */
export const TEAM_MESSAGE_MODEL_NOTE = '[נכתב על ידי איש צוות OUT בשם קלי. המשך ממנו בקול שלך, בלי לחזור עליו]';

/**
 * History for the model: team messages get TEAM_MESSAGE_MODEL_NOTE in front; everything else
 * is unchanged (system messages are already Kelly's voice). Pure; returns new objects only
 * for the labelled ones.
 */
export function labelTeamMessagesForModel<T extends { text: string; source?: KellyMessageSource }>(msgs: readonly T[]): T[] {
  return msgs.map((m) => (m.source === 'human' && m.text.trim() ? { ...m, text: `${TEAM_MESSAGE_MODEL_NOTE}\n${m.text}` } : m));
}

// ── Team-only mode: a per-user flood guard (no AI is called, but every message lands in the
//    admin queue). Window state lives on the thread doc as teamWindow { startMs, count }. ──

export const TEAM_MSG_WINDOW_MS = 60 * 60 * 1000;
export const TEAM_MSG_MAX_PER_WINDOW = 20;

export interface TeamWindow {
  startMs: number;
  count: number;
}

export function nextTeamWindow(prev: unknown, nowMs: number): { allowed: boolean; window: TeamWindow; retryAfterSec?: number } {
  const p = prev && typeof prev === 'object' ? (prev as Partial<TeamWindow>) : null;
  const startMs = typeof p?.startMs === 'number' ? p.startMs : 0;
  const count = typeof p?.count === 'number' ? p.count : 0;
  if (!startMs || nowMs - startMs >= TEAM_MSG_WINDOW_MS) return { allowed: true, window: { startMs: nowMs, count: 1 } };
  if (count >= TEAM_MSG_MAX_PER_WINDOW) {
    return { allowed: false, window: { startMs, count }, retryAfterSec: Math.ceil((startMs + TEAM_MSG_WINDOW_MS - nowMs) / 1000) };
  }
  return { allowed: true, window: { startMs, count: count + 1 } };
}

/** Admin reply text: trimmed, non-empty, capped. Null when invalid. */
export function normalizeTeamReply(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\r\n/g, '\n').trim();
  if (!t) return null;
  return t.slice(0, KELLY_TEAM_REPLY_MAX_CHARS);
}

/**
 * Header chat badge with unified Kelly ON: every DM's unread count except the old Kelly DM
 * (hidden from the inbox), plus the unified thread's unreadForUser.
 */
export function unifiedChatBadge(
  threads: ReadonlyArray<{ participants?: readonly string[]; unreadCount?: Record<string, number> }>,
  uid: string,
  kellyUid: string,
  kellyUnread: number,
): number {
  const dms = threads.reduce(
    (sum, t) => (t.participants?.includes(kellyUid) ? sum : sum + (t.unreadCount?.[uid] ?? 0)),
    0,
  );
  return dms + Math.max(0, kellyUnread || 0);
}
