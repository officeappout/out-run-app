/**
 * scripts/generator-qa.ts — one entry point for the generator QA bench.
 *
 *   npx tsx scripts/generator-qa.ts --full [--seed N]   every entry point, ~330 scenarios + coach references
 *   npx tsx scripts/generator-qa.ts --ci                the 40-scenario hard-invariant subset (+ vitest ratchet)
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

let code = run(tsx, ['--tsconfig', 'tests/invariants/hermetic/tsconfig.json', 'scripts/audit/build-entrypoints-bench.ts', ...args.filter(a => a !== '--full')]);
if (ci && code === 0) code = run('npx', ['vitest', 'run', 'src/features/workout-engine/__tests__/invariants-gate.hermetic.test.ts']);
process.exit(code);
