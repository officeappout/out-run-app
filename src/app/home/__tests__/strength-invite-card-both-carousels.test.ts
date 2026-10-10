import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

/**
 * Regression — G8.2 (Sderot field test, 10.10.2026): after completing ANY
 * workout (including a no-questionnaire combined-route one), home switches
 * from the pre-workout carousel to the post-workout one — and the
 * "complete the strength questionnaire" invite card (AddStrengthProgramCard)
 * only ever existed in the pre-workout carousel's items array, so it vanished
 * for the rest of the day the instant a workout completed.
 *
 * Root cause confirmed via git history: the card rendered unconditionally
 * (commit c450945, 19.09.2026) until a same-day refactor (146cd836) moved it
 * into the pre-workout-only sentinel mechanism with no equivalent added to
 * the post-workout carousel.
 *
 * Source-level, not a render test — no jsdom/component harness in this repo
 * (vitest.config.ts: "node" env only), same convention as
 * hybrid-overview-screen-design-unification.test.ts.
 */

const pagePath = fileURLToPath(new URL('../page.tsx', import.meta.url));
const pageSrc = readFileSync(pagePath, 'utf8');

describe('home/page.tsx — strength-invite sentinel is shared by both carousels, not just pre-workout', () => {
  it('defines the sentinel exactly ONCE, at component scope (not duplicated per carousel)', () => {
    const defCount = pageSrc.split("const STRENGTH_INVITE_CARD_ID = 'strength-invite-card';").length - 1;
    expect(defCount).toBe(1);
  });

  it('the shared sentinel is defined before BOTH carousel blocks use it', () => {
    const defIdx = pageSrc.indexOf("const STRENGTH_INVITE_CARD_ID = 'strength-invite-card';");
    const preWorkoutUseIdx = pageSrc.indexOf('[{ id: STRENGTH_INVITE_CARD_ID }, ...readyPreWorkoutSuggestions]');
    const postWorkoutUseIdx = pageSrc.indexOf('[{ id: STRENGTH_INVITE_CARD_ID }, ...postWorkoutSuggestions]');
    expect(defIdx).toBeGreaterThan(-1);
    expect(preWorkoutUseIdx).toBeGreaterThan(-1);
    expect(postWorkoutUseIdx).toBeGreaterThan(-1);
    expect(defIdx).toBeLessThan(preWorkoutUseIdx);
    expect(defIdx).toBeLessThan(postWorkoutUseIdx);
  });

  it('the post-workout carousel renders AddStrengthProgramCard for the sentinel item, same as pre-workout', () => {
    const occurrences = pageSrc.split('<AddStrengthProgramCard profile={profile} />').length - 1;
    // One for the pre-workout branch, one for the post-workout branch.
    expect(occurrences).toBe(2);
  });

  it('the post-workout carousel still falls through to PostWorkoutCardRenderer for real suggestions', () => {
    expect(pageSrc).toContain('isStrengthInviteCarouselItem(s) ? (');
    expect(pageSrc).toContain('<PostWorkoutCardRenderer');
  });
});
