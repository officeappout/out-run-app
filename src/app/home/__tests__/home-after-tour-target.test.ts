import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { FIRST_RUN_COACH, firstRunTourSteps } from '@/features/user/onboarding/services/first-run-tour';

/**
 * Pilot AG7 (enable_home_after_v1): the home tour's "today's workout" step spotlit the push re-ask card
 * ("turn on workout reminders") because its target was the wrapper that also holds the quiet cards above
 * the workout. Under the flag the target is the workout content itself, and after the workout the
 * after-workout carousel. Source-level (node env), same convention as home-run-card-v2-gating.
 */
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const pageSrc = read('../page.tsx');
const tourSrc = read('../../../features/user/onboarding/components/FirstRunTour.tsx');
const coachTargets = pageSrc.match(/data-coach=\{[^}]*FIRST_RUN_COACH\.homeWorkout[^}]*\}/g) ?? [];

describe('home tour target (AG7)', () => {
  it('the wrapper with the quiet cards is the target only while the flag is off', () => {
    expect(pageSrc).toContain('data-coach={homeAfterOn ? undefined : FIRST_RUN_COACH.homeWorkout}');
  });

  it('under the flag, before the workout: the workout content alone, after the quiet cards', () => {
    expect(pageSrc).toContain('const tourContent = homeAfterOn && !homeAfter ? <div data-coach={FIRST_RUN_COACH.homeWorkout}>{content}</div> : content;');
    expect(pageSrc).toContain('{calmCard}{firstWeekCard}{pushReAskCard}{programStandalone}{tourContent}');
  });

  it('after the workout: the after-workout carousel', () => {
    expect(pageSrc).toMatch(/data-home-after\s+data-coach=\{FIRST_RUN_COACH\.homeWorkout\}/);
    expect(pageSrc).toContain('afterWorkout={homeAfter}');
  });

  it('exactly those three places carry the target', () => {
    expect(coachTargets).toHaveLength(3);
  });

  it('the after-workout first step: same target, the carousel text, no tap finger', () => {
    const [first] = firstRunTourSteps('home', 'male', { afterWorkout: true });
    expect(first).toEqual({ target: FIRST_RUN_COACH.homeWorkout, title: 'מה עוד להיום', text: 'כל מה שנשאר להיום כאן. מחליקים בין הכרטיסים, ובסוף מה שכבר בוצע' });
    expect(firstRunTourSteps('home', 'male')[0].text).toBe('כאן האימון של היום — לחיצה ומתחילים');
  });

  it('the tour writes nothing but its own seen flag (it never marks or dismisses a reminder)', () => {
    expect(tourSrc.match(/setOnboardingPref\(/g)).toHaveLength(1);
    expect(tourSrc).toContain('setOnboardingPref(firstRunTourSeenKey(tour, uid), reason)');
    expect(tourSrc).not.toMatch(/localStorage|sessionStorage|setDoc|updateDoc|dismiss/i);
  });
});
