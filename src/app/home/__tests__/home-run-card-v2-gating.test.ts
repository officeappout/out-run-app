import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

/**
 * audit-run-schedule §5 — today's run card in the daily carousel + the
 * running-only week strip are enable_home_v2 only. Source-level (node env,
 * no render harness), same convention as strength-invite-card-both-carousels.
 * The selection itself is unit-tested in features/home/utils/__tests__/home-run-slot.test.ts.
 */

const pageSrc = readFileSync(fileURLToPath(new URL('../page.tsx', import.meta.url)), 'utf8');
const hookSrc = readFileSync(
  fileURLToPath(new URL('../../../features/home/hooks/useHomeRunSlot.ts', import.meta.url)),
  'utf8',
);

describe('home/page.tsx — v2 run card wiring', () => {
  it('the slot is resolved with the home v2 flag', () => {
    expect(pageSrc).toContain('useHomeRunSlot(profile, featureFlags.enableHomeV2, hasStrengthProgram)');
    expect(hookSrc).toContain('if (!enabled || !hasRunningPlan) return { slot: null');
  });

  it('the run slide is only added when a slot exists (null with the flag off)', () => {
    expect(pageSrc).toContain('placeRunCard(base, { id: RUN_PLAN_CARD_ID }, homeRun.slot.position)');
    expect(pageSrc).toMatch(/return homeRun\.slot\s*\?\s*placeRunCard/);
  });

  it('the run slide never reaches handlePreWorkoutSettle', () => {
    expect(pageSrc).toMatch(/if \(isRunPlanCarouselItem\(item\)\) return;\s*if \(!isStrengthInviteCarouselItem\(item\)\) handlePreWorkoutSettle\(item\);/);
  });

  it('the running-only week strip is gated on the flag', () => {
    expect(pageSrc).toContain('const runStripOnly = featureFlags.enableHomeV2 && !hasStrengthProgram && homeRun.hasRunningPlan;');
    expect(pageSrc).toContain('{(hasStrengthProgram || runStripOnly) && (');
  });
});
