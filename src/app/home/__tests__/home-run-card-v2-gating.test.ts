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
  it('the slot is resolved for every runner (ungated fix, 19.10.2026)', () => {
    expect(pageSrc).toContain('useHomeRunSlot(profile, true, hasStrengthProgram, featureFlags.enableHomeV2)');
    expect(hookSrc).toContain('if (!enabled || !hasRunningPlan) return { slot: null');
  });

  it('the run slide is only added when the slot lands in the carousel', () => {
    expect(pageSrc).toContain('placeRunCard(base, { id: RUN_PLAN_CARD_ID }, homeRun.slot.position)');
    expect(pageSrc).toMatch(/const withRun = runSlotSurface === 'carousel' && homeRun\.slot\s*\?\s*placeRunCard/);
  });

  it('the surface knows the flag (flag off → carousel only, no standalone card)', () => {
    expect(pageSrc).toMatch(/resolvedDashboardMode,\s*featureFlags\.enableHomeV2,\s*\);/);
  });

  it('flag off renders the legacy NextRunWorkoutCard as the slide; flag on the v2 card', () => {
    expect(pageSrc).toMatch(/isRunPlanCarouselItem\(s\) && homeRun\.slot && !featureFlags\.enableHomeV2 \? \([\s\S]*?<NextRunWorkoutCard/);
    expect(pageSrc).toMatch(/: isRunPlanCarouselItem\(s\) && homeRun\.slot \? \(\s*<HomeRunCarouselCard/);
  });

  it('no second run card: StatsOverview (which mounts NextRunWorkoutCard in RUNNING) is only the non-carousel fallback', () => {
    const carouselAt = pageSrc.indexOf('const content = readyPreWorkoutSuggestions ? (');
    const statsAt = pageSrc.indexOf('<StatsOverview', carouselAt);
    const loadingAt = pageSrc.indexOf(': preWorkoutSuggestionsLoading ? (', carouselAt);
    expect(carouselAt).toBeGreaterThan(-1);
    expect(loadingAt).toBeGreaterThan(carouselAt);
    expect(statsAt).toBeGreaterThan(loadingAt);
  });

  it('the run slide never reaches handlePreWorkoutSettle', () => {
    expect(pageSrc).toMatch(/if \(isRunPlanCarouselItem\(item\) \|\| isProgramSlideCarouselItem\(item\) \|\| isWalkCarouselItem\(item\)\) return;\s*if \(!isStrengthInviteCarouselItem\(item\)\) handlePreWorkoutSettle\(item\);/);
  });

  it('the running-only week strip is gated on the flag', () => {
    expect(pageSrc).toContain('const runStripOnly = featureFlags.enableHomeV2 && !hasStrengthProgram && homeRun.hasRunningPlan;');
    expect(pageSrc).toContain('{(hasStrengthProgram || runStripOnly || pickProgramStrip) && (');
    expect(pageSrc).toContain("const pickProgramStrip = featureFlags.enableHomeV2 && programSlide.plan.mode === 'start';");
  });

  it('the standalone run card only renders off the v2 slot, beside the StatsOverview fallback', () => {
    expect(pageSrc).toContain('resolveRunSlotSurface(\n                  homeRun.slot,');
    expect(pageSrc).toContain("const standaloneRunCard = runSlotSurface === 'standalone' && homeRun.slot ? (");
    expect(pageSrc).toMatch(/\{standaloneRunCard\}\s*<StatsOverview/);
  });

  it('v2 program slide (start pair / add card) replaces the strength invite only under the flag', () => {
    expect(pageSrc).toContain('useProgramSlide(profile, hasStrengthProgram, featureFlags.enableHomeV2)');
    expect(pageSrc).toContain('!hasStrengthProgram && !featureFlags.enableHomeV2');
    // The walker's walk card (enable_home_v2) is placed between the run card and the program slide.
    expect(pageSrc).toContain('placeProgramSlide(withWalk, { id: PROGRAM_SLIDE_ID }, carouselProgramPlan)');
    // The new user's start rows take the slide out of the carousels; otherwise it is programSlide.plan.
    expect(pageSrc).toContain("const carouselProgramPlan: typeof programSlide.plan = newUserHome.startRows ? { mode: 'none' } : programSlide.plan;");
    expect(pageSrc).toMatch(/featureFlags\.enableHomeV2\s*\?\s*placeProgramSlide<[^>]*>\(postWorkoutItems/);
    // postWorkoutItems: the v2 next-up order; flag off it IS postWorkoutSuggestions.
    expect(pageSrc).toMatch(/const postWorkoutItems = postWorkoutSuggestions && featureFlags\.enableHomeV2\s*\?[\s\S]*?:\s*postWorkoutSuggestions;/);
  });

  it('the program slide falls back to standalone under the strip when no carousel hosts it', () => {
    expect(pageSrc).toContain('const programSurface = resolveProgramSlideSurface({');
    // A new user's start rows (enable_home_v2) come first; otherwise the standalone slide.
    expect(pageSrc).toContain("const programStandalone = newUserHome.startRows && programSlide.plan.mode === 'start' ? (");
    expect(pageSrc).toContain(") : programSurface === 'standalone' ? (");
    expect(pageSrc).toContain('<>{calmCard}{programStandalone}{content}</>');
    // Flag off: plan 'none' → no standalone, the slot renders `content` exactly as before.
    expect(pageSrc).toMatch(/calmCard \|\| programStandalone\s*\?[\s\S]*?:\s*content;/);
  });

  it('the strength-mode strip run overlay is gated on the flag', () => {
    expect(pageSrc).toMatch(/const runOverlayDays = featureFlags\.enableHomeV2 && hasStrengthProgram && homeRun\.hasRunningPlan && !isRunningMode/);
    expect(pageSrc).toContain('runOverlayDays={runOverlayDays}');
  });
});
