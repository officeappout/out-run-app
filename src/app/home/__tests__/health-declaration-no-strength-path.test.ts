import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

/**
 * Regression — G8.1 (Sderot field test, 10.10.2026): a user who skips the
 * strength questionnaire must still be able to reach and submit the health
 * declaration before a workout. Root cause confirmed: handleHeroPress's
 * no-strength-program branch routed straight into /onboarding-new/
 * assessment-visual with NO interceptWorkoutStart call at all — the health
 * hard block (useRequiredSetup.ts) was only ever wired on the
 * `hasStrengthProgram` branch. Same gap existed in AddStrengthProgramCard's
 * own handleTap (used by both home carousels after the questionnaire is
 * skipped).
 *
 * Source-level, not a render test — this repo's vitest cannot import .tsx
 * files at all (see [[vitest-node-only-no-jsdom]]).
 */

const pagePath = fileURLToPath(new URL('../page.tsx', import.meta.url));
const pageSrc = readFileSync(pagePath, 'utf8');
const cardPath = fileURLToPath(new URL('../../../features/home/components/AddStrengthProgramCard.tsx', import.meta.url));
const cardSrc = readFileSync(cardPath, 'utf8');

describe('home/page.tsx — handleHeroPress no-strength branch now passes through the health gate', () => {
  it('wraps the assessment-visual navigation in interceptWorkoutStart, same as the hasStrengthProgram branch', () => {
    const elseIdx = pageSrc.indexOf("router.push('/onboarding-new/assessment-visual');");
    const interceptCallIdx = pageSrc.lastIndexOf('interceptWorkoutStart(() => {', elseIdx);
    expect(elseIdx).toBeGreaterThan(-1);
    expect(interceptCallIdx).toBeGreaterThan(-1);
    // The push call must be INSIDE the intercept's callback, not before it fires.
    expect(interceptCallIdx).toBeLessThan(elseIdx);
  });

  it('interceptWorkoutStart is now a dependency of handleHeroPress (added to the useCallback deps)', () => {
    expect(pageSrc).toMatch(/\[hasStrengthProgram, handleWorkoutGenerated, interceptWorkoutStart, isMapOnlyUser/);
  });

  it('both AddStrengthProgramCard render sites in the home carousels pass onNavigate wired to interceptWorkoutStart', () => {
    const occurrences = pageSrc.split("onNavigate={(navigate) => interceptWorkoutStart(navigate, 'strength')}").length - 1;
    expect(occurrences).toBe(2);
  });
});

describe('AddStrengthProgramCard — onNavigate is optional, non-workout-start callers are unaffected', () => {
  it('calls onNavigate when provided instead of navigating directly', () => {
    expect(cardSrc).toContain('if (onNavigate) onNavigate(navigate);');
    expect(cardSrc).toContain('else navigate();');
  });

  it('the prop is optional — a caller outside the workout-start flow (e.g. TrackedProgramsSection) keeps working unchanged', () => {
    expect(cardSrc).toMatch(/onNavigate\?:\s*\(navigate: \(\) => void\) => void;/);
  });
});
