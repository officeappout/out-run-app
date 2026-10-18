/**
 * scripts/ai-coach-evals.ts — regression evals for the "קלי AI" coach.
 *
 * Replays every eval case through the real turn engine (src/lib/ai/review/eval-runner.ts)
 * and checks its assertions; prints a pass/fail table and the cost.
 *
 *   npx tsx scripts/ai-coach-evals.ts                 # mock model + stub generator (free; validates the harness)
 *   ANTHROPIC_API_KEY=… npx tsx scripts/ai-coach-evals.ts --live
 *                                                     # the real coach model (AI_MODEL_FAST or claude-haiku-5-5)
 *   … --case owner-03                                 # only cases whose id contains "owner-03"
 *   … --firestore                                     # ALSO load ai_coach_eval_cases (read-only;
 *                                                     #   needs FIREBASE_SERVICE_ACCOUNT_KEY, e.g. node --env-file=.env.local)
 *   … --generator offline                             # the real workout engine on the frozen corpus
 *                                                     #   (run with --tsconfig tests/invariants/tsconfig.json,
 *                                                     #   see scripts/ai-coach-evals/offline-generator.ts)
 *   … --json out.json                                 # write the full report
 *
 * Fixtures: evals/ai-coach/*.json (arrays of EvalCase). Exit code 1 when any case fails.
 * The live mode costs real money (a few cents for the fixture set) and never writes anything.
 */
import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { AI_MODEL_DEFAULTS } from '@/lib/ai/ai-pricing';
import { EvalCaseSchema, type EvalCase } from '@/lib/ai/review/eval-case';
import {
  runEvalCase,
  scriptedMockModel,
  stubWorkoutGenerator,
  type CallModel,
  type EvalCaseReport,
  type SimulateWorkout,
} from '@/lib/ai/review/eval-runner';

interface Args {
  live: boolean;
  firestore: boolean;
  generator: 'stub' | 'offline';
  filter: string | null;
  json: string | null;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { live: false, firestore: false, generator: 'stub', filter: null, json: null };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--live') a.live = true;
    else if (v === '--firestore') a.firestore = true;
    else if (v === '--generator') a.generator = argv[++i] === 'offline' ? 'offline' : 'stub';
    else if (v === '--case') a.filter = argv[++i] ?? null;
    else if (v === '--json') a.json = argv[++i] ?? null;
  }
  return a;
}

export function loadFixtureCases(dir = path.join(process.cwd(), 'evals', 'ai-coach')): EvalCase[] {
  if (!fs.existsSync(dir)) return [];
  const out: EvalCase[] = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as unknown[];
    for (const c of raw) out.push(EvalCaseSchema.parse(c));
  }
  return out;
}

/** Read-only: ai_coach_eval_cases via the Admin SDK (never writes). */
async function loadFirestoreCases(): Promise<EvalCase[]> {
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!key) throw new Error('--firestore needs FIREBASE_SERVICE_ACCOUNT_KEY (run with node --env-file=.env.local)');
  const { initializeApp, cert, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const parsed = JSON.parse(key);
  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert({ projectId: parsed.project_id, clientEmail: parsed.client_email, privateKey: String(parsed.private_key).replace(/\\n/g, '\n') }),
      projectId: parsed.project_id,
    });
  const snap = await getFirestore(app).collection('ai_coach_eval_cases').limit(500).get();
  const out: EvalCase[] = [];
  for (const d of snap.docs) {
    const r = EvalCaseSchema.safeParse(d.data());
    if (r.success) out.push(r.data);
    else console.warn(`skipping ai_coach_eval_cases/${d.id}: ${r.error.issues[0]?.message}`);
  }
  return out;
}

function liveModel(): CallModel {
  const client = new Anthropic();
  return async (params, onText) => {
    const s = client.messages.stream(params);
    s.on('text', (delta) => onText(delta));
    return s.finalMessage();
  };
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

export function formatTable(reports: EvalCaseReport[]): string {
  const lines = [`${pad('case', 30)} ${pad('result', 6)} ${pad('cost', 9)} failed assertions`];
  for (const r of reports) {
    const failed = r.error ? `ERROR ${r.error}` : r.assertions.filter((a) => !a.pass).map((a) => `${a.name}: ${a.detail}`).join(' | ');
    lines.push(`${pad(r.id, 30)} ${pad(r.pass ? 'PASS' : 'FAIL', 6)} ${pad(`$${r.costUsd.toFixed(4)}`, 9)} ${failed}`);
  }
  const passed = reports.filter((r) => r.pass).length;
  const cost = reports.reduce((s, r) => s + r.costUsd, 0);
  lines.push('');
  lines.push(`${passed}/${reports.length} passed · total cost $${cost.toFixed(4)}`);
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.live && !process.env.ANTHROPIC_API_KEY) {
    console.error('--live needs ANTHROPIC_API_KEY');
    process.exit(2);
  }
  let cases = loadFixtureCases();
  if (args.firestore) cases = [...cases, ...(await loadFirestoreCases())];
  if (args.filter) cases = cases.filter((c) => c.id.includes(args.filter!));
  if (cases.length === 0) {
    console.error('no eval cases found');
    process.exit(2);
  }

  let simulate: SimulateWorkout = stubWorkoutGenerator;
  if (args.generator === 'offline') {
    const mod = await import('./ai-coach-evals/offline-generator');
    simulate = mod.offlineWorkoutGenerator;
  }
  const model = process.env.AI_MODEL_FAST?.trim() || AI_MODEL_DEFAULTS.fast;
  console.log(`mode: ${args.live ? `LIVE (${model})` : 'mock model'} · generator: ${args.generator} · ${cases.length} case(s)\n`);

  const reports: EvalCaseReport[] = [];
  for (const c of cases) {
    const callModel = args.live ? liveModel() : scriptedMockModel(c);
    reports.push(await runEvalCase(c, { callModel, model, simulateWorkout: simulate }));
  }
  console.log(formatTable(reports));
  if (args.live) {
    for (const r of reports.filter((x) => !x.pass)) console.log(`\n── ${r.id}\n${r.run.finalText}`);
  }
  if (args.json) fs.writeFileSync(args.json, JSON.stringify(reports, null, 2));
  process.exit(reports.every((r) => r.pass) ? 0 : 1);
}

if (process.argv[1] && /ai-coach-evals\.ts$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(2);
  });
}
