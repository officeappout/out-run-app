/**
 * push-library.service — the admin panel's read/write layer for the push
 * library (/admin/notifications/library).
 *
 * Same collection as the original Notification Manager
 * (`workoutMetadata/notifications/notifications`), one doc per variant,
 * extended with pushType / title / body / deepLink / audience / conditions /
 * timeWindow / active / archived / version. Writes go through the client SDK
 * like the existing editor (`firestore.rules`: workoutMetadata writes are
 * isAdmin()). Rows are never deleted — archived instead.
 *
 * Every save is validated with the same rules the senders rely on
 * (push-library.core.ts validatePushCopyDraft); a save that fails them is
 * refused here too, not only disabled in the UI.
 */

import {
  addDoc,
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  PUSH_CATALOG_BY_TYPE,
  PUSH_LIBRARY_COLLECTION,
  legacyPushMapping,
  normalizeLegacyPlaceholders,
  validatePushCopyDraft,
  type PushAudienceFilter,
  type PushCopyDraft,
  type PushCopyIssue,
  type PushTimeWindow,
} from '@/features/notifications/push-library/push-library.core';
import { normalizePersonaValue } from '@/features/user/onboarding/services/persona-alias-map.service';

export interface PushLibraryRow {
  id: string;
  pushType: string;
  /** Written before the library (no pushType on the doc) — shown under its mapped pushType. */
  legacy: boolean;
  lever: string | null;
  title: string;
  body: string;
  deepLink: string | null;
  audience: PushAudienceFilter | null;
  conditions: Record<string, string[]> | null;
  timeWindow: PushTimeWindow | null;
  /** Used only when no other variant can be filled (e.g. the one without the park name). */
  fallbackOnly: boolean;
  active: boolean;
  archived: boolean;
  archivedReason: string | null;
  needsRewrite: boolean;
  rewriteReasons: string[];
  version: number;
  updatedAt: Date | null;
}

function strList(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === 'string' && x.length > 0);
  return out.length ? out : undefined;
}

function toDate(v: unknown): Date | null {
  if (v && typeof v === 'object' && 'toDate' in v && typeof (v as { toDate: unknown }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate();
  }
  return null;
}

function cleanAudience(a: PushAudienceFilter | null | undefined): PushAudienceFilter | null {
  if (!a) return null;
  const out: PushAudienceFilter = {};
  if (a.persona?.length) out.persona = a.persona;
  if (a.ageBand?.length) out.ageBand = a.ageBand;
  if (a.primaryGoal?.length) out.primaryGoal = a.primaryGoal;
  return Object.keys(out).length ? out : null;
}

function cleanConditions(c: Record<string, string[]> | null | undefined): Record<string, string[]> | null {
  if (!c) return null;
  const out = Object.fromEntries(Object.entries(c).filter(([, v]) => Array.isArray(v) && v.length > 0));
  return Object.keys(out).length ? out : null;
}

export function toPushLibraryRow(id: string, data: DocumentData): PushLibraryRow | null {
  const base = {
    id,
    active: data.active !== false,
    archived: data.archived === true,
    archivedReason: typeof data.archivedReason === 'string' ? data.archivedReason : null,
    needsRewrite: data.needsRewrite === true,
    rewriteReasons: strList(data.rewriteReasons) ?? [],
    version: typeof data.version === 'number' ? data.version : 0,
    updatedAt: toDate(data.updatedAt),
    fallbackOnly: data.fallbackOnly === true,
  };
  if (typeof data.pushType === 'string' && PUSH_CATALOG_BY_TYPE[data.pushType]) {
    const a = (data.audience ?? {}) as Record<string, unknown>;
    return {
      ...base,
      pushType: data.pushType,
      legacy: false,
      lever: typeof data.lever === 'string' ? data.lever : null,
      title: typeof data.title === 'string' ? data.title : '',
      body: typeof data.body === 'string' && data.body ? data.body : typeof data.text === 'string' ? data.text : '',
      deepLink: typeof data.deepLink === 'string' ? data.deepLink : null,
      audience: cleanAudience({ persona: strList(a.persona), ageBand: strList(a.ageBand), primaryGoal: strList(a.primaryGoal) }),
      conditions: cleanConditions(
        data.conditions && typeof data.conditions === 'object'
          ? Object.fromEntries(Object.entries(data.conditions as Record<string, unknown>).map(([k, v]) => [k, strList(v) ?? []]))
          : null,
      ),
      timeWindow:
        data.timeWindow && typeof data.timeWindow.start === 'string' && typeof data.timeWindow.end === 'string'
          ? { start: data.timeWindow.start, end: data.timeWindow.end }
          : null,
    };
  }
  const legacy = legacyPushMapping(data);
  if (!legacy) return null;
  const entry = PUSH_CATALOG_BY_TYPE[legacy.pushType];
  const persona = normalizePersonaValue(data.persona);
  return {
    ...base,
    pushType: legacy.pushType,
    legacy: true,
    lever: null,
    title: entry.defaults[0]?.title ?? '',
    body: normalizeLegacyPlaceholders(typeof data.text === 'string' ? data.text : ''),
    deepLink: null,
    audience: persona && persona !== 'generic' ? { persona: [persona] } : null,
    conditions: legacy.conditions,
    timeWindow: null,
  };
}

/** Every doc that belongs to the push library (incl. legacy rows still in use). */
export async function loadPushLibrary(): Promise<PushLibraryRow[]> {
  const snap = await getDocs(collection(db, PUSH_LIBRARY_COLLECTION));
  const rows: PushLibraryRow[] = [];
  snap.docs.forEach((d) => {
    const row = toPushLibraryRow(d.id, d.data());
    if (row) rows.push(row);
  });
  return rows;
}

export class PushCopyValidationError extends Error {
  constructor(public issues: PushCopyIssue[]) {
    super(issues.map((i) => i.message).join(' · '));
  }
}

/**
 * Create (id null) or update a variant. Validates first; bumps `version`.
 * Saving a legacy row converts it into a library row (its legacy fields stay).
 * A successful save clears needsRewrite.
 */
export async function savePushCopy(
  id: string | null,
  draft: PushCopyDraft & { lever: string },
  opts: { previousVersion?: number; uid: string | null; active?: boolean; fallbackOnly?: boolean },
): Promise<string> {
  const issues = validatePushCopyDraft(draft);
  if (issues.length > 0) throw new PushCopyValidationError(issues);
  const payload = {
    pushType: draft.pushType,
    lever: draft.lever,
    title: draft.title.trim(),
    body: draft.body.trim(),
    // `text` mirrors the body for the older readers of this collection
    // (workout-settings editor, simulator preview, push-performance table).
    text: draft.body.trim(),
    deepLink: draft.deepLink,
    audience: cleanAudience(draft.audience),
    conditions: cleanConditions(draft.conditions),
    timeWindow: draft.timeWindow && draft.timeWindow.start && draft.timeWindow.end ? draft.timeWindow : null,
    fallbackOnly: opts.fallbackOnly === true,
    active: opts.active ?? true,
    archived: false,
    needsRewrite: false,
    version: (opts.previousVersion ?? 0) + 1,
    updatedAt: serverTimestamp(),
    updatedBy: opts.uid,
  };
  if (id) {
    await setDoc(doc(db, PUSH_LIBRARY_COLLECTION, id), payload, { merge: true });
    return id;
  }
  const ref = await addDoc(collection(db, PUSH_LIBRARY_COLLECTION), {
    ...payload,
    bundleId: `lib_${draft.pushType}_${Date.now().toString(36)}`,
    createdAt: serverTimestamp(),
    createdBy: opts.uid,
  });
  return ref.id;
}

/** Switch a variant on/off. Switching ON requires the copy to pass the write rules. */
export async function setPushRowActive(row: PushLibraryRow, active: boolean, uid: string | null): Promise<void> {
  if (active) {
    const issues = validatePushCopyDraft({
      pushType: row.pushType,
      title: row.title,
      body: row.body,
      deepLink: row.deepLink ?? PUSH_CATALOG_BY_TYPE[row.pushType]?.deepLinks[0],
      audience: row.audience,
      conditions: row.conditions,
      timeWindow: row.timeWindow,
    });
    if (issues.length > 0 || row.needsRewrite) throw new PushCopyValidationError(issues.length ? issues : [{ field: 'body', message: 'השורה מסומנת לשכתוב. עורכים ושומרים, ואז מפעילים' }]);
  }
  await updateDoc(doc(db, PUSH_LIBRARY_COLLECTION, row.id), {
    active,
    version: row.version + 1,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
}

/** Archive instead of delete: off, hidden by default, kept for history. */
export async function archivePushRow(row: PushLibraryRow, reason: string, uid: string | null): Promise<void> {
  await updateDoc(doc(db, PUSH_LIBRARY_COLLECTION, row.id), {
    active: false,
    archived: true,
    archivedReason: reason || 'הועבר לארכיון מהפאנל',
    archivedAt: serverTimestamp(),
    archivedBy: uid,
    version: row.version + 1,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
}

/** Back from the archive, switched off (turn it on explicitly). */
export async function unarchivePushRow(row: PushLibraryRow, uid: string | null): Promise<void> {
  await updateDoc(doc(db, PUSH_LIBRARY_COLLECTION, row.id), {
    archived: false,
    active: false,
    version: row.version + 1,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
}
