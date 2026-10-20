/**
 * The overseer's clustering (B4, design §3.7) — deterministic, no LLM: findings of a run are
 * grouped by (rule, or category for rule-less findings) × screen route, then ranked by
 * severity × reach (how many personas / devices / repeats). Pure; unit-tested.
 * Infrastructure noise (mint / sign-in / App Check / permission errors) is kept apart so it
 * doesn't flood the product report.
 */
import { createHash } from 'node:crypto';
import { QA_SEVERITIES, type QaCluster, type QaSeverity } from '@/lib/demo-control/qa-summary';
import type { Finding } from '../findings';

export interface Cluster extends QaCluster {
  findings: Finding[];
  infra: boolean;
  score: number;
}

const SEV_WEIGHT: Record<QaSeverity, number> = { P0: 100, P1: 30, P2: 8, P3: 2 };
const INFRA = /app ?check|appcheck|recaptcha|permission[-_ ]denied|insufficient permissions|mint_|sign_in_failed|not_signed_in_as_tester/i;

export function clusterKey(f: Pick<Finding, 'rule' | 'category' | 'route'>): string {
  return createHash('sha1').update(`${f.rule ?? `cat:${f.category}`}|${f.route}`).digest('hex').slice(0, 16);
}

export function isInfraFinding(f: Pick<Finding, 'actual' | 'title' | 'source'>): boolean {
  return INFRA.test(`${f.title} ${f.actual}`);
}

const worst = (a: QaSeverity, b: QaSeverity) => (QA_SEVERITIES.indexOf(a) <= QA_SEVERITIES.indexOf(b) ? a : b);
const uniq = (xs: string[]) => Array.from(new Set(xs)).sort();

export function clusterFindings(findings: readonly Finding[], previousKeys: ReadonlySet<string> = new Set()): Cluster[] {
  const groups = new Map<string, Finding[]>();
  for (const f of findings) {
    const k = clusterKey(f);
    const g = groups.get(k);
    if (g) g.push(f);
    else groups.set(k, [f]);
  }
  const out: Cluster[] = [];
  groups.forEach((fs, key) => {
    const severity = fs.map((f) => f.severity).reduce(worst);
    // Representative: the worst, then the most confident, then the most repeated.
    const rep = [...fs].sort(
      (a, b) => QA_SEVERITIES.indexOf(a.severity) - QA_SEVERITIES.indexOf(b.severity) || b.confidence - a.confidence || b.count - a.count,
    )[0];
    const count = fs.reduce((n, f) => n + Math.max(1, f.count), 0);
    const personas = uniq(fs.map((f) => f.persona));
    const devices = uniq(fs.map((f) => f.device));
    const reach = personas.length + devices.length - 1;
    const meanConf = fs.reduce((n, f) => n + f.confidence, 0) / fs.length;
    out.push({
      key,
      title: rep.title,
      severity,
      rule: rep.rule,
      route: rep.route,
      count,
      devices,
      personas,
      missions: uniq(fs.map((f) => f.mission)),
      screenshot: fs.find((f) => f.screenshot)?.screenshot ?? null,
      isNew: !previousKeys.has(key),
      findings: fs,
      infra: fs.every(isInfraFinding),
      score: SEV_WEIGHT[severity] * reach * (1 + Math.log2(count)) * (0.5 + meanConf / 2),
    });
  });
  return out.sort((a, b) => Number(a.infra) - Number(b.infra) || b.score - a.score || a.key.localeCompare(b.key));
}

export function countBySeverity(findings: readonly Pick<Finding, 'severity'>[]): Record<QaSeverity, number> {
  const out: Record<QaSeverity, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const f of findings) out[f.severity] += 1;
  return out;
}
