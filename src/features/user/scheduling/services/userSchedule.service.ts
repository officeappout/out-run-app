/**
 * UserSchedule Service — UTS Phase 1
 *
 * Pure async Firestore service (no React hooks).
 * Collection: 'userSchedule'
 * Document ID: '{userId}_{YYYY-MM-DD}'
 *
 * All functions await Firebase Auth readiness before touching Firestore,
 * preventing "Missing or insufficient permissions" during app startup.
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import type {
  UserScheduleEntry,
  UserScheduleDay,
  RecurringTemplate,
  ScheduleActivityCategory,
} from '../types/schedule.types';
import { getHebrewDayLetter, addDays } from '../utils/dateUtils';

const COLLECTION = 'userSchedule';

const docId = (userId: string, date: string): string => `${userId}_${date}`;

// ── Auth Readiness Gate ────────────────────────────────────────────────────

/** Cached ONLY after a successful auth (user is non-null). */
let _authOk: Promise<void> | null = null;

/**
 * Waits until `auth.currentUser` is a signed-in user.
 *
 * Key design:
 *   • If currentUser is already available → resolve immediately.
 *   • Otherwise listen via `onAuthStateChanged` and resolve once
 *     the callback delivers a non-null user.
 *   • The result is only cached after success. If it times out
 *     (no user after 8 s), it resolves but does NOT cache, so the
 *     next call retries from scratch.
 *   • Also tries Firebase v10+ `authStateReady()` when available.
 */
function waitForAuth(): Promise<void> {
  // Fast path — user already available
  if (auth.currentUser) {
    _authOk = _authOk ?? Promise.resolve();
    return _authOk;
  }

  // If a previous call already succeeded, reuse
  if (_authOk) return _authOk;

  // Create a new attempt
  const attempt = new Promise<void>((resolve) => {
    let settled = false;

    // Firebase v10+ fast-path
    if (typeof (auth as any).authStateReady === 'function') {
      (auth as any).authStateReady().then(() => {
        if (!settled && auth.currentUser) {
          settled = true;
          _authOk = Promise.resolve();
          resolve();
        }
      }).catch(() => {});
    }

    // Standard listener
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user && !settled) {
        settled = true;
        unsub();
        _authOk = Promise.resolve();
        resolve();
      }
    });

    // Safety timeout — resolve but do NOT cache so next call retries
    setTimeout(() => {
      if (!settled) {
        settled = true;
        unsub();
        console.warn('[UserSchedule] waitForAuth: timed out after 8 s — no user');
        resolve();
      }
    }, 8_000);
  });

  return attempt;
}

/**
 * Waits for Firebase Auth readiness, then returns the authenticated UID.
 * Callers should use the returned UID for all Firestore operations
 * instead of relying on a UID passed from component props.
 */
async function resolveAuthUid(): Promise<string | null> {
  await waitForAuth();

  const cur = auth.currentUser;
  if (!cur) {
    console.warn('[UserSchedule] resolveAuthUid — no currentUser after waitForAuth');
    return null;
  }
  return cur.uid;
}

// ── Read ───────────────────────────────────────────────────────────────────

/**
 * Convenience façade — returns the "primary" entry for a date.
 *
 * Selection priority on a multi-entry day:
 *   1. First non-community training entry (the user's personal workout)
 *   2. First training entry of any source
 *   3. First entry of any type
 *
 * Used by call-sites that pre-date the multi-entry UI (StatsOverview,
 * RollingAgenda's existing-entry probe, etc.) — UI components that need to
 * render every entry on a day should call `getScheduleEntries` directly.
 */
export async function getScheduleEntry(
  _userId: string,
  date: string,
): Promise<UserScheduleEntry | null> {
  const entries = await getScheduleEntries(_userId, date);
  if (entries.length === 0) return null;
  return (
    entries.find((e) => e.type === 'training' && e.source !== 'community') ??
    entries.find((e) => e.type === 'training') ??
    entries[0]
  );
}

/**
 * Read all schedule entries across a 7-day window (Sunday-anchored).
 * Returns a flat list — a single day may contribute multiple entries.
 */
export async function getWeekEntries(
  _userId: string,
  sundayISO: string,
): Promise<UserScheduleEntry[]> {
  const uid = await resolveAuthUid();
  if (!uid) return [];
  try {
    const dates = Array.from({ length: 7 }, (_, i) => addDays(sundayISO, i));
    const refs = dates.map(d => doc(db, COLLECTION, docId(uid, d)));
    const snaps = await Promise.all(refs.map(r => getDoc(r)));
    return snaps
      .filter((s) => s.exists())
      .flatMap((s) => readDay(s.id, s.data() as Record<string, unknown>).entries);
  } catch (err) {
    console.error(`[UserSchedule] getWeekEntries failed for ${uid} week ${sundayISO}:`, err);
    return [];
  }
}

// ── Hydration ──────────────────────────────────────────────────────────────

/**
 * Hydrate a concrete day from the user's recurringTemplate, when no Firestore
 * doc yet exists for the date.  Writes via the entries[] format helper
 * (`addScheduleEntry`) and returns the new entry so callers can render it
 * synchronously.
 *
 * Zombie-loop guard: if the day already has an entry with `override === true`
 * (written by `removeScheduleEntry` as a tombstone) **or** a manually-set
 * rest entry (`type === 'rest'` from a `source !== 'recurring'` path), hydration
 * is skipped entirely.  This prevents the "delete → instant re-add" loop
 * where the background hydrator immediately recreates the deleted entry.
 */
export async function hydrateFromTemplate(
  _userId: string,
  date: string,
  template: RecurringTemplate,
): Promise<UserScheduleEntry | null> {
  const uid = await resolveAuthUid();
  if (!uid) return null;

  const dayLetter = getHebrewDayLetter(new Date(date + 'T00:00:00'));
  const programIds = template[dayLetter];
  if (!programIds) return null;

  // ── Zombie-loop guard ───────────────────────────────────────────────────
  // If a document already exists for this date, check whether any entry
  // marks it as user-overridden (override === true) or as an explicitly
  // set rest day from a non-recurring source.  Both signals mean the user
  // intentionally cleared the day and we must NOT re-populate it.
  const existingDay = await getScheduleDay(uid, date);
  if (existingDay) {
    const blockingEntry = existingDay.entries.find(
      (e) => e.override === true || (e.type === 'rest' && e.source !== 'recurring'),
    );
    if (blockingEntry) {
      console.log(
        `[UserSchedule] HYDRATE SKIPPED  date=${date}` +
        `  (entry override=${blockingEntry.override ?? false}, type=${blockingEntry.type}, source=${blockingEntry.source})`,
      );
      return blockingEntry;
    }
    // Non-blocking entries exist (e.g. community session) — fall through and
    // add the recurring training entry alongside them.
  }

  const nowIso = new Date().toISOString();
  const entry: UserScheduleEntry = {
    entryId: genEntryId(),
    userId: uid,
    date,
    programIds,
    type: programIds.length === 0 ? 'rest' : 'training',
    source: 'recurring',
    completed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  try {
    await addScheduleEntry(uid, date, entry);
    return entry;
  } catch (err) {
    console.error(`[UserSchedule] HYDRATE FAILED  date=${date}  uid=${uid}`, err);
    return null;
  }
}

// ── Write ──────────────────────────────────────────────────────────────────

/**
 * Append a manual/auto entry to a date.  Delegates to `addScheduleEntry`,
 * which dedupes by `entryId` and writes the full `UserScheduleDay` document.
 *
 * Callers do not need to set `entryId` — one is generated automatically.
 * If the same `entryId` is supplied on a subsequent call, that single entry
 * is replaced in-place (preserving the rest of the day's entries).
 */
export async function upsertScheduleEntry(
  entry: Omit<UserScheduleEntry, 'createdAt' | 'updatedAt'>,
): Promise<void> {
  const uid = await resolveAuthUid();
  if (!uid) {
    console.warn('[UserSchedule] upsertScheduleEntry skipped — no authenticated user');
    return;
  }

  const nowIso = new Date().toISOString();
  const fullEntry: UserScheduleEntry = {
    ...entry,
    userId: uid,
    entryId: entry.entryId ?? genEntryId(),
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  try {
    await addScheduleEntry(uid, fullEntry.date, fullEntry);
    console.log(`[UserSchedule] WRITE OK  date=${fullEntry.date}  entryId=${fullEntry.entryId}`);
  } catch (err) {
    console.error(`[UserSchedule] WRITE FAILED  date=${fullEntry.date}  uid=${uid}`, err);
    throw err;
  }
}

// ── Drag & Drop — Move entry between dates ────────────────────────────────

/**
 * Move a training entry from one date to another.
 *
 * Source resolution priority:
 *   1. `entryId` — if provided, look up `entries.find(e => e.entryId === entryId)`
 *      on `fromDate`. Used by drag-and-drop where the dragged card knows
 *      exactly which entry it represents.
 *   2. Default heuristic — pick first non-community training entry, then any
 *      training, then `entries[0]`. Used when the caller doesn't yet know
 *      which entry to move (e.g. a drag from a synthesized fallback card
 *      that has no Firestore entry yet).
 *   3. If still nothing AND `fallbackEntry` supplied — synthesize from
 *      `recurringTemplate` / `scheduleDays` (recurring-day fallback).
 *
 * Writes via `addScheduleEntry` (target) and `removeScheduleEntry` (source).
 * For the synthesized fallback case, a rest-override entry is written on
 * `fromDate` so the recurring template no longer surfaces training there.
 */
export async function moveScheduleEntry(
  _userId: string,
  fromDate: string,
  toDate: string,
  fallbackEntry?: Partial<UserScheduleEntry>,
  entryId?: string,
): Promise<boolean> {
  if (fromDate === toDate) return false;
  const uid = await resolveAuthUid();
  if (!uid) return false;

  try {
    const sourceDay = await getScheduleDay(uid, fromDate);
    const sourceEntries = sourceDay?.entries ?? [];

    // Pick the source entry.
    let source: UserScheduleEntry | null = null;
    if (entryId) {
      source = sourceEntries.find((e) => e.entryId === entryId) ?? null;
    } else {
      source =
        sourceEntries.find((e) => e.type === 'training' && e.source !== 'community') ??
        sourceEntries.find((e) => e.type === 'training') ??
        sourceEntries[0] ??
        null;
    }

    // Synthesized recurring fallback — only valid when no entryId was specified
    // (entryId implies a real Firestore entry must exist).
    let isSynthesized = false;
    if (!source && !entryId && fallbackEntry) {
      source = {
        userId: uid,
        date: fromDate,
        type: 'training',
        source: 'recurring',
        completed: false,
        programIds: [],
        scheduledCategories: ['strength' as ScheduleActivityCategory],
        ...fallbackEntry,
      } as UserScheduleEntry;
      isSynthesized = true;
    }

    if (!source || source.type !== 'training') return false;

    // Build the moved copy with a fresh entryId so it's a new entry on toDate.
    const nowIso = new Date().toISOString();
    const moved: UserScheduleEntry = {
      ...source,
      entryId: genEntryId(),
      userId: uid,
      date: toDate,
      source: 'manual',
      completed: false,
      completedWorkoutId: undefined,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await addScheduleEntry(uid, toDate, moved);

    if (isSynthesized) {
      // Recurring day with no Firestore doc — write a rest-override entry on
      // fromDate so the template no longer surfaces training there.
      const restEntry: UserScheduleEntry = {
        entryId: genEntryId(),
        userId: uid,
        date: fromDate,
        type: 'rest',
        source: 'manual',
        completed: false,
        programIds: [],
        scheduledCategories: [],
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await addScheduleEntry(uid, fromDate, restEntry);
    } else if (source.entryId) {
      // Real Firestore entry — remove from the source day's entries[].
      await removeScheduleEntry(uid, fromDate, source.entryId);
    }

    console.log(
      `[UserSchedule] MOVED  ${fromDate} → ${toDate}  ` +
        `entryId=${source.entryId ?? '(synth)'}  newEntryId=${moved.entryId}`,
    );
    return true;
  } catch (err) {
    console.error(`[UserSchedule] MOVE FAILED  ${fromDate} → ${toDate}`, err);
    return false;
  }
}

/**
 * Swap a training day in the user's recurring schedule.
 * Updates `lifestyle.scheduleDays` (swaps the letter) and
 * `lifestyle.recurringTemplate` (renames the day key).
 *
 * Called for "change all schedule going forward" after a drag.
 * The caller must supply the current values to avoid an extra Firestore read.
 */
export async function updateScheduleDays(
  fromLetter: string,
  toLetter: string,
  currentScheduleDays: string[],
  currentRecurringTemplate?: Record<string, string[]>,
): Promise<boolean> {
  if (fromLetter === toLetter) return false;
  const uid = await resolveAuthUid();
  if (!uid) return false;

  const newScheduleDays = currentScheduleDays.map((d) =>
    d === fromLetter ? toLetter : d,
  );

  const newRecurringTemplate = currentRecurringTemplate
    ? Object.fromEntries(
        Object.entries(currentRecurringTemplate).map(([k, v]) =>
          k === fromLetter ? [toLetter, v] : [k, v],
        ),
      )
    : undefined;

  try {
    const userRef = doc(db, 'users', uid);
    const fields: Record<string, unknown> = {
      'lifestyle.scheduleDays': newScheduleDays,
      updatedAt: serverTimestamp(),
    };
    if (newRecurringTemplate !== undefined) {
      fields['lifestyle.recurringTemplate'] = newRecurringTemplate;
    }
    await updateDoc(userRef, fields);
    console.log(`[UserSchedule] SCHEDULE DAYS UPDATED  ${fromLetter} → ${toLetter}`);
    return true;
  } catch (err) {
    console.error('[UserSchedule] updateScheduleDays FAILED', err);
    return false;
  }
}

// ── entries[] Format Helpers ──────────────────────────────────────────────
//
// Authoritative shape:
//   userSchedule/{uid}_{date} → { userId, date, entries: UserScheduleEntry[], updatedAt }
//
// One day = one document = many entries. Personal training, community
// sessions, and rest overrides all live as separate elements of `entries`.
//
// The pre-migration `normalizeDay` shim that converted legacy flat docs and
// `communitySessions[]` top-level fields was removed in cleanup (step 14).
// `scripts/migrate-schedule-entries.ts` MUST be run before deploying this
// version of the code — any doc still in legacy shape will be ignored by
// `readDay` (with a one-shot console warning) and its data will appear to
// have vanished from the planner.
//
// ⚠️ Firestore rule: `serverTimestamp()` MAY ONLY appear at the top level of
// a write payload. It MUST NOT be placed inside `entries[]` — Firestore
// throws "FieldValue.serverTimestamp() can only appear at the top level of
// your update data" the moment such a write is attempted. Use a plain ISO
// string (`new Date().toISOString()`) for per-entry `createdAt` / `updatedAt`
// fields, and reserve `serverTimestamp()` for the wrapping document's
// top-level `updatedAt` only.

/** URL-safe id for an entry inside a UserScheduleDay. ~22 chars, collision-free for our scale. */
function genEntryId(): string {
  if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
    return (crypto as any).randomUUID() as string;
  }
  return `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Strip undefined fields so Firestore setDoc never rejects with "Unsupported field value: undefined". */
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

/**
 * One-shot warning bookkeeping — surfaces un-migrated legacy docs to the
 * console exactly once per docId per session, so the deploy-gate breach
 * (Step 14 deployed before Step 13a migration ran) is loud but not spammy.
 */
const _warnedLegacyDocs = new Set<string>();

/**
 * Read a day document and assert the post-migration shape.
 *
 * If the snapshot is missing `entries[]` (i.e. it's a legacy doc whose data
 * the migration script never converted) the call returns an empty
 * `UserScheduleDay` and emits a one-shot warning naming the docId. The
 * runtime treats the day as having no entries — the data is NOT auto-
 * recovered, you must run `scripts/migrate-schedule-entries.ts`.
 */
function readDay(docIdValue: string, data: Record<string, unknown>): UserScheduleDay {
  if (Array.isArray((data as { entries?: unknown }).entries)) {
    return data as unknown as UserScheduleDay;
  }

  if (!_warnedLegacyDocs.has(docIdValue)) {
    _warnedLegacyDocs.add(docIdValue);
    console.warn(
      `[UserSchedule] Legacy doc shape detected at userSchedule/${docIdValue} — ` +
        `expected an entries[] array.  Run scripts/migrate-schedule-entries.ts ` +
        `to migrate. Treating as empty for now.`,
    );
  }

  const flat = data as { userId?: string; date?: string; updatedAt?: unknown };
  return {
    userId: flat.userId ?? '',
    date: flat.date ?? '',
    entries: [],
    updatedAt: flat.updatedAt,
  };
}

/** Read a day document. Returns null only when the doc is missing. */
export async function getScheduleDay(
  _userId: string,
  date: string,
): Promise<UserScheduleDay | null> {
  const uid = await resolveAuthUid();
  if (!uid) return null;

  const id = docId(uid, date);
  try {
    const snap = await getDoc(doc(db, COLLECTION, id));
    if (!snap.exists()) return null;
    return readDay(id, snap.data() as Record<string, unknown>);
  } catch (err) {
    console.error(`[UserSchedule] getScheduleDay FAILED  path=${COLLECTION}/${id}`, err);
    return null;
  }
}

/** Convenience accessor — returns just the entries array (or [] when missing). */
export async function getScheduleEntries(
  _userId: string,
  date: string,
): Promise<UserScheduleEntry[]> {
  const day = await getScheduleDay(_userId, date);
  return day?.entries ?? [];
}

/**
 * Append (or replace by entryId) an entry on a date.
 *
 * Reads via the compat shim, dedups on `entryId`, then writes the full
 * `UserScheduleDay` doc with `merge: false`. If the incoming entry has no
 * `entryId`, one is generated.
 */
export async function addScheduleEntry(
  _userId: string,
  date: string,
  entry: UserScheduleEntry,
): Promise<void> {
  const uid = await resolveAuthUid();
  if (!uid) return;

  const incoming: UserScheduleEntry = {
    ...entry,
    userId: uid,
    date,
    entryId: entry.entryId ?? genEntryId(),
  };

  const day = (await getScheduleDay(_userId, date)) ?? {
    userId: uid,
    date,
    entries: [] as UserScheduleEntry[],
    updatedAt: serverTimestamp(),
  };

  const filtered = day.entries.filter((e) => e.entryId !== incoming.entryId);
  const cleanEntries = [...filtered, incoming].map(
    (e) => stripUndefined(e as unknown as Record<string, unknown>) as unknown as UserScheduleEntry,
  );

  const next: UserScheduleDay = {
    userId: uid,
    date,
    entries: cleanEntries,
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, COLLECTION, docId(uid, date)), next, { merge: false });
    console.log(`[UserSchedule] ENTRY ADDED  ${date}  entryId=${incoming.entryId}`);
  } catch (err) {
    console.error(`[UserSchedule] addScheduleEntry FAILED  ${date}`, err);
    throw err;
  }
}

/**
 * Remove a single entry by `entryId` on a date.
 *
 * Zombie-loop protection: if no entries remain after the removal,
 * instead of physically deleting the Firestore document (which would let
 * `hydrateFromTemplate` immediately re-populate it from the recurring
 * template), we write a rest-override tombstone entry (`override: true`).
 * `hydrateFromTemplate` skips any date that already carries such a tombstone,
 * so the user-initiated deletion persists correctly in the UI.
 */
export async function removeScheduleEntry(
  _userId: string,
  date: string,
  entryId: string,
): Promise<void> {
  const uid = await resolveAuthUid();
  if (!uid) return;

  const day = await getScheduleDay(_userId, date);
  if (!day) return;

  const remaining = day.entries.filter((e) => e.entryId !== entryId);
  if (remaining.length === day.entries.length) return; // nothing matched

  const ref = doc(db, COLLECTION, docId(uid, date));
  try {
    if (remaining.length === 0) {
      // Write a tombstone rest-override so hydrateFromTemplate cannot
      // immediately re-create the deleted training entry.
      const nowIso = new Date().toISOString();
      const tombstone: UserScheduleEntry = {
        entryId: genEntryId(),
        userId: uid,
        date,
        type: 'rest',
        source: 'manual',
        completed: false,
        programIds: [],
        override: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      const tombstoneDay: UserScheduleDay = {
        userId: uid,
        date,
        entries: [stripUndefined(tombstone as unknown as Record<string, unknown>) as unknown as UserScheduleEntry],
        updatedAt: serverTimestamp(),
      };
      await setDoc(ref, tombstoneDay, { merge: false });
      console.log(
        `[UserSchedule] ENTRY REMOVED (rest-override tombstone written)  ${date}  entryId=${entryId}`,
      );
      return;
    }
    const cleanEntries = remaining.map(
      (e) => stripUndefined(e as unknown as Record<string, unknown>) as unknown as UserScheduleEntry,
    );
    await setDoc(
      ref,
      { userId: uid, date, entries: cleanEntries, updatedAt: serverTimestamp() } satisfies UserScheduleDay,
      { merge: false },
    );
    console.log(`[UserSchedule] ENTRY REMOVED  ${date}  entryId=${entryId}  remaining=${remaining.length}`);
  } catch (err) {
    console.error(`[UserSchedule] removeScheduleEntry FAILED  ${date}`, err);
    throw err;
  }
}

/**
 * Remove every entry on a date that is `source === 'community' && groupId === groupId`.
 * Personal entries on the same day are never touched. Called from the
 * community-schedule sync when a user leaves a group.
 *
 * If no entries remain after filtering, the day document is deleted entirely.
 */
export async function removeCommunityEntriesForGroup(
  _userId: string,
  date: string,
  groupId: string,
): Promise<void> {
  const uid = await resolveAuthUid();
  if (!uid) return;

  const day = await getScheduleDay(_userId, date);
  if (!day) return;

  const remaining = day.entries.filter(
    (e) => !(e.source === 'community' && e.groupId === groupId),
  );
  if (remaining.length === day.entries.length) return; // no community entries for this group

  const ref = doc(db, COLLECTION, docId(uid, date));
  try {
    if (remaining.length === 0) {
      await deleteDoc(ref);
      console.log(`[UserSchedule] COMMUNITY ENTRIES REMOVED (doc deleted)  ${date}  groupId=${groupId}`);
      return;
    }
    const cleanEntries = remaining.map(
      (e) => stripUndefined(e as unknown as Record<string, unknown>) as unknown as UserScheduleEntry,
    );
    await setDoc(
      ref,
      { userId: uid, date, entries: cleanEntries, updatedAt: serverTimestamp() } satisfies UserScheduleDay,
      { merge: false },
    );
    console.log(`[UserSchedule] COMMUNITY ENTRIES REMOVED  ${date}  groupId=${groupId}  remaining=${remaining.length}`);
  } catch (err) {
    console.error(`[UserSchedule] removeCommunityEntriesForGroup FAILED  ${date}`, err);
    throw err;
  }
}
