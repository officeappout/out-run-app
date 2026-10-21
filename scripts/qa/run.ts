/**
 * scripts/qa/run.ts — the AI tester runner (B3 of agent-briefs/ai-testers-design.md, owner-approved
 * 20.10.2026). Runs on GitHub Actions (.github/workflows/qa-testers.yml), started by the owner from
 * /admin/demo. Not meant for a laptop (and NEVER against a local `next dev`).
 *
 *   npx tsx scripts/qa/run.ts --dry-run                       # validate files + print the plan, no network
 *   npx tsx scripts/qa/run.ts [--missions M01_walker58,…] [--device iphone-13] [--run-id …] [--max-sessions 3]
 *
 * Env: ANTHROPIC_DEMO_KEY · QA_ID_TOKEN (qa-runner Google ID token, audience = the mint URL) ·
 *      QA_REPORT_ID_TOKEN (same identity, audience = the qaRunnerReport URL) · QA_REPORT_URL ·
 *      APPCHECK_DEBUG_TOKEN (optional) · QA_MINT_URL · QA_MODEL · QA_BASE_URL ·
 *      No Google credentials file: every read / write goes through qaRunnerReport (least privilege).
 *
 * Order: files valid → both switches on → no stop request → caps + prices set and not reached →
 * per mission (sequential, ONE browser at a time): session caps → mint → sign in → guarded loop →
 * close. Heartbeat on demo_registry/control.testers throughout; idle at the end.
 * A browser crash restarts that session in a fresh browser from the first unscored screen
 * (lib/mission-runner.ts); any other session error is recorded and the run goes on.
 * Output (the workflow's artifact): qa-out/<runId>/run.json, findings.jsonl and shots/ — every
 * screen the tester saw, in order, with shots/manifest.json (lib/shots.ts).
 */
import Anthropic from '@anthropic-ai/sdk';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getIsraelDateKey } from '@/lib/israelTime';
import { checkCaps, summarizeUsage } from '@/lib/demo-control/usage-cost';
import { DEFAULT_TESTER_MODEL, HARD_CAPS } from './lib/config';
import { Budget, preflight } from './lib/budget';
import { openBrowser } from './lib/browser';
import { redactSecrets } from './lib/demo-guard';
import { loadPersonasAndMissions } from './lib/files';
import { FindingsBook } from './lib/findings';
import { DEFAULT_MINT_URL, ID_TOKEN_MIN_LEFT_SEC, idTokenSecondsLeft, mintTesterToken } from './lib/mint';
import { makeRunId, parseRunArgs, planRun } from './lib/plan';
import type { SessionResult } from './lib/session';
import { runPlannedSession } from './lib/mission-runner';
import { memoryLine } from './lib/crash';
import { ShotLog } from './lib/shots';
import { missionUids } from './lib/design/checkpoints';
import { DEFAULT_REPORT_URL, openStore, sessionStartDelta, type Store } from './lib/store';
import { mergeOwnerRules } from './lib/owner/owner-rules';
import { buildLearning } from './lib/owner/learning';

const log = (msg: string) => console.log(`[qa] ${redactSecrets(msg)}`);

/** Mint refusals that would refuse every later session too. */
const MINT_STOPS = new Set(['mint_switch_off', 'mint_caller_not_allowed', 'mint_quota_exhausted']);

async function main(): Promise<number> {
  const args = parseRunArgs(process.argv.slice(2), process.env);
  const { personas, missions, ownerRules } = loadPersonasAndMissions();
  const runId = args.runId ?? makeRunId(new Date(), process.env.GITHUB_RUN_ID ?? '');
  const model = process.env.QA_MODEL?.trim() || DEFAULT_TESTER_MODEL;

  if (args.dryRun) {
    const plan = planRun(missions, args, new Set(missions.flatMap(missionUids)));
    log(`owner rules: ${ownerRules.map((r) => r.id).join(', ') || '(none)'}`);
    log(`dry run ${runId}: ${plan.sessions.map((s) => `${s.mission.id}@${s.device}`).join(', ') || '(nothing)'}; skipped ${JSON.stringify(plan.skipped)}`);
    return 0;
  }

  const apiKey = process.env.ANTHROPIC_DEMO_KEY?.trim();
  const idToken = process.env.QA_ID_TOKEN?.trim();
  if (!apiKey) throw new Error('ANTHROPIC_DEMO_KEY is not set');
  if (!idToken) throw new Error('QA_ID_TOKEN is not set (google-github-actions/auth token_format: id_token)');
  const reportToken = process.env.QA_REPORT_ID_TOKEN?.trim();
  if (!reportToken) throw new Error('QA_REPORT_ID_TOKEN is not set (second auth step, audience = qaRunnerReport)');

  const store = openStore({ url: process.env.QA_REPORT_URL?.trim() || DEFAULT_REPORT_URL, idToken: reportToken });
  return runAll(store, { args, runId, model, apiKey, idToken, personas, missions, ownerRules });
}

async function runAll(
  store: Store,
  ctx: { args: ReturnType<typeof parseRunArgs>; runId: string; model: string; apiKey: string; idToken: string; personas: ReturnType<typeof loadPersonasAndMissions>['personas']; missions: ReturnType<typeof loadPersonasAndMissions>['missions']; ownerRules: ReturnType<typeof loadPersonasAndMissions>['ownerRules'] },
): Promise<number> {
  const { args, runId, model } = ctx;
  const status = await store.status();
  if (!status.switchesOn) {
    log('enable_demo_users / enable_ai_testers is off — nothing to do.');
    return 0;
  }
  if (status.stopRequested) {
    log('a stop is requested in the control center — not starting.');
    return 0;
  }
  const config = status.config;
  const pre = preflight(config.caps, config.prices, model);
  if (!pre.ok) {
    log(`refusing to start: ${pre.reason} (set the daily $ cap and the price of ${model} on /admin/demo).`);
    return 1;
  }
  const todayKey = getIsraelDateKey(new Date());
  const usage = summarizeUsage(status.usageDays, todayKey, config.prices);
  if (checkCaps(usage, config.caps).blocksTesterRun) {
    log('a money / session cap is already reached today — not starting.');
    return 0;
  }

  // The owner's rules: the seed file + notes from the panel; and what his "לא רלוונטי" marks taught.
  const owner = { rules: mergeOwnerRules(ctx.ownerRules, status.ownerRules.notes), learning: buildLearning(status.ownerRules.dismissals) };
  log(`owner rules: ${owner.rules.length} (${status.ownerRules.notes.length} from the panel), suppressed: ${owner.learning.suppressed.length}, clarifications: ${owner.learning.clarifications.length}`);

  const roster = status.roster;
  const plan = planRun(ctx.missions, args, roster);
  for (const s of plan.skipped) log(`skip ${s.id}: ${s.reason}`);
  if (!plan.sessions.length) {
    log('no runnable missions (register tester uids with scripts/qa/register-testers.ts).');
    return 0;
  }

  const budget = new Budget({
    caps: config.caps,
    prices: config.prices,
    model,
    todayUsd: usage.today.usd,
    monthUsd: usage.monthToDate.usd,
    sessionsToday: usage.today.testerSessions,
    maxSessionsThisRun: args.maxSessions,
  });
  const book = new FindingsBook();
  const anthropic = new Anthropic({ apiKey: ctx.apiKey, maxRetries: 2 });
  const results: Array<{ mission: string; device: string; attempts?: number } & SessionResult> = [];
  const out = join(process.cwd(), 'qa-out', runId);
  const shots = new ShotLog(runId, join(out, 'shots'));
  log(`start · ${memoryLine()}`);
  let lastSessionAt = Date.now();
  const beat = (state: 'running' | 'idle') =>
    store.heartbeat({ state, runId, lastSessionAtMs: lastSessionAt, findingsCount: book.size, spentUsd: Number(budget.spentUsd.toFixed(4)) }).catch(() => log('heartbeat failed'));
  await beat('running');
  const timer = setInterval(() => void beat('running'), HARD_CAPS.heartbeatMs);

  let stopReason: string | null = null;
  try {
    for (let i = 0; i < plan.sessions.length; i++) {
      const s = plan.sessions[i];
      if (await store.stopRequested().catch(() => false)) {
        stopReason = 'stop_requested';
        break;
      }
      const gate = budget.startSession();
      if (!gate.ok) {
        stopReason = gate.reason;
        break;
      }
      if (idTokenSecondsLeft(ctx.idToken, Math.floor(Date.now() / 1000)) < ID_TOKEN_MIN_LEFT_SEC) {
        stopReason = 'id_token_expiring';
        break;
      }
      const persona = ctx.personas.get(s.mission.persona)!;
      log(`session ${i + 1}/${plan.sessions.length}: ${s.mission.id}${s.resumeFrom ? `@${s.resumeFrom}` : ''} as ${persona.id} on ${s.device}`);
      await store.addUsage(getIsraelDateKey(new Date()), sessionStartDelta(model), true).catch(() => log('session count write failed'));

      try {
        const r = await runPlannedSession(
          {
            session: {
              anthropic,
              model,
              store,
              budget,
              book,
              runId,
              cohort: s.mission.cohort,
              dayKey: () => getIsraelDateKey(new Date()),
              stopRequested: () => store.stopRequested().catch(() => false),
              log,
              shots,
              owner,
            },
            baseUrl: args.baseUrl,
            seed: i + 1,
            mint: (uid) => mintTesterToken({ url: process.env.QA_MINT_URL?.trim() || DEFAULT_MINT_URL, idToken: ctx.idToken, uid, runId }),
            open: (device, startAt) => openBrowser(device, { appCheckDebugToken: process.env.APPCHECK_DEBUG_TOKEN?.trim() || null, startAt, log }),
          },
          s,
          persona,
        );
        log(`→ ${r.outcome}${r.reason ? ` (${r.reason})` : ''}, ${r.steps} steps, ${r.newFindings} new findings${r.attempts > 1 ? `, ${r.attempts} browsers` : ''} · ${memoryLine()}`);
        results.push({ mission: s.mission.id, device: s.device, ...r });
        if (MINT_STOPS.has(r.reason ?? '')) {
          stopReason = r.reason;
          break;
        }
        if (r.outcome === 'stopped' || (r.outcome === 'capped' && /usd|sessions/.test(r.reason ?? ''))) {
          stopReason = r.reason;
          break;
        }
      } catch (e) {
        // One broken session never takes the run (and its report / screenshots) down with it.
        const msg = redactSecrets(e instanceof Error ? e.message.split('\n')[0] : String(e)).slice(0, 200);
        log(`session ${s.mission.id} failed: ${msg} · ${memoryLine()}`);
        results.push({ mission: s.mission.id, device: s.device, outcome: 'error', reason: `exception: ${msg}`, summary: '', steps: 0, newFindings: 0 });
      } finally {
        lastSessionAt = Date.now();
        await beat('running');
      }
    }
  } finally {
    clearInterval(timer);
    await beat('idle');
  }

  shots.flush();
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'run.json'), JSON.stringify({ runId, model, stopReason, spentUsd: budget.spentUsd, sessions: results }, null, 2));
  writeFileSync(join(out, 'findings.jsonl'), book.all().map((f) => JSON.stringify(f)).join('\n'));
  log(`screenshots: ${shots.size} in qa-out/${runId}/shots (manifest.json)`);
  log(`run ${runId} done: ${results.length} sessions, ${book.size} findings, ~$${budget.spentUsd.toFixed(2)}${stopReason ? `, stopped: ${stopReason}` : ''}`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(`[qa] failed: ${redactSecrets(e instanceof Error ? e.message : String(e))}`);
    process.exit(1);
  },
);
