/**
 * Training reminder — timing rules + server-side materialisation of today's
 * planned sessions from the recurring template (push-lifecycle audit, gaps 2
 * and 4; owner-approved 21.10.2026).
 *
 * Gap 2 — the reminder skipped the sessions it was meant for. Template
 * sessions get startTime = the user's reminder hour (or 07:00), and the
 * reminder runs at that same hour (:00). The old "already passed" check was
 * `startTime <= now`, so a 07:00 session at the 07:00 run was skipped (and
 * 19:00 at 19:00). Now a session counts as passed only when it started
 * BEFORE the start of this run's hour: `sessionNotYetStarted`.
 *
 * Gap 4 — a userSchedule day doc only exists once the app has shown that
 * day, so a user who didn't open the app (exactly who the reminder is for)
 * got nothing. `collectTemplateCandidates` finds this run's users (by their
 * reminder hour) that have no training entry for today and computes today's
 * sessions from lifestyle.recurringTemplate with the SAME rules the client
 * hydrate uses (shared/recurring-day.core.ts). Nothing is written.
 *
 * Reads, per hourly run: one range query on users by
 * lifestyle.reminders.runningTime (single-field index, automatic), bounded by
 * pages; at the default hour (07:00) also one bounded scan of COMPLETED users
 * for those with no reminder time set. Kill switch:
 * app_config/feature_flags.trainingReminderFromTemplate === false.
 */
import type * as admin from 'firebase-admin';
import { templateSessionsToMaterialize, type RecurringExistingEntry } from '../shared/recurring-day.core';
import { forEachQueryPage } from './paginate';
import { isDemoUid } from './demo';

/**
 * The HOUR of a 'H:MM' / 'HH:MM' preference, or null when absent/malformed
 * (so "no preference" is never confused with hour 0).
 */
export function parsePreferredHour(runningTime: unknown): number | null {
  if (typeof runningTime !== 'string') return null;
  const match = runningTime.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hh = Number(match[1]);
  if (!Number.isFinite(hh) || hh < 0 || hh > 23) return null;
  return hh;
}

/**
 * True when a session starting at `startTime` has not started yet at the
 * run for `runHour` (or has no usable startTime). Measured from the START of
 * the run's hour, not the wall clock: the run fires at HH:00 (+ seconds or
 * minutes of scheduler delay) and its sessions typically start at HH:00.
 */
export function sessionNotYetStarted(startTime: string | undefined | null, runHour: number): boolean {
  if (!startTime) return true;
  const [hh, mm] = startTime.split(':').map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return true;
  return hh * 60 + mm >= runHour * 60;
}

export interface TemplateCandidate {
  uid: string;
  /** shared category ids of today's first session ('strength' | 'cardio'). */
  categories: string[];
  startTime: string;
  /** The users/{uid} doc already read (the scheduler reuses it, no second read). */
  userData: Record<string, unknown>;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null;
}

/**
 * Today's first template session for one user, or null (nothing planned,
 * rest day, blocked by the user's own edit of the day, or already started
 * before this run's hour). Pure; exported for tests.
 */
export function templateCandidateFromUser(
  uid: string,
  userData: Record<string, unknown> | undefined,
  dateKey: string,
  runHour: number,
  existingEntries: ReadonlyArray<RecurringExistingEntry> | null,
): TemplateCandidate | null {
  if (!userData || isDemoUid(uid)) return null;
  const lifestyle = userData.lifestyle as
    | { recurringTemplate?: Record<string, string[]>; reminders?: { runningTime?: string; strengthTime?: string } }
    | undefined;
  const template = lifestyle?.recurringTemplate;
  if (!template || typeof template !== 'object') return null;
  const running = userData.running as { activeProgram?: { programId?: unknown } } | undefined;
  const sessions = templateSessionsToMaterialize(
    template,
    dateKey,
    existingEntries,
    { runningTime: str(lifestyle?.reminders?.runningTime), strengthTime: str(lifestyle?.reminders?.strengthTime) },
    str(running?.activeProgram?.programId),
  );
  const first = sessions.find((s) => sessionNotYetStarted(s.startTime, runHour));
  if (!first) return null;
  return { uid, categories: [first.category], startTime: first.startTime, userData };
}

/** 'HH:' (and 'H:' below 10) — the runningTime prefixes that fall in `hour`. */
export function runningTimePrefixes(hour: number): string[] {
  const two = `${String(hour).padStart(2, '0')}:`;
  return hour < 10 ? [two, `${hour}:`] : [two];
}

export interface CollectTemplateOpts {
  dateKey: string;
  runHour: number;
  /** The hour users without a reminder time are reminded at (7). */
  defaultHour: number;
  pageSize: number;
  maxPages: number;
  /** uid → today's day-doc entries, for every day doc already read this run. */
  dayEntriesByUid: Map<string, ReadonlyArray<RecurringExistingEntry>>;
  /** uids that already have a reminder candidate from their day doc. */
  skipUids: Set<string>;
}

/**
 * This run's users with no planned entry in a day doc, whose recurring
 * template plans a session today. Bounded reads (see the header). A failing
 * page throws only when nothing was collected yet.
 */
export async function collectTemplateCandidates(
  db: admin.firestore.Firestore,
  o: CollectTemplateOpts,
): Promise<{ candidates: TemplateCandidate[]; usersRead: number }> {
  const out: TemplateCandidate[] = [];
  const seen = new Set<string>();
  let usersRead = 0;

  const consider = (doc: admin.firestore.QueryDocumentSnapshot, requireNoPreference: boolean) => {
    usersRead++;
    const uid = doc.id;
    if (seen.has(uid) || o.skipUids.has(uid)) return;
    seen.add(uid);
    const data = doc.data() as Record<string, unknown>;
    if (requireNoPreference) {
      const rt = (data.lifestyle as { reminders?: { runningTime?: unknown } } | undefined)?.reminders?.runningTime;
      if (parsePreferredHour(rt) !== null) return; // reminded at their own hour
    }
    const c = templateCandidateFromUser(uid, data, o.dateKey, o.runHour, o.dayEntriesByUid.get(uid) ?? null);
    if (c) out.push(c);
  };

  const field = 'lifestyle.reminders.runningTime';
  for (const prefix of runningTimePrefixes(o.runHour)) {
    await forEachQueryPage(
      db.collection('users').where(field, '>=', prefix).where(field, '<=', `${prefix}\uf8ff`),
      { pageSize: o.pageSize, maxPages: o.maxPages },
      (docs: admin.firestore.QueryDocumentSnapshot[]) => docs.forEach((d) => consider(d, false)),
    );
  }

  if (o.runHour === o.defaultHour) {
    await forEachQueryPage(
      db.collection('users').where('onboardingStatus', '==', 'COMPLETED'),
      { pageSize: o.pageSize, maxPages: o.maxPages },
      (docs: admin.firestore.QueryDocumentSnapshot[]) => docs.forEach((d) => consider(d, true)),
    );
  }

  return { candidates: out, usersRead };
}
