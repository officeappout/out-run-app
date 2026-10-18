/**
 * exercise-stats — PURE counter reducers for the admin "exercises swapped the
 * most" view (soft-adaptation Phase 0, 18.10.2026). Zero imports, so the
 * root vitest config runs the tests too.
 *
 *   exercise_stats/{exerciseId}   (admin read only, server write only)
 *     name, lastLevel, domain                        — latest seen labels
 *     prescribedCompleted   — finished as prescribed (≥1 logged set, not a swap-in)
 *     completedAsReplacement— finished after being swapped IN
 *     swappedAway           — user swapped it OUT (userInitiated)
 *     systemSwappedAway     — a bulk location swap replaced it (not a judgement)
 *     swappedTo / systemSwappedTo — chosen as a replacement
 *     byDirection.{lower|same|higher}, byTab.{adaptation|alternative},
 *     bySource.{…}, byLocation.{…}, byReason.{…},
 *     topReplacements.{toId} (+ replacementNames.{toId})
 *
 * NO uid ever lands in exercise_stats — counts only.
 *
 * 'pain' swaps: counted in swappedAway + byReason.pain + bySource/byLocation,
 * but deliberately NOT in byDirection / byTab / topReplacements — those are
 * the difficulty/preference signals a later adaptation phase may read, and
 * pain must never feed adaptation.
 */

export type Increments = Record<string, number>;
export type Labels = Record<string, string | number>;

export interface StatsUpdate {
  /** exercise_stats doc id */
  exerciseId: string;
  /** dotted counter path → +n */
  increments: Increments;
  /** plain fields to set (latest wins) */
  labels: Labels;
}

const DIRECTIONS = ['lower', 'same', 'higher'];
const TABS = ['adaptation', 'alternative'];
const REASONS = ['too_hard', 'too_easy', 'no_equipment', 'dislike', 'pain'];

/** Map keys must be safe Firestore field-path segments. */
export function safeKey(raw: unknown, max = 64): string | null {
  if (typeof raw !== 'string') return null;
  const k = raw.trim().replace(/[^A-Za-z0-9_-]/g, '_').slice(0, max);
  return k.length > 0 && !/^_+$/.test(k) ? k : null;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** One exercise_swaps doc → the counter updates for its from/to exercises. */
export function swapToStatsUpdates(swap: Record<string, unknown>): StatsUpdate[] {
  const fromId = safeKey(swap.fromExerciseId, 128);
  const toId = safeKey(swap.toExerciseId, 128);
  if (!fromId || !toId || fromId === toId) return [];

  const userInitiated = swap.userInitiated === true;
  const reason = typeof swap.reason === 'string' && REASONS.includes(swap.reason) ? swap.reason : undefined;
  const isPain = reason === 'pain';

  const from: StatsUpdate = { exerciseId: fromId, increments: {}, labels: {} };
  const to: StatsUpdate = { exerciseId: toId, increments: {}, labels: {} };
  const inc = (u: StatsUpdate, path: string) => {
    u.increments[path] = (u.increments[path] ?? 0) + 1;
  };

  const fromName = str(swap.fromName);
  const toName = str(swap.toName);
  const domain = str(swap.domain);
  const fromLevel = num(swap.fromLevel);
  const toLevel = num(swap.toLevel);
  if (fromName) from.labels.name = fromName;
  if (toName) to.labels.name = toName;
  if (domain) {
    from.labels.domain = domain;
    to.labels.domain = domain;
  }
  if (fromLevel !== undefined) from.labels.lastLevel = fromLevel;
  if (toLevel !== undefined) to.labels.lastLevel = toLevel;

  const source = safeKey(swap.source, 40);
  const location = safeKey(swap.location, 40);
  if (source) inc(from, `bySource.${source}`);

  if (!userInitiated) {
    inc(from, 'systemSwappedAway');
    inc(to, 'systemSwappedTo');
    return [from, to];
  }

  inc(from, 'swappedAway');
  inc(to, 'swappedTo');
  if (location) inc(from, `byLocation.${location}`);
  if (reason) inc(from, `byReason.${reason}`);
  if (!isPain) {
    const direction = typeof swap.direction === 'string' && DIRECTIONS.includes(swap.direction) ? swap.direction : undefined;
    const tab = typeof swap.tab === 'string' && TABS.includes(swap.tab) ? swap.tab : undefined;
    if (direction) inc(from, `byDirection.${direction}`);
    if (tab) inc(from, `byTab.${tab}`);
    inc(from, `topReplacements.${toId}`);
    if (toName) from.labels[`replacementNames.${toId}`] = toName;
  }
  return [from, to];
}

/**
 * One workouts doc → +1 per exercise finished in it (≥1 logged set), split by
 * whether it was the prescribed exercise or a swap-in. Reads only the
 * strength segments' `actual.exerciseLog` (storage.service SegmentExerciseDetail).
 */
export function workoutToStatsUpdates(workout: Record<string, unknown>): StatsUpdate[] {
  const segments = Array.isArray(workout.segments) ? workout.segments : [];
  const byId = new Map<string, StatsUpdate>();
  for (const seg of segments as Array<Record<string, unknown>>) {
    if (!seg || seg.kind !== 'strength') continue;
    const actual = seg.actual as Record<string, unknown> | undefined;
    const log = Array.isArray(actual?.exerciseLog) ? (actual!.exerciseLog as Array<Record<string, unknown>>) : [];
    for (const d of log) {
      const id = safeKey(d?.exerciseId, 128);
      const sets = Array.isArray(d?.confirmedReps) ? d.confirmedReps.length : 0;
      if (!id || sets === 0) continue;
      let u = byId.get(id);
      if (!u) {
        u = { exerciseId: id, increments: {}, labels: {} };
        byId.set(id, u);
      }
      // One workout counts an exercise once, even if logged in two segments.
      const key = d.wasSwapped === true ? 'completedAsReplacement' : 'prescribedCompleted';
      if (!u.increments.prescribedCompleted && !u.increments.completedAsReplacement) {
        u.increments[key] = 1;
      }
      const name = str(d.exerciseName);
      if (name) u.labels.name = name;
      const level = num(d.exerciseLevel);
      if (level !== undefined) u.labels.lastLevel = level;
      const domain = str(d.domain);
      if (domain) u.labels.domain = domain;
    }
  }
  return Array.from(byId.values());
}

/** Merge several updates for the same exercise (a swap's from == another's to never happens, but be safe). */
export function mergeUpdates(updates: StatsUpdate[]): StatsUpdate[] {
  const out = new Map<string, StatsUpdate>();
  for (const u of updates) {
    const cur = out.get(u.exerciseId) ?? { exerciseId: u.exerciseId, increments: {}, labels: {} };
    for (const [k, v] of Object.entries(u.increments)) cur.increments[k] = (cur.increments[k] ?? 0) + v;
    Object.assign(cur.labels, u.labels);
    out.set(u.exerciseId, cur);
  }
  return Array.from(out.values());
}

/**
 * Dotted paths → nested object, with `leaf` applied to every counter value
 * (the trigger passes FieldValue.increment). set(..., {merge:true}) needs the
 * nested form — a dotted key there would create a literal "a.b" field.
 */
export function toNestedPatch<T>(
  increments: Increments,
  labels: Labels,
  leaf: (n: number) => T,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const put = (path: string, value: unknown) => {
    const parts = path.split('.');
    let cur = out;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (typeof cur[p] !== 'object' || cur[p] === null) cur[p] = {};
      cur = cur[p] as Record<string, unknown>;
    }
    cur[parts[parts.length - 1]] = value;
  };
  for (const [k, v] of Object.entries(labels)) put(k, v);
  for (const [k, n] of Object.entries(increments)) put(k, leaf(n));
  return out;
}
