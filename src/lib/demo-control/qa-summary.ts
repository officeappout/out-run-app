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
  /** The design sweep's per-screen scores (null when the run had none). */
  design: QaDesignSummary | null;
}

/** The four 1–5 dimensions the tester scores every screen on (scripts/qa/lib/design/dimensions.ts). */
export const QA_DESIGN_DIMENSIONS = ['clarity', 'consistency', 'density', 'rtl'] as const;
export type QaDesignDimension = (typeof QA_DESIGN_DIMENSIONS)[number];

export interface QaDesignScreen {
  /** Checkpoint screen id (snake) or, when the tester gave none, the route pattern. */
  screen: string;
  /** Hebrew name from a mission checkpoint. */
  label: string | null;
  route: string;
  /** Mean of the four dimensions, 1–5 (one decimal); null = not scored. */
  score: number | null;
  clarity: number | null;
  consistency: number | null;
  density: number | null;
  rtl: number | null;
  devices: string[];
  findings: number;
  worst: QaSeverity | null;
  topRule: string | null;
  /** Storage path qa/{runId}/… (signed by the screenshot route; never sent to the client). */
  screenshot: string | null;
}

export interface QaDesignSummary {
  screensScored: number;
  avgScore: number | null;
  lowScreens: number;
  findings: number;
  /** Scored screens worst first (at most QA_DESIGN_MAX_SCREENS). */
  screens: QaDesignScreen[];
  /** Mission refs (MISSION or MISSION@checkpoint) to continue unfinished sweeps. */
  resume: string[];
}

export const QA_DESIGN_MAX_SCREENS = 15;

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

const score = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 5 ? Math.round(v * 10) / 10 : null);
const strOr = (v: unknown, max: number, fallback: string): string => (typeof v === 'string' && v.trim() ? v.slice(0, max) : fallback);

export function parseQaDesign(raw: unknown): QaDesignSummary | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const d = raw as Record<string, unknown>;
  const screens = (Array.isArray(d.screens) ? d.screens : []).slice(0, QA_DESIGN_MAX_SCREENS).flatMap((x): QaDesignScreen[] => {
    if (!x || typeof x !== 'object') return [];
    const r = x as Record<string, unknown>;
    if (typeof r.screen !== 'string' || !r.screen.trim()) return [];
    return [
      {
        screen: r.screen.slice(0, 120),
        label: typeof r.label === 'string' && r.label.trim() ? r.label.slice(0, 80) : null,
        route: strOr(r.route, 120, '/'),
        score: score(r.score),
        clarity: score(r.clarity),
        consistency: score(r.consistency),
        density: score(r.density),
        rtl: score(r.rtl),
        devices: strs(r.devices, 10),
        findings: count(r.findings),
        worst: QA_SEVERITIES.includes(r.worst as QaSeverity) ? (r.worst as QaSeverity) : null,
        topRule: typeof r.topRule === 'string' ? r.topRule.slice(0, 30) : null,
        screenshot: typeof r.screenshot === 'string' && r.screenshot.startsWith('qa/') ? r.screenshot : null,
      },
    ];
  });
  return {
    screensScored: count(d.screensScored),
    avgScore: score(d.avgScore),
    lowScreens: count(d.lowScreens),
    findings: count(d.findings),
    screens,
    resume: strs(d.resume, 10),
  };
}

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
    design: parseQaDesign(d.design),
  };
}
