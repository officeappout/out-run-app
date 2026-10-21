/**
 * Weekly-schedule / policy / walk-plan invariants (enable_home_v2, 21.10.2026) — pure.
 *
 * tests/invariants/v2/week-invariants.ts grades engine v2 on the 33 schedule-combos
 * fixtures (+ a Saturday-unmarked variant), the recommendation policy over level × goals ×
 * days, and the walk plan over goal × comfort × steps × audience × days:
 *   W1 Saturday off unless marked · W1b default pool without Saturday stays valid · W2 long run
 *   on the preferred day · W3 no heavy legs the day before a quality / long run · W4 strength
 *   count = requested (or explained) · W5 walk caps / WHO · P1 health_cap ≤ 3 · P2 6 days → PPL ·
 *   P3 beginner 5+ days → 3 + movement · P4 ≤ days · P5 policy = owner table · P6 profile path =
 *   signals path · K1–K5 walk plan bounds.
 *
 * RATCHET: failing rows (`id:check`) must be listed in tests/invariants/v2/week-invariants.baseline.json;
 * a new one fails. Soft rows (warn) are only reported by scripts/generator-qa.ts --full.
 *   UPDATE_WEEK_BASELINE=1 npx vitest run src/features/schedule/engine-v2/__tests__/week-invariants.test.ts
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@/lib/firebase', () => import('../../../../../tests/invariants/hermetic/firebase.stub'));
vi.mock('firebase/firestore', () => import('../../../../../tests/invariants/hermetic/firestore.stub'));

import { runWeekMatrix, weekFailureKeys } from '../../../../../tests/invariants/v2/week-invariants';

const BASELINE_PATH = join(process.cwd(), 'tests/invariants/v2/week-invariants.baseline.json');

describe('weekly schedule / policy / walk-plan invariants (ratchet)', () => {
  const { rows, summary } = runWeekMatrix();

  it('covers the fixtures, the policy grid and the walk grid', () => {
    expect(summary.perCheck.W1?.n ?? 0).toBeGreaterThanOrEqual(28);
    expect(summary.perCheck.P5?.n ?? 0).toBeGreaterThanOrEqual(300);
    expect(summary.perCheck.K2?.n ?? 0).toBeGreaterThanOrEqual(500);
  });

  it('no NEW failing row vs the baseline', () => {
    const failing = weekFailureKeys(rows);
    if (process.env.UPDATE_WEEK_BASELINE === '1' || !existsSync(BASELINE_PATH)) {
      writeFileSync(BASELINE_PATH, `${JSON.stringify(failing, null, 1)}\n`);
      return;
    }
    const known = new Set(JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as string[]);
    const fresh = failing.filter((k) => !known.has(k));
    const details = rows.filter((r) => r.grade === 'fail' && fresh.includes(`${r.id}:${r.check}`)).map((r) => `${r.id}:${r.check} ${r.detail}`);
    expect(details, 'new weekly invariant failures (not in tests/invariants/v2/week-invariants.baseline.json)').toEqual([]);
  });
});
