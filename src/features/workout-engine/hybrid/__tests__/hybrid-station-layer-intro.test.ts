import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

/**
 * Regression — G3.1 (Sderot field test, 10.10.2026): first-timers dropped
 * into the live map with no orientation. The "הגעתי לתחנה" approach CTA was
 * ALREADY correctly gated to the approach window (confirmed pre-existing,
 * commit d38c2f1c, 24.09.2026) — the actual gap was the missing start-of-walk
 * intro, now added as a one-time toast.
 *
 * Source-level, not a render test — this repo's vitest cannot import .tsx
 * files at all (see [[vitest-node-only-no-jsdom]]).
 */

const srcPath = fileURLToPath(new URL('../HybridStationLayer.tsx', import.meta.url));
const src = readFileSync(srcPath, 'utf8');

describe('HybridStationLayer — start-of-walk intro', () => {
  it('fires via a true one-shot ref, not re-shown on a later leg', () => {
    expect(src).toContain('introShownRef');
    expect(src).toContain('if (introShownRef.current) return;');
    expect(src).toContain('introShownRef.current = true;');
  });

  it('only fires on an aerobic leg that is neither the final leg nor already in the approach window', () => {
    expect(src).toContain("if (phase !== 'aerobic' || isFinalLeg || approaching || upcomingStation == null) return;");
  });

  it('hides immediately once the real approach CTA takes over — the two are never shown together', () => {
    expect(src).toMatch(/if \(approaching\) setShowIntro\(false\);/);
  });

  it('auto-hides on its own after a bounded time even if the user never gets close', () => {
    expect(src).toContain('INTRO_AUTO_HIDE_MS');
    expect(src).toContain('setTimeout(() => setShowIntro(false), INTRO_AUTO_HIDE_MS)');
  });

  it('renders the exact requested copy, with a real distance when available', () => {
    expect(src).toContain('🚶 התחל ללכת');
    expect(src).toContain('— בעוד {formatApproxDistance(distanceToStationM)} יש גינת כושר');
  });

  it('the pre-existing approach-CTA gating is untouched (still gated, not a regression introduced by this change)', () => {
    expect(src).toContain("if (phase === 'aerobic' && (isFinalLeg || approaching)) {");
    expect(src).toContain("'📍 הגעתי לתחנה'");
  });
});
