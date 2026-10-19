import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolveSwipeNudge, SWIPE_HINT_V2 } from '../swipe-hint';
import { FLAG_DEFS } from '@/hooks/feature-flag-defs';

/** G1.1 (Sderot pilot) — carousel swipe affordance v2, behind `enable_carousel_swipe_hint`. */

const carousel = readFileSync(fileURLToPath(new URL('../HybridSlotCarousel.tsx', import.meta.url)), 'utf8');

describe('nudge decision', () => {
  it('flag off → v2 never plays (today\'s #207 nudge is decided inline, unchanged)', () => {
    expect(resolveSwipeNudge({ swipeHint: false, slotCount: 3, v1Played: false, v2Played: false })).toBe('none');
  });
  it('flag on → once per user, only when there is a second card', () => {
    expect(resolveSwipeNudge({ swipeHint: true, slotCount: 3, v1Played: true, v2Played: false })).toBe('v2');
    expect(resolveSwipeNudge({ swipeHint: true, slotCount: 3, v1Played: false, v2Played: true })).toBe('none');
    expect(resolveSwipeNudge({ swipeHint: true, slotCount: 1, v1Played: false, v2Played: false })).toBe('none');
  });
  it('v2 waits for the row to settle and moves further than #207\'s 18px', () => {
    expect(SWIPE_HINT_V2.delayS).toBeGreaterThan(0);
    expect(SWIPE_HINT_V2.offsetPx).toBeGreaterThan(18);
  });
});

describe('carousel wiring', () => {
  it('own seen-key in onboardingPrefs; burned on completion only when it played, and on the user\'s own swipe', () => {
    expect(carousel).toContain("const SWIPE_HINT_V2_SEEN_KEY = 'hybrid_slot_carousel_swipe_hint_v2_seen';");
    expect(carousel).toContain("setOnboardingPref(SWIPE_HINT_V2_SEEN_KEY, '1');");
    expect(carousel).toContain("if (nudge === 'v2') markHintV2Seen();");
  });
  it('wider peek only with the flag (72vw focused vs 80vw)', () => {
    expect(carousel).toContain('const CARD_VW_FOCUSED_HINT = 72;');
    expect(carousel).toContain('(swipeHint ? CARD_VW_FOCUSED_HINT : CARD_VW_FOCUSED)');
  });
  it('a peeking card\'s CTA only centres it — never starts "יוצאים מיד" by mistake (both card variants + the v2 planned-run card)', () => {
    expect(carousel.match(/if \(guardInactiveCta && !isActive\) \{ onFocusCard\?\.\(\); return; \}/g)?.length).toBe(3);
    expect(carousel).toContain('guardInactiveCta={swipeHint}');
  });
  it('flag off keeps #207 exactly (its strings are still there)', () => {
    expect(carousel).toContain('{ x: [trackX, trackX - 18, trackX] }');
    expect(carousel).toContain("{ duration: 0.6, ease: 'easeInOut' }");
  });
  it('DiscoverLayer passes the flag only after flags loaded', () => {
    const dl = readFileSync(fileURLToPath(new URL('../../../../../../app/map/layers/DiscoverLayer.tsx', import.meta.url)), 'utf8');
    expect(dl).toContain('swipeHint={!mapFlagsLoading && mapFeatureFlags.enableCarouselSwipeHint}');
  });
  it('fail-closed flag with an admin card', () => {
    expect(FLAG_DEFS.find((d) => d.firestoreKey === 'enable_carousel_swipe_hint')).toMatchObject({ defaultValue: false, superAdminValue: false });
    const admin = readFileSync(fileURLToPath(new URL('../../../../../../app/admin/system-settings/page.tsx', import.meta.url)), 'utf8');
    expect(admin).toContain("key: 'enable_carousel_swipe_hint'");
  });
});
