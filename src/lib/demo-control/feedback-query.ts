/**
 * "משוב דמו" — filters, the cursor and the merged page (pure, no Firebase import).
 *
 * Two collections, newest first, 30 per page. Each request scans at most SCAN_LIMIT newest
 * docs per source below the cursor (orderBy createdAt desc — a single-field query, so no
 * composite index), filters in memory (type / severity / persona / status), merges and cuts.
 *
 * Completeness: when a source returned a FULL scan, docs older than its oldest scanned doc
 * were not seen. Only items strictly newer than the newest such "horizon" are certain to be
 * in order, so the page stops there and the next cursor resumes at the horizon. A page may
 * therefore come back short (even empty) with a cursor — "טען עוד" keeps scanning.
 */
import { QA_SEVERITIES, type QaSeverity } from './qa-summary';
import {
  FEEDBACK_TYPES,
  LIFE_FEEDBACK_TYPES,
  TRIAGE_STATUSES,
  type FeedbackItem,
  type FeedbackSource,
  type FeedbackType,
  type TriageStatus,
} from './feedback-model';

export const FEEDBACK_PAGE_SIZE = 30;
/** Docs read per source per request (load-safety bound). */
export const SCAN_LIMIT = 120;

export interface FeedbackFilters {
  source: FeedbackSource | 'all';
  type: FeedbackType | null;
  severity: QaSeverity | null;
  /** Case-insensitive substring of the persona name or id. */
  persona: string | null;
  status: TriageStatus | 'all';
  /** Israel day keys (YYYY-MM-DD), inclusive. */
  from: string | null;
  to: string | null;
}

export interface FeedbackCursor {
  /** Resume at createdAt <= ms. */
  ms: number;
  /** Ids already shown at exactly `ms`. */
  skip: string[];
}

export interface FeedbackPage {
  items: FeedbackItem[];
  nextCursor: string | null;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function pickEnum<T extends string>(v: string | null, allowed: readonly T[]): T | null {
  return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

export function parseFeedbackFilters(p: URLSearchParams): FeedbackFilters {
  const persona = (p.get('persona') ?? '').trim().slice(0, 60);
  const from = p.get('from');
  const to = p.get('to');
  return {
    source: pickEnum(p.get('source'), ['life', 'testers'] as const) ?? 'all',
    type: pickEnum(p.get('type'), FEEDBACK_TYPES),
    severity: pickEnum(p.get('severity'), QA_SEVERITIES),
    persona: persona || null,
    status: pickEnum(p.get('status'), TRIAGE_STATUSES) ?? 'all',
    from: from && DAY_RE.test(from) ? from : null,
    to: to && DAY_RE.test(to) ? to : null,
  };
}

/** Which collections a filter set can match at all (severity / a tester category rule out life, and vice versa). */
export function sourcesFor(f: FeedbackFilters): FeedbackSource[] {
  const lifeType = f.type !== null && (LIFE_FEEDBACK_TYPES as readonly string[]).includes(f.type);
  const testerType = f.type !== null && !lifeType;
  const out: FeedbackSource[] = [];
  if ((f.source === 'all' || f.source === 'life') && f.severity === null && !testerType) out.push('life');
  if ((f.source === 'all' || f.source === 'testers') && !lifeType) out.push('testers');
  return out;
}

export function matchesFilters(item: FeedbackItem, f: FeedbackFilters): boolean {
  if (f.type !== null && item.type !== f.type) return false;
  if (f.severity !== null && item.severity !== f.severity) return false;
  if (f.status !== 'all' && item.status !== f.status) return false;
  if (f.persona !== null) {
    const q = f.persona.toLowerCase();
    if (!item.personaName.toLowerCase().includes(q) && !item.personaId.toLowerCase().includes(q)) return false;
  }
  return true;
}

/** Midnight (Israel) of a YYYY-MM-DD key, in epoch ms. */
export function israelDayStartMs(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(utcMidnight));
  const get = (t: string) => Number(parts.find((x) => x.type === t)?.value);
  const wallAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return utcMidnight - (wallAsUtc - utcMidnight);
}

/** The createdAt window of a request: [fromMs, toMs] (either may be null = open). */
export function dateWindow(f: FeedbackFilters): { fromMs: number | null; toMs: number | null } {
  return {
    fromMs: f.from ? israelDayStartMs(f.from) : null,
    toMs: f.to ? nextDayStart(f.to) - 1 : null,
  };
}

function nextDayStart(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return israelDayStartMs(next.toISOString().slice(0, 10));
}

export function encodeCursor(c: FeedbackCursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string | null): FeedbackCursor | null {
  if (!raw || raw.length > 4000) return null;
  try {
    const c = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<FeedbackCursor>;
    if (typeof c.ms !== 'number' || !Number.isFinite(c.ms) || c.ms < 0) return null;
    const skip = Array.isArray(c.skip) ? c.skip.filter((x): x is string => typeof x === 'string').slice(0, 200) : [];
    return { ms: c.ms, skip };
  } catch {
    return null;
  }
}

/** The upper bound of this request's scan: the cursor, else the "to" day, else open. */
export function scanUpperMs(cursor: FeedbackCursor | null, toMs: number | null): number | null {
  if (cursor && toMs !== null) return Math.min(cursor.ms, toMs);
  return cursor?.ms ?? toMs;
}

export interface SourceScan {
  /** Mapped docs, newest first, as read (before filters). */
  items: FeedbackItem[];
  /** The query returned SCAN_LIMIT docs (older ones may exist). */
  full: boolean;
}

const newestFirst = (a: FeedbackItem, b: FeedbackItem) => b.createdAtMs - a.createdAtMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function buildFeedbackPage(scans: SourceScan[], f: FeedbackFilters, cursor: FeedbackCursor | null, pageSize = FEEDBACK_PAGE_SIZE): FeedbackPage {
  const skip = new Set(cursor?.skip ?? []);
  const horizon = scans.reduce((h, sc) => (sc.full && sc.items.length ? Math.max(h, sc.items[sc.items.length - 1].createdAtMs) : h), -Infinity);
  const seen = scans.flatMap((sc) => sc.items).filter((it) => !(cursor && it.createdAtMs === cursor.ms && skip.has(`${it.source}:${it.id}`)));
  const certain = seen.filter((it) => it.createdAtMs > horizon);
  const matched = certain.filter((it) => matchesFilters(it, f)).sort(newestFirst);
  const items = matched.slice(0, pageSize);

  let next: FeedbackCursor | null = null;
  if (matched.length > pageSize) {
    const last = items[items.length - 1];
    const atLast = items.filter((it) => it.createdAtMs === last.createdAtMs).map((it) => `${it.source}:${it.id}`);
    // Everything newer than `last` that did not match is behind us; carry earlier skips at the same ms.
    const carried = cursor && cursor.ms === last.createdAtMs ? cursor.skip : [];
    next = { ms: last.createdAtMs, skip: [...carried, ...atLast] };
  } else if (Number.isFinite(horizon)) {
    // Not enough certain matches: resume at the horizon. (A whole scan of one ms value → step past it.)
    next = cursor && horizon >= cursor.ms ? { ms: cursor.ms - 1, skip: [] } : { ms: horizon, skip: [] };
  }
  return { items, nextCursor: next ? encodeCursor(next) : null };
}

const DOC_ID_RE = /^[A-Za-z0-9_.:-]{1,300}$/;

/** POST /api/admin/demo/feedback/status body. */
export function parseStatusInput(body: unknown): { ok: true; value: { source: FeedbackSource; id: string; status: TriageStatus } } | { ok: false; error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (b.source !== 'life' && b.source !== 'testers') return { ok: false, error: 'bad_request' };
  if (typeof b.id !== 'string' || !DOC_ID_RE.test(b.id) || b.id.includes('..')) return { ok: false, error: 'bad_request' };
  if (!TRIAGE_STATUSES.includes(b.status as TriageStatus)) return { ok: false, error: 'bad_request' };
  return { ok: true, value: { source: b.source, id: b.id, status: b.status as TriageStatus } };
}

export function isFeedbackDocId(v: unknown): v is string {
  return typeof v === 'string' && DOC_ID_RE.test(v) && !v.includes('..');
}

/** A tester screenshot path the panel may sign: qa/… only, no traversal. */
export function isQaScreenshotPath(v: unknown): v is string {
  return typeof v === 'string' && /^qa\/[A-Za-z0-9_.\/-]{1,300}$/.test(v) && !v.includes('..') && !v.includes('//');
}
