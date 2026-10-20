/**
 * Demo control center — the AI tester overseer's summary (demo_registry/qa_summary, written by
 * scripts/qa/overseer.ts with the Admin SDK; read by the panel's findings card through the
 * super-admin API). Shared shape + a lenient parser (bad fields → defaults, never throws).
 * Pure, no Firebase import.
 */
export type QaSeverity = 'P0' | 'P1' | 'P2' | 'P3';
export const QA_SEVERITIES: readonly QaSeverity[] = ['P0', 'P1', 'P2', 'P3'];

export interface QaCluster {
  key: string;
  title: string;
  severity: QaSeverity;
  rule: string | null;
  route: string;
  count: number;
  devices: string[];
  personas: string[];
  missions: string[];
  /** Storage path (qa/{runId}/…) of a representative screenshot, or null. */
  screenshot: string | null;
  /** Not seen in the previous summary. */
  isNew: boolean;
}

export interface QaSummary {
  runId: string | null;
  generatedAtMs: number | null;
  findings: number;
  bySeverity: Record<QaSeverity, number>;
  /** Top clusters, worst first (at most QA_SUMMARY_MAX_CLUSTERS). */
  clusters: QaCluster[];
  /** Every cluster key of the run — the next run marks clusters not in it as new. */
  clusterKeys: string[];
  sessions: Array<{ mission: string; outcome: string }>;
}

export const QA_SUMMARY_MAX_CLUSTERS = 10;
export const QA_SUMMARY_MAX_KEYS = 300;

function millisOf(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v instanceof Date) return v.getTime();
  const maybe = v as { toMillis?: () => number } | null;
  return maybe && typeof maybe.toMillis === 'function' ? maybe.toMillis() : null;
}

const strs = (v: unknown, max = 20): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, max) : []);
const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const sev = (v: unknown): QaSeverity => (QA_SEVERITIES.includes(v as QaSeverity) ? (v as QaSeverity) : 'P3');

export function parseQaSummary(raw: Record<string, unknown> | undefined | null): QaSummary {
  const d = raw ?? {};
  const bs = (d.bySeverity && typeof d.bySeverity === 'object' ? d.bySeverity : {}) as Record<string, unknown>;
  const clusters = (Array.isArray(d.clusters) ? d.clusters : []).slice(0, QA_SUMMARY_MAX_CLUSTERS).flatMap((c): QaCluster[] => {
    if (!c || typeof c !== 'object') return [];
    const x = c as Record<string, unknown>;
    if (typeof x.key !== 'string' || typeof x.title !== 'string') return [];
    return [
      {
        key: x.key,
        title: x.title.slice(0, 200),
        severity: sev(x.severity),
        rule: typeof x.rule === 'string' ? x.rule : null,
        route: typeof x.route === 'string' ? x.route : '/',
        count: count(x.count),
        devices: strs(x.devices),
        personas: strs(x.personas),
        missions: strs(x.missions),
        screenshot: typeof x.screenshot === 'string' ? x.screenshot : null,
        isNew: x.isNew === true,
      },
    ];
  });
  return {
    runId: typeof d.runId === 'string' ? d.runId : null,
    generatedAtMs: millisOf(d.generatedAt),
    findings: count(d.findings),
    bySeverity: { P0: count(bs.P0), P1: count(bs.P1), P2: count(bs.P2), P3: count(bs.P3) },
    clusters,
    clusterKeys: strs(d.clusterKeys, QA_SUMMARY_MAX_KEYS),
    sessions: (Array.isArray(d.sessions) ? d.sessions : []).slice(0, 20).flatMap((s) => {
      const x = (s ?? {}) as Record<string, unknown>;
      return typeof x.mission === 'string' && typeof x.outcome === 'string' ? [{ mission: x.mission, outcome: x.outcome }] : [];
    }),
  };
}
