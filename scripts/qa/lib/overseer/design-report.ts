/**
 * The overseer's Hebrew "design report" (design-report.md) and the `design` block of the
 * control-center summary doc (demo_registry/qa_summary). Pure; unit-tested.
 *
 * NOTE: qaRunnerReport's summary sanitiser (functions/src/lib/qa-runner-ops.ts parseSummary) and
 * the panel parser (src/lib/demo-control/qa-summary.ts) keep only the fields they know — the
 * `design` block is stored once both learn it (follow-up outside scripts/qa). Its shape is
 * DesignSummary below.
 */
import type { QaSeverity } from '@/lib/demo-control/qa-summary';
import { ruleText } from '../checklist';
import { DIMENSION_HE, LOW_SCORE, SCORE_DIMENSIONS } from '../design/dimensions';
import type { CoverageRow, ScreenRow } from './design-aggregate';

const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toFixed(1));
const mark = (n: number | null | undefined) => (n !== null && n !== undefined && n <= LOW_SCORE ? `**${fmt(n)}**` : fmt(n));
const name = (r: ScreenRow) => (r.label ? `${esc(r.label)} (\`${r.screen}\`)` : `\`${r.screen}\``);
const sevLine = (r: ScreenRow) =>
  (['P0', 'P1', 'P2', 'P3'] as QaSeverity[])
    .filter((s) => r.bySeverity[s] > 0)
    .map((s) => `${s}×${r.bySeverity[s]}`)
    .join(' ') || '—';

export const DESIGN_REPORT_TOP = 8;

function screenTable(rows: readonly ScreenRow[]): string[] {
  return [
    `| מסך | ציון | ${SCORE_DIMENSIONS.map((d) => DIMENSION_HE[d]).join(' | ')} | מכשירים | ממצאים | חוקים מובילים |`,
    `|---|---|${SCORE_DIMENSIONS.map(() => '---').join('|')}|---|---|---|`,
    ...rows.map(
      (r) =>
        `| ${name(r)} | ${mark(r.overall)} | ${SCORE_DIMENSIONS.map((d) => mark(r.scores?.[d])).join(' | ')} | ${r.devices.join(', ') || '—'} | ${sevLine(r)} | ${r.topRules.slice(0, 3).map((t) => `${t.rule}×${t.count}`).join(', ') || '—'} |`,
    ),
  ];
}

function deviceTable(rows: readonly ScreenRow[], devices: readonly string[]): string[] {
  const scored = rows.filter((r) => r.overall !== null);
  if (devices.length < 2 || !scored.length) return [];
  return [
    '## לפי גודל מסך',
    'ציון כולל לכל מסך בכל מכשיר — פער גדול בין המכשירים אומר שהמסך לא מתאים את עצמו לגודל.',
    '',
    `| מסך | ${devices.join(' | ')} | פער |`,
    `|---|${devices.map(() => '---').join('|')}|---|`,
    ...scored.map((r) => {
      const vals = devices.map((d) => r.byDevice[d]).filter((v): v is number => typeof v === 'number');
      const gap = vals.length > 1 ? Math.max(...vals) - Math.min(...vals) : null;
      return `| ${name(r)} | ${devices.map((d) => mark(r.byDevice[d])).join(' | ')} | ${gap === null ? '—' : gap >= 1 ? `**${gap.toFixed(1)}**` : gap.toFixed(1)} |`;
    }),
    '',
  ];
}

function screenSection(r: ScreenRow, i: number): string[] {
  const out = [
    `### ${i}. ${r.label ? esc(r.label) : r.screen} — ${r.overall === null ? 'בלי ציון' : `${fmt(r.overall)}/5`}`,
    `- מזהה: \`${r.screen}\` · נתיבים: ${r.routes.map((x) => `\`${x}\``).join(', ')} · מכשירים: ${r.devices.join(', ')}`,
  ];
  if (r.scores) out.push(`- ציונים: ${SCORE_DIMENSIONS.map((d) => `${DIMENSION_HE[d]} ${mark(r.scores![d])}`).join(' · ')} (${r.samples} דגימות)`);
  if (r.lowWithoutFinding) out.push('- **שים לב:** ציון נמוך בלי ממצא מפורט — הבודק לא הסביר מה לא בסדר.');
  if (r.screenshot) out.push(`- צילום: \`${r.screenshot}\``);
  const fs = [...r.findings].sort((a, b) => a.severity.localeCompare(b.severity) || b.confidence - a.confidence).slice(0, 8);
  for (const f of fs) {
    const rule = f.rule ?? f.category;
    out.push(`  - ${f.severity} · ${rule} · ${esc(f.title)} — ${esc(f.actual).slice(0, 220)}${f.screenshot ? ` (\`${f.screenshot}\`)` : ''}`);
  }
  if (r.findings.length > fs.length) out.push(`  - ועוד ${r.findings.length - fs.length} ממצאים`);
  const top = r.topRules[0];
  if (top && ruleText(top.rule)) out.push(`- החוק המרכזי: ${top.rule} — ${ruleText(top.rule)}`);
  return out;
}

function coverageSection(cov: readonly CoverageRow[]): string[] {
  if (!cov.length) return [];
  const next = cov.filter((c) => c.resume).map((c) => c.resume as string);
  return [
    '## כיסוי סריקות העיצוב',
    '| משימה | מכשיר | נסרקו | חסרים | להמשך |',
    '|---|---|---|---|---|',
    ...cov.map((c) => `| ${c.mission} | ${c.device} | ${c.covered.length}/${c.total} | ${c.missing.join(', ') || '—'} | ${c.resume ? `\`${c.resume}\`` : 'הושלם'} |`),
    '',
    next.length
      ? `להמשך הסריקה: GitHub → Actions → qa-testers → Run workflow, missions = \`${Array.from(new Set(next)).slice(0, 3).join(',')}\` (עד ~3 סשנים בהרצה), ובחר את אותו מכשיר.`
      : 'כל הסריקות שהורצו הושלמו.',
    '',
  ];
}

export function buildDesignReport(label: string, rows: readonly ScreenRow[], coverage: readonly CoverageRow[] = []): string {
  const scored = rows.filter((r) => r.overall !== null);
  const avg = scored.length ? scored.reduce((n, r) => n + (r.overall ?? 0), 0) / scored.length : null;
  const low = rows.filter((r) => (r.overall !== null && r.overall <= LOW_SCORE) || (r.minScores && SCORE_DIMENSIONS.some((d) => r.minScores![d] <= LOW_SCORE)));
  const devices = Array.from(new Set(rows.flatMap((r) => Object.keys(r.byDevice)))).sort();
  const findings = rows.reduce((n, r) => n + r.findings.length, 0);
  const lines: string[] = [
    `# דוח עיצוב — ${label}`,
    '',
    `${scored.length} מסכים קיבלו ציון · ממוצע ${fmt(avg)}/5 · ${low.length} מסכים עם ציון ${LOW_SCORE} ומטה · ${findings} ממצאי עיצוב`,
    '',
    `ציון 1–5 לכל מסך: ${SCORE_DIMENSIONS.map((d) => DIMENSION_HE[d]).join(', ')}. מודגש = ${LOW_SCORE} ומטה.`,
    '',
    '## המסכים הכי חלשים',
    ...(low.length ? low.slice(0, 5).map((r, i) => `${i + 1}. ${name(r)} — ${fmt(r.overall)}/5${r.topRules[0] ? `, בעיקר ${r.topRules[0].rule}` : ''}`) : ['אין מסך עם ציון נמוך.']),
    '',
    '## כל המסכים',
    ...(rows.length ? screenTable(rows) : ['אין ציונים או ממצאי עיצוב בהרצה הזו.']),
    '',
    ...deviceTable(rows, devices),
    ...coverageSection(coverage),
  ];
  const detail = rows.filter((r) => r.findings.length || r.lowWithoutFinding).slice(0, 20);
  if (detail.length) lines.push('## פירוט לפי מסך', ...detail.flatMap((r, i) => screenSection(r, i + 1)));
  return `${lines.join('\n')}\n`;
}

/** The `design` block for demo_registry/qa_summary (see the NOTE at the top). */
export interface DesignSummary {
  screensScored: number;
  avgScore: number | null;
  lowScreens: number;
  findings: number;
  screens: Array<{
    screen: string;
    label: string | null;
    route: string;
    score: number | null;
    clarity: number | null;
    consistency: number | null;
    density: number | null;
    rtl: number | null;
    devices: string[];
    findings: number;
    worst: QaSeverity | null;
    topRule: string | null;
    screenshot: string | null;
  }>;
  /** Next refs to run for unfinished sweeps. */
  resume: string[];
}

export const DESIGN_SUMMARY_MAX_SCREENS = 15;

export function buildDesignSummary(rows: readonly ScreenRow[], coverage: readonly CoverageRow[] = []): DesignSummary {
  const scored = rows.filter((r) => r.overall !== null);
  const avg = scored.length ? Math.round((scored.reduce((n, r) => n + (r.overall ?? 0), 0) / scored.length) * 10) / 10 : null;
  return {
    screensScored: scored.length,
    avgScore: avg,
    lowScreens: rows.filter((r) => r.overall !== null && r.overall <= LOW_SCORE).length,
    findings: rows.reduce((n, r) => n + r.findings.length, 0),
    screens: rows.slice(0, DESIGN_SUMMARY_MAX_SCREENS).map((r) => ({
      screen: r.screen,
      label: r.label,
      route: r.routes[0] ?? '/',
      score: r.overall,
      clarity: r.scores?.clarity ?? null,
      consistency: r.scores?.consistency ?? null,
      density: r.scores?.density ?? null,
      rtl: r.scores?.rtl ?? null,
      devices: r.devices,
      findings: r.findings.length,
      worst: r.worst,
      topRule: r.topRules[0]?.rule ?? null,
      screenshot: r.screenshot,
    })),
    resume: Array.from(new Set(coverage.flatMap((c) => (c.resume ? [c.resume] : [])))).slice(0, 10),
  };
}
