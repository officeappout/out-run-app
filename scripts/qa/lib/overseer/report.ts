/**
 * The overseer's outputs (pure): a Hebrew markdown report for the owner and the summary doc for
 * the control-center findings card (demo_registry/qa_summary, shape in src/lib/demo-control/qa-summary.ts).
 * The report proposes fix tasks in the agent-brief format; it never opens a PR itself.
 */
import { QA_SUMMARY_MAX_CLUSTERS, QA_SUMMARY_MAX_KEYS, type QaCluster, type QaSeverity } from '@/lib/demo-control/qa-summary';
import { ruleText } from '../checklist';
import type { Finding } from '../findings';
import { countBySeverity, type Cluster } from './cluster';

export interface SessionOutcome {
  mission: string;
  device: string;
  outcome: string;
  reason?: string | null;
  steps?: number;
  summary?: string;
}

const SEV_HE: Record<QaSeverity, string> = { P0: 'P0 · חוסם', P1: 'P1 · כואב', P2: 'P2 · חוק עיצוב', P3: 'P3 · ליטוש' };
const OUTCOME_HE: Record<string, string> = { success: 'הצליח', blocked: 'נחסם', gave_up: 'ויתר', stopped: 'נעצר', capped: 'הגיע לתקרה', error: 'תקלה' };

const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

function reproLine(f: Finding): string {
  return f.repro
    .slice(-8)
    .map((r) => {
      const name = String(r.name ?? r.world ?? r.runner ?? '?');
      const arg = r.ref ?? r.direction ?? r.action ?? r.mode ?? r.seconds ?? r.reason ?? '';
      return arg === '' ? name : `${name}(${String(arg)})`;
    })
    .join(' → ');
}

function clusterSection(c: Cluster, i: number): string {
  const rep = c.findings[0];
  const rule = c.rule ? `${c.rule}${ruleText(c.rule) ? ` — ${ruleText(c.rule)}` : ''}` : '—';
  return [
    `### ${i}. ${esc(c.title)}${c.isNew ? ' (חדש)' : ''}`,
    `- חומרה: **${SEV_HE[c.severity]}** · ${c.count} מופעים · מסך \`${c.route}\``,
    `- חוק: ${rule}`,
    `- מי נתקל: ${c.personas.join(', ')} · מכשירים: ${c.devices.join(', ')} · משימות: ${c.missions.join(', ')}`,
    `- ציפינו: ${esc(rep.expected)}`,
    `- קרה: ${esc(rep.actual)}`,
    c.screenshot ? `- צילום: \`${c.screenshot}\`` : '- צילום: אין',
    `- לשחזור: ${reproLine(rep) || '—'}`,
  ].join('\n');
}

function taskBrief(c: Cluster): string {
  return [
    `- **${esc(c.title)}** (${c.severity}, \`${c.route}\`${c.rule ? `, ${c.rule}` : ''})`,
    `  לתקן: ${esc(c.findings[0].actual)} → ${esc(c.findings[0].expected)}. מאחורי \`enable_home_v2\` אם זה UI.`,
    `  לוודא: לשחזר עם המשימה ${c.missions[0]} (scripts/qa/run.ts --missions ${c.missions[0]}).`,
  ].join('\n');
}

export function buildReport(runId: string, findings: readonly Finding[], clusters: readonly Cluster[], sessions: readonly SessionOutcome[]): string {
  const product = clusters.filter((c) => !c.infra);
  const infra = clusters.filter((c) => c.infra);
  const bs = countBySeverity(findings);
  const top = product.slice(0, 3);
  const lines: string[] = [
    `# דוח בודקי AI — ${runId}`,
    '',
    `${findings.length} ממצאים ב-${product.length} נושאים · P0 ${bs.P0} · P1 ${bs.P1} · P2 ${bs.P2} · P3 ${bs.P3}`,
    '',
    '## 3 הדברים הכי חשובים היום',
    ...(top.length ? top.map((c, i) => `${i + 1}. **${esc(c.title)}** — ${SEV_HE[c.severity]}, \`${c.route}\`, ${c.personas.length} דמויות`) : ['אין ממצאים.']),
    '',
    '## המשימות',
    '| משימה | מכשיר | תוצאה | צעדים | איך הרגיש |',
    '|---|---|---|---|---|',
    ...sessions.map((s) => `| ${s.mission} | ${s.device} | ${OUTCOME_HE[s.outcome] ?? s.outcome}${s.reason ? ` (${esc(s.reason)})` : ''} | ${s.steps ?? '—'} | ${esc((s.summary ?? '').slice(0, 160)) || '—'} |`),
    '',
    '## כל הנושאים',
    ...product.map((c, i) => clusterSection(c, i + 1)),
  ];
  if (infra.length) {
    lines.push('', '## תשתית (לא באגים של המוצר)', ...infra.map((c) => `- ${esc(c.title)} — ${c.count} מופעים (${c.missions.join(', ')})`));
  }
  const tasks = product.filter((c) => c.severity === 'P0' || c.severity === 'P1').slice(0, 5);
  if (tasks.length) lines.push('', '## הצעות משימה (לאישורך, לא נפתח PR)', ...tasks.map(taskBrief));
  return `${lines.join('\n')}\n`;
}

export function buildSummaryDoc(runId: string, findings: readonly Finding[], clusters: readonly Cluster[], sessions: readonly SessionOutcome[]): Record<string, unknown> {
  const strip = (c: Cluster): QaCluster => ({
    key: c.key,
    title: c.title,
    severity: c.severity,
    rule: c.rule,
    route: c.route,
    count: c.count,
    devices: c.devices,
    personas: c.personas,
    missions: c.missions,
    screenshot: c.screenshot,
    isNew: c.isNew,
  });
  return {
    runId,
    findings: findings.length,
    bySeverity: countBySeverity(findings),
    clusters: clusters.filter((c) => !c.infra).slice(0, QA_SUMMARY_MAX_CLUSTERS).map(strip),
    clusterKeys: clusters.map((c) => c.key).slice(0, QA_SUMMARY_MAX_KEYS),
    sessions: sessions.map((s) => ({ mission: s.mission, outcome: s.outcome })),
  };
}
