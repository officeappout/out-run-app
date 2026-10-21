/**
 * The overseer's design view (owner, 21.10.2026): design findings grouped by SCREEN, the
 * tester's 1–5 scores averaged per screen (and per phone size), and which design-sweep
 * checkpoints are still missing (with the exact resume ref). Deterministic, pure; unit-tested.
 */
import { QA_SEVERITIES, type QaSeverity } from '@/lib/demo-control/qa-summary';
import { DESIGN_RULE_IDS } from '../checklist';
import { LOW_SCORE, overallScore, SCORE_DIMENSIONS, type ScoreDimension, type Scores } from '../design/dimensions';
import { isSweep, resumeRef, type Checkpoint } from '../design/checkpoints';
import { screenKey, scoresOf } from '../design/score-finding';
import type { Finding } from '../findings';

export interface ScreenRow {
  screen: string;
  /** Hebrew name from a mission checkpoint, when the screen id is one. */
  label: string | null;
  routes: string[];
  devices: string[];
  /** Number of score records. */
  samples: number;
  /** Mean per dimension (1 decimal), null when the screen was never scored. */
  scores: Scores | null;
  overall: number | null;
  /** Mean overall per device id. */
  byDevice: Record<string, number>;
  /** Lowest sample per dimension. */
  minScores: Scores | null;
  findings: Finding[];
  bySeverity: Record<QaSeverity, number>;
  worst: QaSeverity | null;
  /** Rule ids by number of findings, most first. */
  topRules: Array<{ rule: string; count: number }>;
  /** A dimension scored ≤ 3 somewhere, but the tester filed no design finding for the screen. */
  lowWithoutFinding: boolean;
  screenshot: string | null;
}

const DESIGN_CATEGORIES = new Set(['design-rule', 'a11y', 'copy']);
const round1 = (n: number) => Math.round(n * 10) / 10;
const uniq = (xs: string[]) => Array.from(new Set(xs)).sort();

export function isDesignFinding(f: Pick<Finding, 'rule' | 'category'>): boolean {
  if (f.rule === 'STAB-CONSOLE') return false;
  return (f.rule !== null && DESIGN_RULE_IDS.has(f.rule)) || DESIGN_CATEGORIES.has(f.category);
}

/** Checkpoint id → Hebrew screen name, over all missions. */
export function checkpointLabels(missions: ReadonlyArray<{ checkpoints?: Checkpoint[] }>): Map<string, string> {
  const m = new Map<string, string>();
  for (const mi of missions) for (const c of mi.checkpoints ?? []) if (!m.has(c.id)) m.set(c.id, c.screen);
  return m;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function aggregateScreens(issues: readonly Finding[], scoreFindings: readonly Finding[], labels: ReadonlyMap<string, string> = new Map()): ScreenRow[] {
  type Acc = { scores: Array<{ s: Scores; device: string }>; findings: Finding[]; routes: string[]; devices: string[]; shots: string[] };
  const by = new Map<string, Acc>();
  const acc = (k: string): Acc => {
    let a = by.get(k);
    if (!a) by.set(k, (a = { scores: [], findings: [], routes: [], devices: [], shots: [] }));
    return a;
  };
  for (const f of scoreFindings) {
    const s = scoresOf(f);
    if (!s) continue;
    const a = acc(screenKey(f));
    a.scores.push({ s, device: f.device });
    a.routes.push(f.route);
    a.devices.push(f.device);
    if (f.screenshot) a.shots.push(f.screenshot);
  }
  for (const f of issues) {
    if (!isDesignFinding(f)) continue;
    const a = acc(screenKey(f));
    a.findings.push(f);
    a.routes.push(f.route);
    a.devices.push(f.device);
  }

  const rows: ScreenRow[] = [];
  by.forEach((a, screen) => {
    const has = a.scores.length > 0;
    const dimMean = (d: ScoreDimension) => round1(mean(a.scores.map((x) => x.s[d])));
    const scores = has ? (Object.fromEntries(SCORE_DIMENSIONS.map((d) => [d, dimMean(d)])) as Scores) : null;
    const minScores = has ? (Object.fromEntries(SCORE_DIMENSIONS.map((d) => [d, Math.min(...a.scores.map((x) => x.s[d]))])) as Scores) : null;
    const byDevice: Record<string, number> = {};
    for (const dev of uniq(a.scores.map((x) => x.device))) byDevice[dev] = round1(mean(a.scores.filter((x) => x.device === dev).map((x) => overallScore(x.s))));
    const bySeverity: Record<QaSeverity, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
    for (const f of a.findings) bySeverity[f.severity] += 1;
    const worst = QA_SEVERITIES.find((s) => bySeverity[s] > 0) ?? null;
    const ruleCounts = new Map<string, number>();
    for (const f of a.findings) if (f.rule) ruleCounts.set(f.rule, (ruleCounts.get(f.rule) ?? 0) + Math.max(1, f.count));
    const topRules = Array.from(ruleCounts, ([rule, count]) => ({ rule, count })).sort((x, y) => y.count - x.count || x.rule.localeCompare(y.rule));
    const anyLow = !!minScores && SCORE_DIMENSIONS.some((d) => minScores[d] <= LOW_SCORE);
    const modelFindings = a.findings.filter((f) => f.source === 'llm').length;
    rows.push({
      screen,
      label: labels.get(screen) ?? null,
      routes: uniq(a.routes),
      devices: uniq(a.devices),
      samples: a.scores.length,
      scores,
      overall: scores ? round1(mean(SCORE_DIMENSIONS.map((d) => scores[d]))) : null,
      byDevice,
      minScores,
      findings: a.findings,
      bySeverity,
      worst,
      topRules,
      lowWithoutFinding: anyLow && modelFindings === 0,
      screenshot: a.findings.find((f) => f.screenshot)?.screenshot ?? a.shots[0] ?? null,
    });
  });
  // Scored screens worst first, then unscored ones by number of findings.
  return rows.sort(
    (x, y) =>
      Number(x.overall === null) - Number(y.overall === null) ||
      (x.overall ?? 0) - (y.overall ?? 0) ||
      y.findings.length - x.findings.length ||
      x.screen.localeCompare(y.screen),
  );
}

export interface CoverageRow {
  mission: string;
  device: string;
  total: number;
  covered: string[];
  missing: string[];
  /** The ref to put in the workflow's `missions` input to continue (null = done). */
  resume: string | null;
}

/**
 * For every design sweep that ran (a score or a session on a device): which checkpoints got a
 * score and where to resume. Sweeps never run on a device seen in this report get resume = the id.
 */
export function sweepCoverage(
  missions: ReadonlyArray<{ id: string; kind?: string; checkpoints?: Checkpoint[]; devices?: string[]; device: string }>,
  scoreFindings: readonly Finding[],
  sessions: ReadonlyArray<{ mission: string; device: string }> = [],
): CoverageRow[] {
  const sweeps = missions.filter(isSweep);
  const seen = new Set<string>();
  for (const f of scoreFindings) seen.add(`${f.mission}|${f.device}`);
  for (const s of sessions) seen.add(`${s.mission}|${s.device}`);
  const devicesInReport = new Set(Array.from(seen, (k) => k.split('|')[1]));
  const out: CoverageRow[] = [];
  for (const m of [...sweeps].sort((a, b) => a.id.localeCompare(b.id))) {
    const cps = m.checkpoints ?? [];
    const own = m.devices?.length ? m.devices : [m.device];
    for (const device of own) {
      if (!devicesInReport.has(device)) continue;
      const scored = new Set(scoreFindings.filter((f) => f.mission === m.id && f.device === device).map((f) => screenKey(f)));
      const covered = cps.filter((c) => scored.has(c.id)).map((c) => c.id);
      const missing = cps.filter((c) => !scored.has(c.id)).map((c) => c.id);
      const ran = seen.has(`${m.id}|${device}`);
      out.push({ mission: m.id, device, total: cps.length, covered, missing, resume: missing.length ? (ran ? resumeRef(m.id, missing[0]) : m.id) : null });
    }
  }
  return out;
}
