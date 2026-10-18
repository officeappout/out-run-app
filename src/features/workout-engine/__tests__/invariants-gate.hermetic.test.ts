/**
 * Workout Invariants Gate — hermetic CI subset (2026-10-18).
 *
 * Runs the 40 fixed entry-point scenarios of tests/invariants/entry-points.ts
 * (home trio, builder body-area chips, AI chat generate_workout mapping, short
 * 10/15-minute sessions, park machines) against the frozen corpus in
 * tests/invariants/hermetic/corpus, through the stubbed Firestore (read-only
 * replay, every write a no-op, no network), and checks the five hard invariants
 * of tests/invariants/hard-invariants.ts:
 *   H1 gear truth · H2 body-area focus · H3 min main exercises for the duration ·
 *   H4 no exercise above user level +3 · H5 no test items.
 *
 * RATCHET, not a wish list: main does not satisfy every invariant today (see
 * docs/workout-engine/05-BENCHMARK.md, 2026-10-18). Known violations live in
 * tests/invariants/hard-invariants.baseline.json; the test FAILS on any violation
 * that is not in the baseline (a regression) and logs the ones that disappeared
 * (a fix — shrink the baseline with UPDATE_HARD_BASELINE=1 npx vitest run <this file>).
 * Also part of `npm run test:invariants` (tests/invariants/runner.ts, group H).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@/lib/firebase', () => import('../../../../tests/invariants/hermetic/firebase.stub'));
vi.mock('firebase/firestore', () => import('../../../../tests/invariants/hermetic/firestore.stub'));

import { ciMatrix, runScenario, mulberry32 } from '../../../../tests/invariants/entry-points';
import { checkHardInvariants, type HardId } from '../../../../tests/invariants/hard-invariants';

const BASELINE_PATH = join(process.cwd(), 'tests/invariants/hard-invariants.baseline.json');
const FIXED_NOW = new Date('2026-10-18T07:30:00+03:00');

type Observed = Record<string, HardId[]>;

describe('workout invariants gate (hermetic CI subset)', () => {
  const quiet: Record<string, unknown> = {};
  beforeAll(() => {
    process.env.TZ = 'Asia/Jerusalem';
    process.env.WORKOUT_ENGINE_FIXED_SHUFFLE_SEED = '42';
    vi.useFakeTimers({ now: FIXED_NOW, toFake: ['Date'] });
    globalThis.fetch = (async (u: unknown) => { throw new Error(`network disabled in gate: ${String(u).slice(0, 60)}`); }) as typeof fetch;
    for (const k of ['log', 'warn', 'info', 'debug', 'group', 'groupCollapsed', 'groupEnd', 'table', 'error'] as const) {
      quiet[k] = console[k]; (console as unknown as Record<string, unknown>)[k] = () => {};
    }
  });
  afterAll(() => {
    vi.useRealTimers();
    for (const [k, v] of Object.entries(quiet)) (console as unknown as Record<string, unknown>)[k] = v;
  });

  it('no NEW hard-invariant violation vs the baseline, 0 Firestore writes', async () => {
    const realRandom = Math.random;
    const observed: Observed = {};
    const errors: string[] = [];
    for (const s of ciMatrix()) {
      Math.random = mulberry32(42);
      try {
        for (const r of await runScenario(s)) {
          const ids = Array.from(new Set(checkHardInvariants(r.workout, r.ctx).map(v => v.id))).sort();
          observed[`${s.id}#b${r.bolt}`] = ids;
        }
      } catch (e) {
        errors.push(`${s.id}: ${(e as Error)?.message}`);
      }
    }
    Math.random = realRandom;

    const fsLog = ((globalThis as Record<string, unknown>).__HERMETIC_FS_LOG ?? []) as { op: string; path: string }[];
    expect(fsLog.filter(l => l.op.startsWith('WRITE')), 'hermetic: no Firestore write may be attempted').toEqual([]);
    expect(fsLog.some(l => l.op === 'read'), 'hermetic stub is live (the corpus was read)').toBe(true);
    expect(errors, 'every scenario generates without throwing').toEqual([]);
    expect(Object.keys(observed).length).toBeGreaterThanOrEqual(40);

    if (process.env.UPDATE_HARD_BASELINE === '1' || !existsSync(BASELINE_PATH)) {
      writeFileSync(BASELINE_PATH, `${JSON.stringify(observed, null, 1)}\n`);
      return;
    }
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Observed;
    const regressions: string[] = [];
    const fixed: string[] = [];
    for (const [key, ids] of Object.entries(observed)) {
      const known = new Set(baseline[key] ?? []);
      for (const id of ids) if (!known.has(id)) regressions.push(`${key}: ${id}`);
      for (const id of Array.from(known)) if (!ids.includes(id as HardId)) fixed.push(`${key}: ${id}`);
    }
    if (fixed.length) (quiet.info as (...a: unknown[]) => void)?.(`[invariants-gate] ${fixed.length} known violation(s) no longer occur — shrink the baseline (UPDATE_HARD_BASELINE=1):\n  ${fixed.slice(0, 20).join('\n  ')}`);
    expect(regressions, 'new hard-invariant violations (not in tests/invariants/hard-invariants.baseline.json)').toEqual([]);
  });
});
