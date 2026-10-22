/**
 * Per-date run moves (enable_week_builder_v1, owner 22.10) — `users/{uid}.running.runMoves`.
 *
 * The running plan only knows WEEKDAYS (running.scheduleDays + the plan week), so a run could
 * not move for one week. This OPTIONAL, additive field lets one run move to another day of the
 * SAME Sunday-week, for that week only:
 *
 *   running.runMoves?: Array<{ from: 'YYYY-MM-DD'; to: 'YYYY-MM-DD' }>
 *
 *   - from / to are local calendar days of the same Sunday-first week (else ignored);
 *   - moves apply in order, each one SWAPS the two days' runs (a move onto a day that has a
 *     run brings that run back to `from`), so later moves compose with earlier ones;
 *   - written only by the planner week builder under the flag; a week that has ended is pruned
 *     on the next write (mergeRunMoves), so the field stays small and self-expiring;
 *   - readers pass it in the run placement (runPlacementOf → resolveRunningDayState,
 *     materializePlanned with runsByType); missing / empty = exactly today's behaviour.
 *
 * Pure: date keys only, no clock.
 */

export interface RunDateMove {
  from: string;
  to: string;
}

/** Hard cap on stored moves (a week has 7 days; a few weeks of history at most). */
export const RUN_MOVES_MAX = 14;

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

const dowOfKey = (key: string): number => new Date(`${key}T12:00:00Z`).getUTCDay();
const addDays = (key: string, n: number): string => new Date(Date.parse(`${key}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** The Sunday ('YYYY-MM-DD') of the week holding `key`. */
export const sundayKeyOf = (key: string): string => addDays(key, -dowOfKey(key));

/** A local Date → 'YYYY-MM-DD' (device-local calendar day). */
export const localKeyOf = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** 'YYYY-MM-DD' → local midnight Date. */
export const localDateOfKey = (key: string): Date => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const cache = new WeakMap<object, RunDateMove[]>();

/** The stored value, validated (bad / cross-week / no-op items dropped). Stable per input array. */
export function normalizeRunMoves(raw: unknown): RunDateMove[] {
  if (!Array.isArray(raw)) return [];
  const hit = cache.get(raw);
  if (hit) return hit;
  const out: RunDateMove[] = [];
  for (const m of raw) {
    const from = (m as RunDateMove | null)?.from;
    const to = (m as RunDateMove | null)?.to;
    if (typeof from !== 'string' || typeof to !== 'string' || !KEY_RE.test(from) || !KEY_RE.test(to)) continue;
    if (from === to || sundayKeyOf(from) !== sundayKeyOf(to)) continue;
    out.push({ from, to });
  }
  cache.set(raw, out);
  return out;
}

/** The date whose planned run now sits on `key` after the moves of its week (identity when none). */
export function runSourceDate(key: string, moves: readonly RunDateMove[] | null | undefined): string {
  if (!moves?.length) return key;
  const sunday = sundayKeyOf(key);
  const src = new Map<string, string>();
  const at = (k: string) => src.get(k) ?? k;
  for (const m of moves) {
    if (sundayKeyOf(m.from) !== sunday) continue;
    const a = at(m.from);
    const b = at(m.to);
    src.set(m.to, a);
    src.set(m.from, b);
  }
  return at(key);
}

/** True when any move touches the week holding `key`. */
export const weekHasRunMoves = (key: string, moves: readonly RunDateMove[] | null | undefined): boolean =>
  !!moves?.some((m) => sundayKeyOf(m.from) === sundayKeyOf(key));

/** A weekday map (0 = Sunday) of ONE plan week, re-laid for the week starting `sunday`. */
export function applyRunMovesToDowMap<E>(map: ReadonlyMap<number, E>, sunday: string, moves: readonly RunDateMove[] | null | undefined): Map<number, E> {
  if (!weekHasRunMoves(sunday, moves)) return new Map(map);
  const out = new Map<number, E>();
  for (let dow = 0; dow < 7; dow++) {
    const src = runSourceDate(addDays(sunday, dow), moves);
    const e = map.get(dowOfKey(src));
    if (e !== undefined) out.set(dow, e);
  }
  return out;
}

/**
 * The stored list after a save: weeks that ended before `todayKey`'s week are dropped, the new
 * moves are appended (in order), and the list is capped (oldest dropped first).
 */
export function mergeRunMoves(existing: unknown, next: readonly RunDateMove[], todayKey: string): RunDateMove[] {
  const thisSunday = sundayKeyOf(todayKey);
  const kept = normalizeRunMoves(existing).filter((m) => sundayKeyOf(m.from) >= thisSunday);
  const added = normalizeRunMoves([...next]);
  return [...kept, ...added].slice(-RUN_MOVES_MAX);
}

/**
 * The swaps to store for one save of the week builder. `sessionMoves` are the runs the user
 * moved, by the dates they were SHOWN on (after the stored moves) → their new date; a swap in
 * the builder arrives as two moves. Returns the moves that, appended to `existing`, put every
 * run where the builder shows it (a short swap sequence — never undoes itself).
 */
export function planRunMoves(existing: unknown, sessionMoves: readonly RunDateMove[]): RunDateMove[] {
  const valid = normalizeRunMoves([...sessionMoves]);
  if (!valid.length) return [];
  const stored = normalizeRunMoves(existing);
  const sunday = sundayKeyOf(valid[0].from);
  const week = valid.filter((m) => sundayKeyOf(m.from) === sunday);
  const days = Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
  const state = new Map(days.map((k) => [k, runSourceDate(k, stored)]));
  const desired = new Map(state);
  const froms = new Set(week.map((m) => m.from));
  const tos = new Set(week.map((m) => m.to));
  for (const m of week) desired.set(m.to, state.get(m.from)!);
  const freed = days.filter((k) => tos.has(k) && !froms.has(k)).map((k) => state.get(k)!);
  days.filter((k) => froms.has(k) && !tos.has(k)).forEach((k, i) => desired.set(k, freed[i] ?? state.get(k)!));

  const out: RunDateMove[] = [];
  // Targets first, so a stored move reads the way the user moved it (from → to).
  const order = [...days.filter((k) => tos.has(k)), ...days.filter((k) => !tos.has(k))];
  for (const d of order) {
    const want = desired.get(d)!;
    if (state.get(d) === want) continue;
    const e = days.find((k) => k !== d && state.get(k) === want);
    if (!e) continue;
    out.push({ from: e, to: d });
    const a = state.get(e)!;
    state.set(e, state.get(d)!);
    state.set(d, a);
  }
  return out;
}
