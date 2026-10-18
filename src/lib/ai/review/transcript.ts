/**
 * AI coach review — stored thread messages → review turns → the transcript the grader reads.
 * Pure.
 *
 * Reads the assistant message's optional `log` (added by fix/ai-coach-quality-round1):
 *   log = { model, usage:{in,out,cacheRead}, toolCalls:[{name, input, resultSummary}], guards:[{type, action}] }
 * When there is no log (older messages, or before that PR ships) the turn still reviews from
 * text + cards[]; toolCalls is then null ("unknown"), not [] ("no tools were called").
 *
 * Privacy: only the user's FIRST name goes in; emails and phone numbers the user may have
 * typed are masked before anything is sent to the model.
 */
import type { ReviewCardSummary, ReviewToolCall, ReviewTurn } from './review-types';

export interface RawThreadMessage {
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw Firestore document data, read through field guards
  data: Record<string, any>;
}

function msOf(v: unknown): number {
  if (v && typeof (v as { toMillis?: unknown }).toMillis === 'function') return (v as { toMillis: () => number }).toMillis();
  if (v instanceof Date) return v.getTime();
  return typeof v === 'number' ? v : 0;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function cardSummary(c: unknown): ReviewCardSummary | null {
  if (!c || typeof c !== 'object') return null;
  const r = c as Record<string, unknown>;
  const reasons = (r.decisionRecord as { reasons?: unknown } | null | undefined)?.reasons;
  return {
    workoutId: str(r.workoutId),
    title: str(r.title),
    minutes: typeof r.minutes === 'number' ? r.minutes : 0,
    exerciseCount: typeof r.exerciseCount === 'number' ? r.exerciseCount : 0,
    location: str(r.location),
    reasonCodes: Array.isArray(reasons)
      ? reasons.map((x) => (x && typeof x === 'object' ? str((x as { code?: unknown }).code) : '')).filter(Boolean)
      : [],
  };
}

export interface ParsedLog {
  model: string | null;
  toolCalls: ReviewToolCall[];
  guards: Array<{ type: string; action: string }>;
}

/** Field-guarded read of the optional `log`. null when absent or not an object. */
export function parseMessageLog(raw: unknown): ParsedLog | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const toolCalls = Array.isArray(r.toolCalls)
    ? r.toolCalls
        .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
        .map((t) => ({ name: str(t.name), input: t.input ?? null, resultSummary: t.resultSummary ?? null }))
        .filter((t) => t.name)
    : [];
  const guards = Array.isArray(r.guards)
    ? r.guards
        .filter((g): g is Record<string, unknown> => !!g && typeof g === 'object')
        .map((g) => ({ type: str(g.type), action: str(g.action) }))
        .filter((g) => g.type)
    : [];
  return { model: str(r.model) || null, toolCalls, guards };
}

/**
 * Messages (oldest first) → turns. A turn starts at a user message and takes every
 * assistant message until the next user message. Assistant messages before the first user
 * message (none today) become a turn with an empty userText.
 */
export function messagesToTurns(msgs: RawThreadMessage[]): ReviewTurn[] {
  const turns: ReviewTurn[] = [];
  let cur: ReviewTurn | null = null;
  const start = (userId: string | null, userText: string, at: number): ReviewTurn => ({
    turnIndex: turns.length,
    userMessageId: userId,
    assistantMessageId: null,
    userText,
    assistantText: '',
    createdAtMs: at,
    cards: [],
    toolCalls: null,
    guards: [],
    model: null,
  });
  for (const m of msgs) {
    const d = m.data ?? {};
    const at = msOf(d.createdAt);
    if (d.role !== 'assistant') {
      cur = start(m.id, str(d.text), at);
      turns.push(cur);
      continue;
    }
    if (!cur || cur.assistantMessageId) {
      cur = start(null, '', at);
      turns.push(cur);
    }
    cur.assistantMessageId = m.id;
    cur.assistantText = cur.assistantText ? `${cur.assistantText}\n${str(d.text)}` : str(d.text);
    if (Array.isArray(d.cards)) {
      for (const c of d.cards) {
        const s = cardSummary(c);
        if (s) cur.cards.push(s);
      }
    }
    const log = parseMessageLog(d.log);
    if (log) {
      cur.toolCalls = [...(cur.toolCalls ?? []), ...log.toolCalls];
      cur.guards.push(...log.guards);
      cur.model = log.model;
    }
  }
  return turns;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Israeli and international phone numbers: 9+ digits with optional separators / +972.
const PHONE = /(?:\+?\d[\d\s-]{7,}\d)/g;

/** Masks emails and phone numbers a user may have typed into the chat. */
export function redactPii(text: string): string {
  return text.replace(EMAIL, '[email]').replace(PHONE, (m) => (m.replace(/\D/g, '').length >= 9 ? '[phone]' : m));
}

function compactJson(v: unknown, max = 700): string {
  let s: string;
  try {
    s = typeof v === 'string' ? v : JSON.stringify(v);
  } catch {
    s = String(v);
  }
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** The transcript block the grader reads (Hebrew content, English scaffolding). */
export function renderTranscript(turns: ReviewTurn[], ctx: { firstName: string; gender: string }): string {
  const lines = [
    `User first name: ${ctx.firstName || 'unknown'}; grammatical gender: ${ctx.gender}.`,
    '',
  ];
  for (const t of turns) {
    lines.push(`[turn ${t.turnIndex}]`);
    lines.push(`USER: ${redactPii(t.userText) || '(none)'}`);
    if (t.toolCalls === null) {
      lines.push('TOOL CALLS: (no log stored for this turn, tool calls unknown)');
    } else if (t.toolCalls.length === 0) {
      lines.push('TOOL CALLS: none');
    } else {
      for (const c of t.toolCalls) {
        lines.push(`TOOL CALL ${c.name} input=${compactJson(c.input, 400)} result=${compactJson(c.resultSummary)}`);
      }
    }
    for (const g of t.guards) lines.push(`GUARD ${g.type}: ${g.action}`);
    for (const c of t.cards) {
      lines.push(
        `CARD shown: "${c.title}", ${c.minutes} min, ${c.exerciseCount} exercises, location=${c.location}${c.reasonCodes.length ? `, engine reasons=${c.reasonCodes.join(',')}` : ''}`,
      );
    }
    lines.push(`KELLY: ${t.assistantText || '(no reply)'}`);
    lines.push('');
  }
  return lines.join('\n');
}
