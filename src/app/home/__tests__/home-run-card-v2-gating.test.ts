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
    expect(pageSrc).toMatch(/if \(isRunPlanCarouselItem\(item\) \|\| isProgramSlideCarouselItem\(item\) \|\| isWalkCarouselItem\(item\) \|\| isProgramStartCarouselItem\(item\)\) return;\s*if \(!isStrengthInviteCarouselItem\(item\)\) handlePreWorkoutSettle\(item\);/);
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
    // Owner 20.10.2026: each start card is its own slide (placeProgramSlides), in both carousels.
    expect(pageSrc).toContain('placeProgramSlides<typeof withWalk[number]>(withWalk, programSlide.plan, programSlideItems)');
    expect(pageSrc).toMatch(/featureFlags\.enableHomeV2\s*\?\s*placeProgramSlides<[^>]*>\(postWorkoutBase, programSlide\.plan, programSlideItems\)/);
    expect(pageSrc).toContain('programStartSlide(programStartTrackOf(s.id)!)');
    // postWorkoutItems: the v2 next-up order; flag off it IS postWorkoutSuggestions.
    expect(pageSrc).toMatch(/const postWorkoutItems = postWorkoutSuggestions && featureFlags\.enableHomeV2\s*\?[\s\S]*?:\s*postWorkoutSuggestions;/);
  });

  it('the program slide falls back to standalone under the strip when no carousel hosts it', () => {
    expect(pageSrc).toContain('const programSurface = resolveProgramSlideSurface({');
    // A start plan on its own = the start cards' own carousel; otherwise the standalone slide.
    expect(pageSrc).toContain("const programStandalone = programSurface === 'standalone' && programSlide.plan.mode === 'start' ? (");
    expect(pageSrc).toContain(") : programSurface === 'standalone' ? (");
    expect(pageSrc).toContain('<>{calmCard}{programStandalone}{content}</>');
    // Flag off: plan 'none' → no standalone, the slot renders `content` exactly as before.
    expect(pageSrc).toMatch(/calmCard \|\| programStandalone\s*\?[\s\S]*?:\s*content;/);
  });

  it('new user before the first workout: only the start slides — no generated workout (owner 20.10.2026)', () => {
    expect(pageSrc).toContain('const startOnlyToday = newUserHome.startOnly && isViewingToday;');
    expect(pageSrc).toMatch(/const readyPreWorkoutSuggestions = \(\s*HOME_PRE_WORKOUT_SUGGESTION_CAROUSEL_ENABLED\s*&& !startOnlyToday/);
    expect(pageSrc).toContain(') : startOnlyToday ? null : viewingFutureV2 ? (');
  });

  it('after a workout (v2): top-up rule, next-run card, runs-only week', () => {
    expect(pageSrc).toContain('applyStrengthTopUp(dropStepsDuplicate(postWorkoutSuggestions, shortWalkShown), strengthTopUp');
    expect(pageSrc).toContain('const nextRunCardShown = !!nextUp && nextRunCardDue({');
    expect(pageSrc).toContain("titleOverride={strengthTopUp.mode === 'top-up' && s.generatorId === 'partial-completion' ? topUpTitleHe(strengthTopUp.remainingSets) : undefined}");
    expect(pageSrc).toContain('...(topUpSets > 0 ? { dailyStrengthTopUpSets: topUpSets } : {}),');
    // Flag off: the post carousel keeps its own gate and list.
    expect(pageSrc).toContain('(featureFlags.enableHomeV2 ? postWorkoutHasCards : postWorkoutCarouselReady)');
  });

  it('the strength-mode strip run overlay is gated on the flag', () => {
    expect(pageSrc).toMatch(/const runOverlayDays = featureFlags\.enableHomeV2 && hasStrengthProgram && homeRun\.hasRunningPlan && !isRunningMode/);
    expect(pageSrc).toContain('runOverlayDays={runOverlayDays}');
  });
});
