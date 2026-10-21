/**
 * "דמו" filter of בקרת אימונים ומסלולים (demo-users-design.md PR 5, owner 21.10.2026).
 *
 * The nightly review skips demo users' sessions (no review doc, no stats — run.server.ts), so
 * the panel never showed them. With the filter the owner reviews them anyway: the demo users'
 * generation_log docs (uid `demo_*` — AI testers and any demo actor that ran a real generator)
 * are read directly and the same invariant rules run on the fly. Read-only: nothing is written,
 * no LLM, no stats. Pure (the route does the one bounded read).
 */
import { runInvariants } from '../invariants';
import { GENERATION_TYPES, type GenerationInput, type GenerationOutput, type GenerationType } from '../types';
import { toFlaggedRow, type FlaggedRow } from './list';

const TYPES = new Set<string>(GENERATION_TYPES);

/** uid range of every demo user (`demo_` prefix) — `>= DEMO_UID_FROM` and `< DEMO_UID_TO`. */
export const DEMO_UID_FROM = 'demo_';
export const DEMO_UID_TO = 'demo`'; // '`' is the code point right after '_'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- stored log, read through field guards
export function demoLogToRow(id: string, log: Record<string, any>): FlaggedRow | null {
  if (typeof log.uid !== 'string' || !log.uid.startsWith(DEMO_UID_FROM)) return null;
  if (!TYPES.has(log.type) || !log.input || !log.output) return null;
  const findings = runInvariants({ type: log.type as GenerationType, input: log.input as GenerationInput, output: log.output as GenerationOutput });
  const row = toFlaggedRow(id, {
    ...log,
    findings,
    ruleIds: Array.from(new Set(findings.map((f) => f.ruleId))),
    maxSeverity: findings.reduce((m, f) => Math.max(m, f.severity), 0),
    status: null,
    llm: null,
  });
  return { ...row, isDemo: true };
}

/** Newest first, inside the window, at most `max`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- stored logs
export function demoRows(docs: Array<{ id: string; data: Record<string, any> }>, sinceMs: number, max = 300): FlaggedRow[] {
  return docs
    .map((d) => demoLogToRow(d.id, d.data))
    .filter((r): r is FlaggedRow => !!r && r.createdAtMs >= sinceMs)
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .slice(0, max);
}
