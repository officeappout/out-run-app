/**
 * gen-perf.ts — Home-workout generation performance instrumentation (#0)
 * + a shared verbose-logging gate (#6).
 *
 * WHY THIS LIVES IN src/lib:
 *   It is imported from three domains (content, workout-engine, user), so per
 *   axiom §7 (domain-agnostic — no cross-feature imports) it must be a shared
 *   utility, not a workout-engine-local one. It has ZERO imports itself, so no
 *   dependency cycles are possible.
 *
 * ZERO LOGIC IMPACT:
 *   Every export is a no-op unless the matching debug toggle is on. Timing marks
 *   and per-collection read counters are recorded on a single-flight timeline
 *   (the home screen generates exactly one trio at a time — StatsOverview guards
 *   re-entry with `didGenerate`), then printed as one compact table by end().
 *   It records elapsed time and read counts; it never changes what is fetched or
 *   computed.
 *
 * ── Toggles (env default + device-friendly runtime override) ─────────────────
 *   GEN_TIMING  — phase timing + read counters.
 *                 Default TRUE on this instrumentation branch so an on-device
 *                 build measures with no manual toggle. Flip GEN_TIMING_DEFAULT
 *                 to false before this ships to production.
 *   GEN_VERBOSE — the always-on heavy RAW / protocol-scan / metadata logs (#6).
 *                 Default FALSE (the #6 perf win + a clean timing signal).
 *
 *   Runtime override wins over the env default (read at call time for the log
 *   gates; read at module load for DEBUG_METADATA_RESOLUTION):
 *     localStorage['OUT_GEN_TIMING' | 'OUT_GEN_VERBOSE'] = '1' | '0'
 *     window.__OUT_PERF__ = { timing?: boolean, verbose?: boolean }
 *
 * ── How David measures ───────────────────────────────────────────────────────
 *   Default cold/warm run: timing ON, heavy logs OFF (already reflects #6).
 *   To also measure the current-prod baseline WITH the heavy logs, set
 *   `localStorage.setItem('OUT_GEN_VERBOSE','1')` and cold-reload; the delta vs
 *   the default run is exactly what gating the logs (#6) buys.
 */

const GEN_TIMING_DEFAULT = true; // instrumentation branch: measure by default
const GEN_VERBOSE_DEFAULT = false; // #6: heavy logs off by default

/** Runtime override lookup. Returns undefined when no override is set. */
function readOverride(lsKey: string, globalKey: 'timing' | 'verbose'): boolean | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const ls = window.localStorage?.getItem(lsKey);
    if (ls === '1' || ls === 'true') return true;
    if (ls === '0' || ls === 'false') return false;
  } catch {
    /* localStorage can throw in private mode — ignore */
  }
  const g = (window as unknown as { __OUT_PERF__?: Record<string, unknown> }).__OUT_PERF__;
  if (g && typeof g[globalKey] === 'boolean') return g[globalKey] as boolean;
  return undefined;
}

export function isGenTimingEnabled(): boolean {
  return readOverride('OUT_GEN_TIMING', 'timing') ?? GEN_TIMING_DEFAULT;
}

export function isGenVerboseEnabled(): boolean {
  return readOverride('OUT_GEN_VERBOSE', 'verbose') ?? GEN_VERBOSE_DEFAULT;
}

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : 0;
}

interface Timeline {
  session: string;
  t0: number;
  last: number;
  marks: Array<{ label: string; ms: number }>;
  reads: Record<string, number>;
}

// Single-flight: only one home trio is generated at a time (StatsOverview guard).
let active: Timeline | null = null;

/** Start a new timeline. No-op unless timing is enabled. */
export function genPerfBegin(session: string): void {
  if (!isGenTimingEnabled()) {
    active = null;
    return;
  }
  const t = now();
  active = { session, t0: t, last: t, marks: [], reads: {} };
}

/** Record wall-time since the previous mark under `label`. No-op if inactive. */
export function genPerfMark(label: string): void {
  if (!active) return;
  const t = now();
  active.marks.push({ label, ms: t - active.last });
  active.last = t;
}

/** Count `n` Firestore reads under `label` (e.g. 'programLevelSettings'). */
export function genPerfRead(label: string, n = 1): void {
  if (!active) return;
  active.reads[label] = (active.reads[label] ?? 0) + n;
}

/** Print the timeline table and clear it. No-op if inactive. */
export function genPerfEnd(): void {
  if (!active) return;
  const t = active;
  active = null;
  const total = now() - t.t0;

  const phaseLines = t.marks.map(
    (m) => `  ${m.ms.toFixed(0).padStart(7)}ms   ${m.label}`,
  );
  const readEntries = Object.entries(t.reads).sort((a, b) => b[1] - a[1]);
  const totalReads = readEntries.reduce((s, [, n]) => s + n, 0);
  const readLines = readEntries.map(([k, n]) => `  ${String(n).padStart(4)}   ${k}`);

  console.log(
    `\n⏱️ [GenPerf] ${t.session} — total ${total.toFixed(0)}ms · ${totalReads} Firestore reads\n` +
      `PHASES (ms since previous mark):\n${phaseLines.join('\n')}\n` +
      (readLines.length
        ? `READS (getDoc/getDocs by collection):\n${readLines.join('\n')}`
        : 'READS: (none counted)'),
  );
}
