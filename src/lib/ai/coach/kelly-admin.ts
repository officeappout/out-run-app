/**
 * Unified Kelly admin panel — pure shaping of Firestore data for /api/admin/ai-coach/kelly/**
 * (and the shapes the admin page renders). No Firebase imports: Timestamps are read through
 * toMillis() duck-typing.
 */
import { messageSourceOf, type KellyMessageSource } from './unified-thread';
import { NEEDS_HUMAN_REASON_LABEL, type NeedsHumanReason } from './ai-pause';

export interface KellyThreadRow {
  uid: string;
  firstName: string;
  gender: string | null;
  ageGroup: string | null;
  needsHuman: boolean;
  needsHumanSummary: string | null;
  /** Why it is in the queue (ai-pause.ts); null on threads queued before the field existed. */
  needsHumanReason: NeedsHumanReason | null;
  needsHumanAtMs: number;
  lastMessageAtMs: number;
  lastHumanReplyAtMs: number;
  lastMessagePreview: string;
  unreadForUser: number;
  messageCount: number;
}

export interface KellyAdminMessage {
  id: string;
  source: KellyMessageSource;
  text: string;
  senderName: string | null;
  createdAtMs: number;
  cards: Array<{ title: string; minutes: number }>;
  migrated: boolean;
}

export function msOf(v: unknown): number {
  if (v && typeof (v as { toMillis?: unknown }).toMillis === 'function') return (v as { toMillis: () => number }).toMillis();
  if (v instanceof Date) return v.getTime();
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw Firestore document data, read through field guards
export function kellyThreadRow(uid: string, t: Record<string, any>, user: Record<string, any>): KellyThreadRow {
  const core = (user?.core ?? {}) as Record<string, unknown>;
  const name = str(core.name).trim();
  return {
    uid,
    firstName: name.split(/\s+/)[0] || 'משתמש',
    gender: typeof core.gender === 'string' ? core.gender : null,
    ageGroup: typeof core.ageGroup === 'string' ? core.ageGroup : null,
    needsHuman: t.needsHuman === true,
    needsHumanSummary: typeof t.needsHumanSummary === 'string' ? t.needsHumanSummary : null,
    needsHumanReason: typeof t.needsHumanReason === 'string' && t.needsHumanReason in NEEDS_HUMAN_REASON_LABEL ? (t.needsHumanReason as NeedsHumanReason) : null,
    needsHumanAtMs: msOf(t.needsHumanAt),
    lastMessageAtMs: msOf(t.lastMessageAt) || msOf(t.updatedAt),
    lastHumanReplyAtMs: msOf(t.lastHumanReplyAt),
    lastMessagePreview: str(t.lastMessagePreview),
    unreadForUser: typeof t.unreadForUser === 'number' ? t.unreadForUser : 0,
    messageCount: typeof t.messageCount === 'number' ? t.messageCount : 0,
  };
}

/** Queue order: the newest request first (needsHumanAt, then last activity). */
export function sortQueue(rows: KellyThreadRow[]): KellyThreadRow[] {
  return [...rows].sort((a, b) => (b.needsHumanAtMs || b.lastMessageAtMs) - (a.needsHumanAtMs || a.lastMessageAtMs));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw Firestore document data, read through field guards
export function kellyAdminMessage(id: string, d: Record<string, any>): KellyAdminMessage {
  return {
    id,
    source: messageSourceOf(d),
    text: str(d.text),
    senderName: typeof d.senderName === 'string' ? d.senderName : null,
    createdAtMs: msOf(d.createdAt),
    cards: Array.isArray(d.cards)
      ? d.cards.map((c: Record<string, unknown>) => ({ title: str(c?.title), minutes: typeof c?.minutes === 'number' ? c.minutes : 0 }))
      : [],
    migrated: !!d.migratedFrom,
  };
}
