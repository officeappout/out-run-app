/**
 * scripts/generator-qa.ts — one entry point for the generator QA bench.
 *
 *   npx tsx scripts/generator-qa.ts --full [--seed N]   every entry point, ~330 scenarios + coach references,
 *                                                       then the enable_home_v2 matrix (~205 scenarios: day focus,
 *                                                       equipment, PPL, health_cap, beginner 5+, top-up, hybrid,
 *                                                       route + stops) + the weekly / policy / walk invariants,
 *                                                       with a Hebrew summary table
 *   npx tsx scripts/generator-qa.ts --ci                the 40-scenario hard-invariant subset + the v2 CI subset
 *                                                       (+ the three vitest ratchets)
 *   --export-review                                     also write failing v2 cells as generation-review fixtures
 *                                                       (scripts/audit/out/v2-review-fixtures/, no LLM call)
 *
 * Always re-launches itself under tests/invariants/hermetic/tsconfig.json: the
 * generator graph imports '@/lib/firebase', which is hardcoded to PRODUCTION —
 * running it any other way would read (and could write) prod. See
 * docs/workout-engine/05-BENCHMARK.md (2026-10-18 section) and tests/invariants/README.md.
 */
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const ci = args.includes('--ci');
const env = { ...process.env, TZ: 'Asia/Jerusalem' };
const tsx = './node_modules/.bin/tsx';
const run = (cmd: string, a: string[]) => spawnSync(cmd, a, { stdio: 'inherit', env }).status ?? 1;

const hermetic = ['--tsconfig', 'tests/invariants/hermetic/tsconfig.json'];
const passOn = args.filter(a => a !== '--full' && a !== '--export-review');
let code = run(tsx, [...hermetic, 'scripts/audit/build-entrypoints-bench.ts', ...passOn]);
const v2 = run(tsx, [...hermetic, 'scripts/audit/build-v2-matrix-bench.ts', ...args.filter(a => a !== '--full')]);
if (code === 0) code = v2;
if (ci && code === 0) {
  code = run('npx', ['vitest', 'run',
    'src/features/workout-engine/__tests__/invariants-gate.hermetic.test.ts',
    'src/features/workout-engine/__tests__/v2-matrix.hermetic.test.ts',
    'src/features/schedule/engine-v2/__tests__/week-invariants.test.ts']);
}
process.exit(code);
