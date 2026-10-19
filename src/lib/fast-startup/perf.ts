/**
 * Startup timing marks (performance.mark / measure), gated by the same switch as the
 * generator timing table: localStorage OUT_GEN_TIMING='1' (or window.__OUT_PERF__.timing).
 * Off → every call is a no-op. Each mark is measured from navigation start, so on device:
 *   performance.getEntriesByType('measure').filter(m => m.name.startsWith('out:'))
 * and the console prints one line per mark.
 */
import { isGenTimingEnabled } from '@/lib/gen-perf';

export type StartupMark =
  | 'auth-restored'
  | 'users-doc'
  | 'home-mounted'
  | 'trio-cached-shown'
  | 'trio-ready'
  | 'fast-path-redirect';

const seen = new Set<StartupMark>();

/** Record `name` once per JS session (later calls are ignored — first paint is what counts). */
export function startupMark(name: StartupMark): void {
  try {
    if (seen.has(name) || !isGenTimingEnabled()) return;
    if (typeof performance === 'undefined' || typeof performance.mark !== 'function') return;
    seen.add(name);
    const markName = `out:${name}`;
    performance.mark(markName);
    const m = performance.measure(markName, { start: 0, end: markName } as PerformanceMeasureOptions);
    const ms = m && typeof m.duration === 'number' ? m.duration : performance.now();
    console.log(`⏱️ [Startup] ${name} @ ${ms.toFixed(0)}ms`);
  } catch {
    /* timing must never break startup */
  }
}

/** Test-only. */
export function __resetStartupMarksForTests(): void {
  seen.clear();
}
