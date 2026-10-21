/**
 * scripts/qa/overseer.ts — B4 of agent-briefs/ai-testers-design.md: after a tester run, groups
 * its findings into issues, ranks them, writes a Hebrew markdown report + a Hebrew design report
 * (design findings and 1–5 screen scores grouped by screen, per phone size, sweep coverage), and
 * updates the summary doc the control center's findings card reads (demo_registry/qa_summary).
 * Deterministic — no model calls, no cost. Runs as the last step of .github/workflows/qa-testers.yml.
 *
 *   npx tsx scripts/qa/overseer.ts [--run-id <id>[,<id>…]] [--out <dir>] [--no-summary]
 *
 * --run-id   default: the newest run in qa_findings. Several ids (e.g. the same sweep on
 *            iphone-se, iphone-13 and iphone-15-pro-max) → one combined report; the summary doc
 *            is then not written (it describes one run).
 * --out      where the reports go (default qa-out/<runId>/); the owner can point it at
 *            agent-briefs/qa-reports/ when running it by hand
 * Reads qa-out/<runId>/run.json when present (session outcomes from the runner).
 * Env: QA_REPORT_ID_TOKEN (qa-runner ID token, audience = qaRunnerReport) · QA_REPORT_URL (optional).
 * All reads / writes go through qaRunnerReport — no Google credentials file needed.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { parseQaSummary } from '@/lib/demo-control/qa-summary';
import { clusterFindings } from './lib/overseer/cluster';
import { buildReport, buildSummaryDoc, type SessionOutcome } from './lib/overseer/report';
import { aggregateScreens, checkpointLabels, sweepCoverage } from './lib/overseer/design-aggregate';
import { buildDesignReport, buildDesignSummary } from './lib/overseer/design-report';
import { splitFindings } from './lib/overseer/split';
import { loadPersonasAndMissions } from './lib/files';
import type { Mission } from './lib/missions';
import type { Finding } from './lib/findings';
import { DEFAULT_REPORT_URL, openStore } from './lib/store';

function arg(argv: string[], flag: string): string | null {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
}

function readSessions(runId: string): SessionOutcome[] {
  const runFile = join(process.cwd(), 'qa-out', runId, 'run.json');
  return existsSync(runFile) ? ((JSON.parse(readFileSync(runFile, 'utf8')) as { sessions?: SessionOutcome[] }).sessions ?? []) : [];
}

function loadMissions(): Mission[] {
  try {
    return loadPersonasAndMissions().missions;
  } catch (e) {
    console.warn(`[overseer] mission files not readable — design coverage left out (${e instanceof Error ? e.message.split('\n')[0] : 'error'})`);
    return [];
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const idToken = process.env.QA_REPORT_ID_TOKEN?.trim();
  if (!idToken) throw new Error('QA_REPORT_ID_TOKEN is not set (qa-runner ID token, audience = qaRunnerReport)');
  const store = openStore({ url: process.env.QA_REPORT_URL?.trim() || DEFAULT_REPORT_URL, idToken });
  const requested = (arg(argv, '--run-id') ?? process.env.QA_RUN_ID ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const runIds = requested.length ? requested : [(await store.latestRunId()) ?? ''].filter(Boolean);
  if (!runIds.length) {
    console.log('[overseer] no findings yet.');
    return;
  }
  const runId = runIds.join('+');
  const all: Finding[] = [];
  for (const id of runIds) all.push(...(await store.readFindings(id)));
  const { issues, scores } = splitFindings(all);
  const previous = parseQaSummary(await store.readQaSummaryRaw());
  const prevKeys = new Set(runIds.includes(previous.runId ?? '') ? [] : previous.clusterKeys);
  const clusters = clusterFindings(issues, prevKeys);
  const sessions = runIds.flatMap(readSessions);

  if (!all.length && !sessions.length) {
    console.log(`[overseer] run ${runId} produced nothing (refused before any session?) — summary left as is.`);
    return;
  }

  const missions = loadMissions();
  const rows = aggregateScreens(issues, scores, checkpointLabels(missions));
  const coverage = sweepCoverage(missions, scores, sessions);

  const custom = arg(argv, '--out');
  const outDir = resolve(custom ?? join('qa-out', runIds[0]));
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, custom ? `${runId}.md` : 'report.md');
  const designFile = join(outDir, custom ? `${runId}-design.md` : 'design-report.md');
  writeFileSync(file, buildReport(runId, issues, clusters, sessions));
  writeFileSync(designFile, buildDesignReport(runId, rows, coverage));
  console.log(`[overseer] ${issues.length} findings → ${clusters.length} issues → ${file}`);
  console.log(`[overseer] ${scores.length} screen scores, ${rows.length} screens → ${designFile}`);

  if (argv.includes('--no-summary')) return;
  if (runIds.length > 1) {
    console.log('[overseer] several runs combined — summary doc not written (it describes one run).');
    return;
  }
  await store.writeQaSummary({ ...buildSummaryDoc(runIds[0], issues, clusters, sessions), design: buildDesignSummary(rows, coverage) });
  console.log('[overseer] demo_registry/qa_summary updated');
}

main().catch((e) => {
  console.error(`[overseer] failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
