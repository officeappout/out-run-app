/**
 * push-copy.service — every push's TEXT comes from here.
 *
 * Code decides WHEN to send (each sender keeps its own timing and caps); the
 * admin-editable push library decides WHAT to say. `resolvePushCopy(pushType,
 * ctx)` returns `{ title, body, deepLink, rowId }` for one recipient:
 *
 *   1. Library rows from the existing Notification Manager collection
 *      (`workoutMetadata/notifications/notifications`, the same one
 *      notification-content.service.ts reads), cached in-process for 10 min.
 *   2. Only live rows (active, not archived, not flagged needsRewrite) of the
 *      pushType, matching the recipient's audience / conditions / time window.
 *   3. Most specific wins; ties rotate deterministically per user per day.
 *   4. The row is filled with the recipient's values and checked (every
 *      variable resolved, no '/', not empty). A row that fails is skipped.
 *   5. Nothing fits → the pushType's CODE DEFAULT (the rewritten copy from
 *      the copy audit), by the same rules. Still nothing → null and the
 *      caller sends nothing (e.g. a step-goal bucket with no copy).
 *
 * The catalog, write rules and the selection itself live in
 * ../shared/push-library.core.ts (a committed mirror of
 * src/features/notifications/push-library/push-library.core.ts, which the
 * admin panel uses for its editor and preview), so the panel and the senders
 * can never disagree about what a row means.
 *
 * Backward compatibility: rows written before the library had a pushType
 * (the original content library: Daily_Goal / Future_Partner_Plan copy,
 * `text` only, `{placeName}`-style placeholders) are adapted here and keep
 * being used until they're archived. The 201 dormant Inactivity rows have no
 * pushType mapping and are ignored (scripts/seed-push-library.ts classifies
 * them for the owner).
 */

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import {
  PUSH_LIBRARY_COLLECTION,
  PUSH_CATALOG_BY_TYPE,
  ageBandFromBirthDate,
  legacyPushMapping,
  normalizeLegacyPlaceholders,
  selectPushCopy,
  type PushAudience,
  type PushAudienceFilter,
  type PushCopyContext,
  type PushCopyRow,
  type PushTimeWindow,
  type ResolvedPushCopy,
} from '../shared/push-library.core';
import {
  normalizePersonaValue,
  resolveCanonicalPersona,
  type PersonaResolvableProfile,
} from './persona-alias-map.service';

export type { ResolvedPushCopy, PushCopyContext } from '../shared/push-library.core';

const getDb = () => admin.firestore();

export const PUSH_COPY_CACHE_TTL_MS = 10 * 60 * 1000;

let rowCache: { rows: PushCopyRow[]; fetchedAt: number } | null = null;

/** Tests only. */
export function __resetPushCopyCache(): void {
  rowCache = null;
}

// ─── Firestore doc → PushCopyRow ──────────────────────────────────────────────

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function strList(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === 'string' && x.length > 0);
  return out.length > 0 ? out : undefined;
}

function adaptAudience(v: unknown): PushAudienceFilter | null {
  if (!v || typeof v !== 'object') return null;
  const a = v as Record<string, unknown>;
  const persona = strList(a.persona)
    ?.map((p) => normalizePersonaValue(p))
    .filter((p): p is NonNullable<typeof p> => !!p && p !== 'generic');
  const out: PushAudienceFilter = {
    ...(persona && persona.length > 0 ? { persona } : {}),
    ...(strList(a.ageBand) ? { ageBand: strList(a.ageBand) } : {}),
    ...(strList(a.primaryGoal) ? { primaryGoal: strList(a.primaryGoal) } : {}),
  };
  return Object.keys(out).length > 0 ? out : null;
}

function adaptConditions(v: unknown): Record<string, string[]> | null {
  if (!v || typeof v !== 'object') return null;
  const out: Record<string, string[]> = {};
  for (const [k, list] of Object.entries(v as Record<string, unknown>)) {
    const l = strList(list);
    if (l) out[k] = l;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function adaptTimeWindow(v: unknown): PushTimeWindow | null {
  if (!v || typeof v !== 'object') return null;
  const w = v as Record<string, unknown>;
  const start = str(w.start);
  const end = str(w.end);
  return start && end ? { start, end } : null;
}

/** Exported for tests. null = not a push-library row (e.g. a dormant Inactivity row). */
export function adaptLibraryDoc(id: string, data: Record<string, unknown>): PushCopyRow | null {
  const pushType = str(data.pushType);
  const flags = {
    active: data.active !== false,
    archived: data.archived === true,
    needsRewrite: data.needsRewrite === true,
  };

  if (pushType) {
    if (!PUSH_CATALOG_BY_TYPE[pushType]) return null;
    return {
      id,
      pushType,
      title: str(data.title),
      body: str(data.body) || str(data.text),
      deepLink: str(data.deepLink) || null,
      audience: adaptAudience(data.audience),
      conditions: adaptConditions(data.conditions),
      timeWindow: adaptTimeWindow(data.timeWindow),
      fallbackOnly: data.fallbackOnly === true,
      ...flags,
    };
  }

  const legacy = legacyPushMapping(data);
  if (!legacy) return null;
  const entry = PUSH_CATALOG_BY_TYPE[legacy.pushType];
  const persona = normalizePersonaValue(data.persona);
  return {
    id,
    pushType: legacy.pushType,
    // Legacy rows carried only a body; the title was a constant in the sender.
    title: entry.defaults[0]?.title ?? '',
    body: normalizeLegacyPlaceholders(str(data.text)),
    deepLink: null,
    audience: persona && persona !== 'generic' ? { persona: [persona] } : null,
    conditions: legacy.conditions,
    timeWindow: null,
    ...flags,
  };
}

/**
 * The whole library collection, adapted, cached for 10 minutes (same
 * full-fetch approach as notification-content.service.ts: a few hundred docs,
 * filtered in memory). A failed read is NOT cached, and returns [] so the
 * caller falls back to the code defaults instead of not sending.
 */
export async function getPushLibraryRows(now: number = Date.now()): Promise<PushCopyRow[]> {
  if (rowCache && now - rowCache.fetchedAt <= PUSH_COPY_CACHE_TTL_MS) return rowCache.rows;
  try {
    const snap = await getDb().collection(PUSH_LIBRARY_COLLECTION).get();
    const rows: PushCopyRow[] = [];
    for (const d of snap.docs) {
      const row = adaptLibraryDoc(d.id, d.data() as Record<string, unknown>);
      if (row) rows.push(row);
    }
    rowCache = { rows, fetchedAt: now };
    logger.info(`[push-copy] library cache refreshed: ${rows.length} push row(s) of ${snap.size} doc(s)`);
    return rows;
  } catch (err) {
    logger.warn('[push-copy] library read failed, using code defaults', err);
    return [];
  }
}

/**
 * Title + body + deep link for one recipient, or null when there is no copy
 * that fits (the caller sends nothing). See the module header.
 */
export async function resolvePushCopy(pushType: string, ctx: PushCopyContext): Promise<ResolvedPushCopy | null> {
  if (!PUSH_CATALOG_BY_TYPE[pushType]) {
    logger.error(`[push-copy] unknown pushType "${pushType}"`);
    return null;
  }
  const rows = await getPushLibraryRows();
  const resolved = selectPushCopy(pushType, rows, ctx);
  if (!resolved) {
    logger.info(`[push-copy] no copy fits pushType=${pushType} uid=${ctx.uid}`);
  }
  return resolved;
}

// ─── Recipient helpers ────────────────────────────────────────────────────────

function toMillis(v: unknown): number | null {
  if (!v) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const ms = new Date(v).getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof v === 'object') {
    const t = v as { toMillis?: () => number; seconds?: number };
    if (typeof t.toMillis === 'function') return t.toMillis();
    if (typeof t.seconds === 'number') return t.seconds * 1000;
  }
  return null;
}

/** persona / ageBand / primaryGoal from a raw users/{uid} doc. */
export function audienceFromUserData(data: Record<string, unknown> | undefined, now: Date = new Date()): PushAudience {
  if (!data) return {};
  const core = (data.core ?? {}) as Record<string, unknown>;
  const persona = resolveCanonicalPersona(data as PersonaResolvableProfile);
  return {
    persona: persona === 'generic' ? null : persona,
    ageBand: ageBandFromBirthDate(toMillis(core.birthDate), now),
    primaryGoal: typeof core.mainGoal === 'string' && core.mainGoal ? core.mainGoal : null,
  };
}

/** @שם: the first name from users/{uid}.core.name ('' when unknown, so copy with @שם is skipped). */
export function firstNameFromUserData(data: Record<string, unknown> | undefined): string {
  const name = (data?.core as Record<string, unknown> | undefined)?.name;
  if (typeof name !== 'string') return '';
  return name.trim().split(/\s+/)[0] ?? '';
}

export interface PushRecipientProfile {
  audience: PushAudience;
  firstName: string;
  data?: Record<string, unknown>;
}

/** One best-effort users/{uid} read for senders that don't already have the doc. Never throws. */
export async function loadPushRecipient(uid: string): Promise<PushRecipientProfile> {
  try {
    const snap = await getDb().collection('users').doc(uid).get();
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : undefined;
    return { audience: audienceFromUserData(data), firstName: firstNameFromUserData(data), data };
  } catch (err) {
    logger.warn(`[push-copy] recipient read failed uid=${uid}, generic copy only`, err);
    return { audience: {}, firstName: '' };
  }
}

/** FCM data fields that tie a delivered push back to its library row (per-row analytics). */
export function pushCopyData(copy: ResolvedPushCopy): Record<string, string> {
  return { pushType: copy.pushType, copyRowId: copy.rowId };
}
