/**
 * scripts/qa/overseer.ts — B4 of agent-briefs/ai-testers-design.md: after a tester run, groups
 * its findings into issues, ranks them, writes a Hebrew markdown report, and updates the summary
 * doc the control center's findings card reads (demo_registry/qa_summary). Deterministic — no
 * model calls, no cost. Runs as the last step of .github/workflows/qa-testers.yml.
 *
 *   npx tsx scripts/qa/overseer.ts [--run-id <id>] [--out <dir>] [--no-summary]
 *
 * --run-id   default: the newest run in qa_findings
 * --out      where report.md goes (default qa-out/<runId>/); the owner can point it at
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
import { DEFAULT_REPORT_URL, openStore } from './lib/store';

function arg(argv: string[], flag: string): string | null {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
}

async function main() {
  const argv = process.argv.slice(2);
  const idToken = process.env.QA_REPORT_ID_TOKEN?.trim();
  if (!idToken) throw new Error('QA_REPORT_ID_TOKEN is not set (qa-runner ID token, audience = qaRunnerReport)');
  const store = openStore({ url: process.env.QA_REPORT_URL?.trim() || DEFAULT_REPORT_URL, idToken });
  const runId = arg(argv, '--run-id') ?? process.env.QA_RUN_ID ?? (await store.latestRunId());
  if (!runId) {
    console.log('[overseer] no findings yet.');
    return;
  }
  const findings = await store.readFindings(runId);
  const previous = parseQaSummary(await store.readQaSummaryRaw());
  const prevKeys = new Set(previous.runId === runId ? [] : previous.clusterKeys);
  const clusters = clusterFindings(findings, prevKeys);

  const runFile = join(process.cwd(), 'qa-out', runId, 'run.json');
  const sessions: SessionOutcome[] = existsSync(runFile) ? ((JSON.parse(readFileSync(runFile, 'utf8')) as { sessions?: SessionOutcome[] }).sessions ?? []) : [];

  if (!findings.length && !sessions.length) {
    console.log(`[overseer] run ${runId} produced nothing (refused before any session?) — summary left as is.`);
    return;
  }
  const outDir = resolve(arg(argv, '--out') ?? join('qa-out', runId));
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, arg(argv, '--out') ? `${runId}.md` : 'report.md');
  writeFileSync(file, buildReport(runId, findings, clusters, sessions));
  console.log(`[overseer] ${findings.length} findings → ${clusters.length} issues → ${file}`);

  if (!argv.includes('--no-summary')) {
    await store.writeQaSummary(buildSummaryDoc(runId, findings, clusters, sessions));
    console.log('[overseer] demo_registry/qa_summary updated');
  }
}

main().catch((e) => {
  console.error(`[overseer] failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
