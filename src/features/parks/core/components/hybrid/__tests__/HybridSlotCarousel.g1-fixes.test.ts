import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

/**
 * Regression — G1.1 (swipe affordance) + G1.3 (CTA copy), Sderot field test
 * (10.10.2026), first-timer blockers wave. Both live in the MAP screen's
 * "מה עושים היום?" slot carousel (HybridSlotCarousel.tsx) — NOT the home
 * screen's SuggestionCarousel, which already uses correct copy and is
 * unaffected by either fix.
 *
 * Source-level, not a render test — this repo's vitest cannot import .tsx
 * files at all (see [[vitest-node-only-no-jsdom]]'s 10.10.2026 update).
 */

const srcPath = fileURLToPath(new URL('../HybridSlotCarousel.tsx', import.meta.url));
const src = readFileSync(srcPath, 'utf8');

describe('G1.3 — "צא לדרך" (implies immediate start) replaced with "צפה במסלול" (view)', () => {
  it('no non-aerobic_quick CTA still says צא לדרך as an active string', () => {
    // The old string may still appear inside an explanatory comment — only assert
    // it is gone from the two real ternary expressions that render the CTA text.
    expect(src).not.toMatch(/: 'צא לדרך'/);
  });

  it('both CTA render sites (inline ctaContent + the fallback button) now say צפה במסלול', () => {
    const occurrences = src.split("'יוצאים מיד' : 'צפה במסלול'").length - 1;
    expect(occurrences).toBe(2);
  });

  it('the aerobic_quick immediate-start label is untouched — this fix is type-specific, not a global replace', () => {
    expect(src).toContain("'יוצאים מיד'");
  });
});

describe('G1.1 — wider card peek + one-time swipe-hint nudge', () => {
  it('CARD_VW is narrowed to 78 (reusing the pre-existing legacy value) for every mode, not just 85 when unified', () => {
    expect(src).toMatch(/const CARD_VW = 78;/);
    expect(src).not.toMatch(/const CARD_VW = UNIFIED_ROUTE_CARDS_ENABLED \? 85/);
  });

  it('a durable "seen it once" pref gates a one-time nudge, reusing the existing onboardingPrefs mechanism', () => {
    expect(src).toContain("import { getOnboardingPref, setOnboardingPref } from '@/lib/onboardingPrefs';");
    expect(src).toContain('SWIPE_HINT_SEEN_KEY');
    expect(src).toContain('getOnboardingPref(SWIPE_HINT_SEEN_KEY)');
    expect(src).toContain("setOnboardingPref(SWIPE_HINT_SEEN_KEY, '1')");
  });

  it('the nudge is a keyframe sequence paired with a tween transition, not a spring (springs cannot animate a 3-point sequence)', () => {
    expect(src).toContain('{ x: [trackX, trackX - 18, trackX] }');
    expect(src).toMatch(/duration:\s*0\.6,\s*ease:\s*'easeInOut'/);
  });

  it('the nudge only fires when there is a second card to reveal, and only once (onAnimationComplete persists the pref)', () => {
    expect(src).toContain('!swipeHintPlayed && slots.length > 1');
    expect(src).toContain('onAnimationComplete={() => {');
  });
});
