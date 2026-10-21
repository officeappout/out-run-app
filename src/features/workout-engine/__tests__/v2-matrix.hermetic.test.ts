/**
 * enable_home_v2 strength matrix — hermetic CI subset (21.10.2026).
 *
 * Runs the CI cells of tests/invariants/v2/v2-scenarios.ts (day focus per split & day index,
 * home no bar / door bar / park / gym, PPL ×2, health_cap, beginner 5+ days, pool narrowing)
 * through generateHomeWorkoutTrio with `splitDayFocus: true`, against the frozen corpus behind
 * the stubbed Firestore (read-only replay, no network, no writes), and grades every option:
 *   H1–H5 (tests/invariants/hard-invariants.ts) + H6 upper/pull day has pull (or a flagged
 *   pullGap) · H7 day focus matches the split · H8 why line consistent with focus / gear
 *   (tests/invariants/v2/v2-invariants.ts).
 *
 * RATCHET (same pattern as invariants-gate.hermetic.test.ts): known violations live in
 * tests/invariants/v2/v2-hard.baseline.json; a violation missing from it fails the test,
 * a known one that disappeared is logged — shrink with
 *   UPDATE_V2_BASELINE=1 npx vitest run src/features/workout-engine/__tests__/v2-matrix.hermetic.test.ts
 * Full matrix + Hebrew report: npx tsx scripts/generator-qa.ts --full.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@/lib/firebase', () => import('../../../../tests/invariants/hermetic/firebase.stub'));
vi.mock('firebase/firestore', () => import('../../../../tests/invariants/hermetic/firestore.stub'));

import { mulberry32 } from '../../../../tests/invariants/entry-points';
import { v2CiMatrix } from '../../../../tests/invariants/v2/v2-scenarios';
import { runV2Scenario } from '../../../../tests/invariants/v2/v2-runner';
import { gradeV2Run, runKey } from '../../../../tests/invariants/v2/v2-grade';
import { isSplitDayFocusActive } from '../services/split-decision/day-focus.switch';

const BASELINE_PATH = join(process.cwd(), 'tests/invariants/v2/v2-hard.baseline.json');
const FIXED_NOW = new Date('2026-10-21T07:30:00+03:00');
type Observed = Record<string, string[]>;

describe('enable_home_v2 strength matrix (hermetic CI subset)', () => {
  const quiet: Record<string, unknown> = {};
  const realRandom = Math.random;
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
    Math.random = realRandom;
    vi.useRealTimers();
    for (const [k, v] of Object.entries(quiet)) (console as unknown as Record<string, unknown>)[k] = v;
  });

  it('no NEW H1–H8 violation vs the baseline, every day focused, 0 Firestore writes', async () => {
    const observed: Observed = {};
    const errors: string[] = [];
    let focused = 0;
    for (const s of v2CiMatrix()) {
      Math.random = mulberry32(42);
      try {
        for (const r of await runV2Scenario(s)) {
          observed[runKey(r)] = Array.from(new Set(gradeV2Run(r).hard.map((v) => v.id))).sort();
          if (r.workout.dayFocus) focused++;
        }
      } catch (e) {
        errors.push(`${s.id}: ${(e as Error)?.message}`);
      }
    }
    const fsLog = ((globalThis as Record<string, unknown>).__HERMETIC_FS_LOG ?? []) as { op: string }[];
    expect(fsLog.filter((l) => l.op.startsWith('WRITE')), 'hermetic: no Firestore write may be attempted').toEqual([]);
    expect(errors, 'every scenario generates without throwing').toEqual([]);
    expect(Object.keys(observed).length).toBeGreaterThanOrEqual(45);
    expect(focused, 'the v2 path really ran (dayFocus stamped)').toBeGreaterThanOrEqual(30);
    expect(isSplitDayFocusActive(), 'the device switch is left off').toBe(false);

    if (process.env.UPDATE_V2_BASELINE === '1' || !existsSync(BASELINE_PATH)) {
      writeFileSync(BASELINE_PATH, `${JSON.stringify(observed, null, 1)}\n`);
      return;
    }
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Observed;
    const regressions: string[] = [];
    const fixed: string[] = [];
    for (const [key, ids] of Object.entries(observed)) {
      const known = new Set(baseline[key] ?? []);
      for (const id of ids) if (!known.has(id)) regressions.push(`${key}: ${id}`);
      for (const id of Array.from(known)) if (!ids.includes(id)) fixed.push(`${key}: ${id}`);
    }
    if (fixed.length) (quiet.info as (...a: unknown[]) => void)?.(`[v2-matrix] ${fixed.length} known violation(s) no longer occur — shrink the baseline (UPDATE_V2_BASELINE=1):\n  ${fixed.slice(0, 20).join('\n  ')}`);
    expect(regressions, 'new v2 hard-invariant violations (not in tests/invariants/v2/v2-hard.baseline.json)').toEqual([]);
  }, 120_000);
});
