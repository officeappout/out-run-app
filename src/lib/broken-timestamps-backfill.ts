/**
 * broken-timestamps-backfill — the PURE mapping behind
 * scripts/backfill-broken-timestamps.ts (no firebase import; every time is
 * epoch ms). Unit tested in src/lib/__tests__/broken-timestamps-backfill.test.ts.
 *
 * A "broken" timestamp field holds what a sanitizer made of a Firestore value
 * (src/lib/firestore-sanitize.ts):
 *   - { _methodName: 'serverTimestamp' }  serverTimestamp() copied → the time is LOST
 *   - {}                                   a Date copied → the time is LOST
 *   - { seconds, nanoseconds }             a Timestamp copied → LOSSLESS, convertible
 * A real Timestamp is never touched.
 */

import { isPlainObject, isSerializedSentinel } from './firestore-sanitize';

export const MIN_PLAUSIBLE_MS = Date.UTC(2024, 0, 1);

/** Sentinel map or empty map — the original time is unrecoverable from the value itself. */
export function isLostTimestamp(v: unknown): boolean {
  return isSerializedSentinel(v) || (isPlainObject(v) && Object.keys(v).length === 0);
}

/** `{ seconds, nanoseconds }` plain-map copy of a Timestamp → ms (lossless), else null. */
export function tsCopyMillis(v: unknown): number | null {
  if (!isPlainObject(v)) return null;
  const keys = Object.keys(v);
  if (keys.length !== 2 || typeof v.seconds !== 'number' || typeof v.nanoseconds !== 'number') return null;
  return v.seconds * 1000 + Math.floor(v.nanoseconds / 1e6);
}

/** Evidence value → ms: Timestamp-like (toMillis), Date, epoch ms, ISO string, 'YYYY-MM-DD'. Never a broken map. */
export function evidenceMillis(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  let ms: number | null = null;
  if (v instanceof Date) ms = v.getTime();
  else if (typeof v === 'number') ms = v;
  else if (typeof v === 'string') ms = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00Z` : v);
  else if (typeof v === 'object' && typeof (v as { toMillis?: unknown }).toMillis === 'function') {
    ms = (v as { toMillis: () => number }).toMillis();
  }
  return ms !== null && Number.isFinite(ms) ? ms : null;
}

function plausible(ms: number | null | undefined, nowMs: number): ms is number {
  return typeof ms === 'number' && Number.isFinite(ms) && ms >= MIN_PLAUSIBLE_MS && ms <= nowMs;
}

function latest(cands: Array<[number | null | undefined, string]>, nowMs: number): { ms: number; source: string } | null {
  let best: { ms: number; source: string } | null = null;
  for (const [ms, source] of cands) if (plausible(ms, nowMs) && (!best || ms > best.ms)) best = { ms, source };
  return best;
}

/** Everything the script knows about one user, gathered read-only. */
export interface UserEvidence {
  data: Record<string, any>;
  nowMs: number;
  /** Snapshot metadata — exact. */
  createTimeMs: number;
  updateTimeMs: number;
  /** Latest workouts.date for the uid. */
  latestWorkoutMs?: number | null;
  /** Firebase Auth metadata: lastRefreshTime ?? lastSignInTime (an app open). */
  authLastActiveMs?: number | null;
  /** Latest analytics_events.timestamp for the uid. */
  latestAnalyticsEventMs?: number | null;
  /** Earliest analytics_events 'onboarding_completed' timestamp for the uid. */
  onboardingCompletedEventMs?: number | null;
}

export interface FieldRepair {
  /** Field path segments (map keys, never array indices). */
  path: string[];
  ms: number;
  source: string;
}

export interface UserRepairPlan {
  sets: FieldRepair[];
  /** Extra boolean markers, e.g. onboardingCompletedAtEstimated. */
  flags: Record<string, true>;
  /** Broken fields with no rule and no evidence — deleted so readers see "missing", not garbage. */
  deletes: string[][];
  /** { seconds, nanoseconds } copies found (converted only with includeTsCopies, never under core.* or inside arrays). */
  tsCopies: FieldRepair[];
  /** Broken values inside arrays — can't be addressed by a field path; reported only. */
  inArrays: string[];
}

/** Fields with a dedicated evidence rule (all top-level on users/{uid} except capturedAt). */
export const USER_RULE_FIELDS = [
  'createdAt',
  'updatedAt',
  'lastActive',
  'onboardingCompletedAt',
  'marketingAttribution.capturedAt',
  'termsAcceptedAt',
] as const;

function getPath(data: Record<string, any>, path: string[]): unknown {
  let cur: any = data;
  for (const k of path) {
    if (!isPlainObject(cur)) return undefined;
    cur = cur[k];
  }
  return cur;
}

/** Walks every map (not arrays' contents) collecting broken leaves. */
function walkBroken(
  v: unknown,
  path: string[],
  onLost: (p: string[]) => void,
  onCopy: (p: string[], ms: number) => void,
  onArray: (p: string) => void,
  inArray = false,
): void {
  if (Array.isArray(v)) {
    v.forEach((x, i) => walkBroken(x, [...path, `[${i}]`], onLost, onCopy, onArray, true));
    return;
  }
  if (path.length && isLostTimestamp(v) && (isSerializedSentinel(v) || /(At|Date|Time|lastActive)$/.test(path[path.length - 1]))) {
    if (inArray) onArray(path.join('.'));
    else onLost(path);
    return;
  }
  const copy = path.length ? tsCopyMillis(v) : null;
  if (copy !== null) {
    if (inArray) onArray(path.join('.'));
    else onCopy(path, copy);
    return;
  }
  if (!isPlainObject(v)) return;
  for (const k of Object.keys(v)) walkBroken(v[k], [...path, k], onLost, onCopy, onArray, inArray);
}

export function planUserRepairs(e: UserEvidence, opts: { includeTsCopies?: boolean } = {}): UserRepairPlan {
  const { data, nowMs } = e;
  const plan: UserRepairPlan = { sets: [], flags: {}, deletes: [], tsCopies: [], inArrays: [] };

  const lost: string[][] = [];
  walkBroken(
    data,
    [],
    (p) => lost.push(p),
    (p, ms) => plan.tsCopies.push({ path: p, ms, source: 'lossless {seconds,nanoseconds}' }),
    (p) => plan.inArrays.push(p),
  );
  const isLost = (dotted: string) => lost.some((p) => p.join('.') === dotted);

  const createdValid = evidenceMillis(data.createdAt);
  const resolvedCreated = plausible(createdValid, nowMs) ? createdValid : e.createTimeMs;
  const updatedValid = evidenceMillis(data.updatedAt);

  if (isLost('createdAt')) plan.sets.push({ path: ['createdAt'], ms: e.createTimeMs, source: 'doc.createTime' });
  if (isLost('updatedAt')) plan.sets.push({ path: ['updatedAt'], ms: e.updateTimeMs, source: 'doc.updateTime' });

  if (isLost('lastActive')) {
    const fcm = isPlainObject(data.fcmTokenMeta)
      ? Object.values(data.fcmTokenMeta).map((m: any) => evidenceMillis(m?.lastSeenAt))
      : [];
    const best = latest(
      [
        [e.latestWorkoutMs, 'workouts.date'],
        [evidenceMillis(data.progression?.lastActiveDate), 'progression.lastActiveDate'],
        [evidenceMillis(data.running?.lastWorkoutDate), 'running.lastWorkoutDate'],
        ...fcm.map((ms) => [ms, 'fcmTokenMeta.lastSeenAt'] as [number | null, string]),
        [updatedValid, 'updatedAt'],
        [e.authLastActiveMs, 'auth.lastRefreshTime'],
        [e.latestAnalyticsEventMs, 'analytics_events'],
        [resolvedCreated, 'createdAt'],
      ],
      nowMs,
    );
    plan.sets.push({ path: ['lastActive'], ms: best?.ms ?? e.createTimeMs, source: best?.source ?? 'doc.createTime' });
  }

  // Completion time: the first 'onboarding_completed' analytics event, if
  // plausible (not before the account existed, minus a day of clock skew);
  // else the creation time, marked estimated.
  let completion: { ms: number; source: string; estimated: boolean } | null = null;
  const evMs = e.onboardingCompletedEventMs;
  if (plausible(evMs, nowMs) && evMs >= resolvedCreated - 86_400_000) {
    completion = { ms: evMs, source: 'analytics_events.onboarding_completed', estimated: false };
  }
  const completionOrCreated = completion ?? { ms: resolvedCreated, source: 'createdAt', estimated: true };

  if (isLost('onboardingCompletedAt')) {
    plan.sets.push({ path: ['onboardingCompletedAt'], ms: completionOrCreated.ms, source: completionOrCreated.source });
    if (completionOrCreated.estimated) plan.flags.onboardingCompletedAtEstimated = true;
  }

  if (isLost('marketingAttribution.capturedAt')) {
    const fs = data.marketingAttribution?.firstSeenAt;
    if (plausible(fs, nowMs)) {
      plan.sets.push({ path: ['marketingAttribution', 'capturedAt'], ms: fs, source: 'marketingAttribution.firstSeenAt' });
    } else {
      plan.sets.push({ path: ['marketingAttribution', 'capturedAt'], ms: resolvedCreated, source: 'createdAt' });
    }
  }

  if (isLost('termsAcceptedAt')) {
    // Accepted during onboarding — never later than completion. Always an estimate.
    plan.sets.push({ path: ['termsAcceptedAt'], ms: completionOrCreated.ms, source: completionOrCreated.source });
    plan.flags.termsAcceptedAtEstimated = true;
  }

  // Any other lost field: no evidence rule → delete (reads as missing, not garbage).
  const ruled = new Set<string>(USER_RULE_FIELDS);
  for (const p of lost) if (!ruled.has(p.join('.'))) plan.deletes.push(p);

  if (!opts.includeTsCopies) return plan;
  // core.* is excluded: core.birthDate is compared by noLockedCoreFieldsChanged,
  // and a still-cached older client might echo the map back.
  plan.sets.push(...plan.tsCopies.filter((r) => r.path[0] !== 'core'));
  return plan;
}

/** Generic rules for the other collections the prod scan found (19.10.2026). */
export function planGenericRepairs(
  data: Record<string, any>,
  meta: { createTimeMs: number; updateTimeMs: number; nowMs: number },
  rules: Record<string, 'createTime' | 'updateTime' | 'createdAtOrCreateTime'>,
): { sets: FieldRepair[]; deletes: string[][]; tsCopies: FieldRepair[]; inArrays: string[] } {
  const lost: string[][] = [];
  const tsCopies: FieldRepair[] = [];
  const inArrays: string[] = [];
  walkBroken(data, [], (p) => lost.push(p), (p, ms) => tsCopies.push({ path: p, ms, source: 'lossless {seconds,nanoseconds}' }), (p) => inArrays.push(p));
  const sets: FieldRepair[] = [];
  const deletes: string[][] = [];
  const createdValid = evidenceMillis(data.createdAt);
  for (const p of lost) {
    const rule = rules[p.join('.')];
    if (rule === 'createTime') sets.push({ path: p, ms: meta.createTimeMs, source: 'doc.createTime' });
    else if (rule === 'updateTime') sets.push({ path: p, ms: meta.updateTimeMs, source: 'doc.updateTime' });
    else if (rule === 'createdAtOrCreateTime') {
      sets.push(
        plausible(createdValid, meta.nowMs)
          ? { path: p, ms: createdValid, source: 'createdAt' }
          : { path: p, ms: meta.createTimeMs, source: 'doc.createTime' },
      );
    } else deletes.push(p);
  }
  return { sets: [...sets, ...tsCopies], deletes, tsCopies, inArrays };
}
