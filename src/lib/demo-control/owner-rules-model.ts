/**
 * Owner rules learning loop (owner, 21.10.2026: "the AI testers should LEARN from my notes").
 *
 *   demo_registry/owner_rules   (server-only, like all of demo_registry)
 *     { notes: OwnerNote[],          ← "הוסף הערת בעלים" in the "משוב דמו" tab
 *       dismissals: Dismissal[],     ← a tester finding marked "לא רלוונטי" (+ optional reason)
 *       updatedAt }
 *
 * The panel writes it through /api/admin/demo/feedback/** (Admin SDK). The tester runner reads
 * it through qaRunnerReport `status` (functions/src/lib/qa-runner-ops.ts ownerRulesPayload —
 * a whitelist of the same fields, minus `by`). The runner turns notes into OWN-1xx rules and
 * repeated dismissals of one rule on one screen into a suppression note
 * (scripts/qa/lib/owner/learning.ts). The static seed rules live in scripts/qa/owner-rules.json
 * (OWN-001…OWN-099); panel notes are numbered from OWN-101 so the two never collide.
 *
 * Pure: lenient parsers (bad rows dropped, never throw) + the add/remove helpers. No Firebase import.
 */
import { QA_SEVERITIES, type QaSeverity } from './qa-summary';

export const OWNER_RULES_DOC = 'owner_rules';
export const PANEL_NOTE_FIRST = 101;
export const MAX_NOTES = 200;
export const MAX_DISMISSALS = 300;
export const NOTE_TEXT_MAX = 500;
export const REASON_MAX = 300;

/** OWN-001 … OWN-999 (fits the finding sanitiser's /^[A-Z0-9-]{2,30}$/). */
export const OWNER_RULE_ID_RE = /^OWN-\d{3}$/;
/** A checkpoint id (snake_case) or a route pattern ("/parks/[id]"). Never used as a path. */
export const SCREEN_KEY_RE = /^[A-Za-z0-9_/\[\]:.-]{1,120}$/;

export interface OwnerNote {
  id: string;
  text: string;
  /** Checkpoint id / route the note is about; null = every screen. */
  screen: string | null;
  severity: QaSeverity;
  createdAtMs: number;
}

export interface Dismissal {
  findingId: string;
  /** The finding's rule id (null when it cited none). */
  rule: string | null;
  /** The finding's screen id, else its route pattern. */
  screen: string;
  title: string;
  reason: string;
  atMs: number;
}

export interface OwnerRulesDoc {
  notes: OwnerNote[];
  dismissals: Dismissal[];
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const ms = (v: unknown): number => {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  const t = v as { toMillis?: () => number } | null;
  return t && typeof t.toMillis === 'function' ? t.toMillis() : 0;
};
const screenOrNull = (v: unknown): string | null => {
  const s = str(v, 120);
  return s && isScreenKey(s) ? s : null;
};

/** A screen key the panel / runner accepts (lookup only, never a path — still no traversal). */
export function isScreenKey(v: unknown): v is string {
  return typeof v === 'string' && SCREEN_KEY_RE.test(v) && !v.includes('..');
}

export function parseOwnerNote(raw: unknown): OwnerNote | null {
  const r = obj(raw);
  const id = str(r.id, 10);
  const text = str(r.text, NOTE_TEXT_MAX);
  if (!OWNER_RULE_ID_RE.test(id) || !text) return null;
  return {
    id,
    text,
    screen: screenOrNull(r.screen),
    severity: QA_SEVERITIES.includes(r.severity as QaSeverity) ? (r.severity as QaSeverity) : 'P2',
    createdAtMs: ms(r.createdAtMs ?? r.createdAt),
  };
}

export function parseDismissal(raw: unknown): Dismissal | null {
  const r = obj(raw);
  const findingId = str(r.findingId, 300);
  const screen = screenOrNull(r.screen);
  if (!findingId || !/^[A-Za-z0-9_.:-]+$/.test(findingId) || !screen) return null;
  const rule = typeof r.rule === 'string' && /^[A-Z0-9-]{2,30}$/.test(r.rule) ? r.rule : null;
  return { findingId, rule, screen, title: str(r.title, 140), reason: str(r.reason, REASON_MAX), atMs: ms(r.atMs ?? r.at) };
}

/** demo_registry/owner_rules (or the runner's status payload copy) → typed, bounded. */
export function parseOwnerRulesDoc(raw: unknown): OwnerRulesDoc {
  const r = obj(raw);
  const notes = (Array.isArray(r.notes) ? r.notes : []).slice(0, MAX_NOTES).map(parseOwnerNote).filter((n): n is OwnerNote => !!n);
  const dismissals = (Array.isArray(r.dismissals) ? r.dismissals : []).slice(-MAX_DISMISSALS).map(parseDismissal).filter((d): d is Dismissal => !!d);
  return { notes, dismissals };
}

/** The next panel note id: OWN-101, OWN-102, … (after the highest existing one). */
export function nextNoteId(notes: readonly Pick<OwnerNote, 'id'>[]): string | null {
  const max = notes.reduce((m, n) => Math.max(m, Number(n.id.slice(4)) || 0), PANEL_NOTE_FIRST - 1);
  const next = max + 1;
  return next > 999 ? null : `OWN-${String(next).padStart(3, '0')}`;
}

export type NoteInput = { text: string; screen: string | null; severity: QaSeverity };

/** POST body of "הוסף הערת בעלים". */
export function parseNoteInput(body: unknown): { ok: true; value: NoteInput } | { ok: false; error: string } {
  const b = obj(body);
  const text = str(b.text, NOTE_TEXT_MAX + 1);
  if (text.length < 4 || text.length > NOTE_TEXT_MAX) return { ok: false, error: 'bad_text' };
  const rawScreen = str(b.screen, 121);
  const screen = rawScreen ? screenOrNull(rawScreen) : null;
  if (rawScreen && !screen) return { ok: false, error: 'bad_screen' };
  const severity = b.severity === undefined || b.severity === '' ? 'P2' : b.severity;
  if (!QA_SEVERITIES.includes(severity as QaSeverity)) return { ok: false, error: 'bad_severity' };
  return { ok: true, value: { text, screen, severity: severity as QaSeverity } };
}

/** Appends a note (oldest dropped past MAX_NOTES). null = no free id. */
export function addNote(doc: OwnerRulesDoc, input: NoteInput, nowMs: number): { doc: OwnerRulesDoc; note: OwnerNote } | null {
  const id = nextNoteId(doc.notes);
  if (!id) return null;
  const note: OwnerNote = { id, text: input.text, screen: input.screen, severity: input.severity, createdAtMs: nowMs };
  return { doc: { ...doc, notes: [...doc.notes, note].slice(-MAX_NOTES) }, note };
}

/**
 * A triage change on a tester finding → the new dismissal list. "לא רלוונטי" (re)adds one row
 * for the finding; any other status ("טופל" keeps the rule, "פתח מחדש") removes its row.
 */
export function applyTriageToDismissals(list: readonly Dismissal[], findingId: string, next: Dismissal | null): Dismissal[] {
  const rest = list.filter((d) => d.findingId !== findingId);
  return next ? [...rest, next].slice(-MAX_DISMISSALS) : rest;
}

/** The screen a finding doc belongs to: its repro screen marker ({ name: 'screen', screen }), else its route. */
export function findingScreenKey(raw: Record<string, unknown> | undefined | null): string {
  const d = raw ?? {};
  const repro = Array.isArray(d.repro) ? d.repro : [];
  for (let i = repro.length - 1; i >= 0; i--) {
    const r = obj(repro[i]);
    if (r.name === 'screen' && isScreenKey(r.screen)) return r.screen;
  }
  const route = isScreenKey(d.route) ? d.route : '/';
  return route;
}

/** The dismissal row for a finding doc marked "לא רלוונטי". */
export function dismissalFromFinding(findingId: string, raw: Record<string, unknown> | undefined | null, reason: string, nowMs: number): Dismissal {
  const d = raw ?? {};
  return {
    findingId,
    rule: typeof d.rule === 'string' && /^[A-Z0-9-]{2,30}$/.test(d.rule) ? d.rule : null,
    screen: findingScreenKey(d),
    title: str(d.title, 140),
    reason: str(reason, REASON_MAX),
    atMs: nowMs,
  };
}

/** Optional "למה לא רלוונטי" text from the status POST body. */
export function parseReason(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string') return null;
  const s = v.trim().slice(0, REASON_MAX);
  return s || null;
}

/** Dismissals this many times for one rule on one screen → the testers stop reporting it there. */
export const SUPPRESS_AFTER = 2;

export interface DismissalGroup {
  rule: string;
  screen: string;
  count: number;
  /** Distinct non-empty reasons, newest first (≤ 3). */
  reasons: string[];
  /** A sample finding title (newest). */
  title: string;
  lastAtMs: number;
  /** count ≥ SUPPRESS_AFTER. */
  suppressed: boolean;
}

/**
 * Dismissals grouped by rule + screen (findings without a rule id are not grouped: there is
 * nothing stable to suppress). Deterministic order: suppressed first, then count, then key —
 * the runner pastes this into a cached system prompt.
 */
export function groupDismissals(list: readonly Dismissal[]): DismissalGroup[] {
  const by = new Map<string, Dismissal[]>();
  for (const d of list) {
    if (!d.rule) continue;
    const k = `${d.rule}|${d.screen}`;
    by.set(k, [...(by.get(k) ?? []), d]);
  }
  const out: DismissalGroup[] = [];
  for (const rows of Array.from(by.values())) {
    const newest = [...rows].sort((a, b) => b.atMs - a.atMs || (a.findingId < b.findingId ? -1 : 1));
    const reasons = Array.from(new Set(newest.map((r) => r.reason).filter(Boolean))).slice(0, 3);
    out.push({
      rule: rows[0].rule!,
      screen: rows[0].screen,
      count: rows.length,
      reasons,
      title: newest[0].title,
      lastAtMs: newest[0].atMs,
      suppressed: rows.length >= SUPPRESS_AFTER,
    });
  }
  return out.sort((a, b) => Number(b.suppressed) - Number(a.suppressed) || b.count - a.count || `${a.rule}|${a.screen}`.localeCompare(`${b.rule}|${b.screen}`));
}
