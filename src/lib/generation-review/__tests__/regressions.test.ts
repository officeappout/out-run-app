/**
 * Regression fixtures exported from /admin/generation-review ("הפוך לבדיקת רגרסיה") live in
 * ./regressions/*.json. Each one is a real (privacy-coarsened) session that a rule flagged:
 *   - the checker must keep flagging the stored output (`expect.firedOnCapture`), so a rule
 *     change can never silently stop catching a bug we already saw;
 *   - when a generator fix lands, add a test next to that generator that re-generates from the
 *     fixture's `input` and asserts `expect.mustNotFire` stays quiet.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { runInvariants } from '../invariants';
import type { RegressionFixture } from '../review/fixture-export';

const DIR = join(__dirname, 'regressions');
const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));

describe('generation-review regression fixtures', () => {
  it('the folder exists (fixtures are added from the admin panel)', () => {
    expect(Array.isArray(files)).toBe(true);
  });
  for (const file of files) {
    it(`${file}: the rules still catch it`, () => {
      const fx = JSON.parse(readFileSync(join(DIR, file), 'utf8')) as RegressionFixture;
      const fired = new Set(runInvariants({ type: fx.type, input: fx.input, output: fx.output }).map((f) => f.ruleId));
      for (const rule of fx.expect.firedOnCapture) expect(fired.has(rule), rule).toBe(true);
    });
  }
});
