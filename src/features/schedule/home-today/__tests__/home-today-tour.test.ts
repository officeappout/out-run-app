/** The home tour from today's cards (first-run-tour.ts homeTourFromTodaySteps); flag off = the old steps. */
import { describe, expect, it } from 'vitest';
import { FIRST_RUN_COACH, firstRunTourSteps, presentSteps } from '@/features/user/onboarding/services/first-run-tour';

describe('home tour from today', () => {
  it('no context: the steps as before', () => {
    expect(firstRunTourSteps('home', 'male').map((s) => s.target)).toEqual([
      FIRST_RUN_COACH.homeWorkout, FIRST_RUN_COACH.homePlus, FIRST_RUN_COACH.homeWeek,
    ]);
    expect(firstRunTourSteps('home', 'male', { homeToday: null })[0].target).toBe(FIRST_RUN_COACH.homeWorkout);
  });

  it('strength day: finger on "להתאמן עכשיו", then + and the map', () => {
    const steps = firstRunTourSteps('home', 'male', { homeToday: { strengthToday: true, optionalMinutes: 8, next: null } });
    expect(steps.map((s) => s.target)).toEqual([FIRST_RUN_COACH.homeTodayTrain, FIRST_RUN_COACH.homePlus, FIRST_RUN_COACH.homeNavMap]);
    expect(steps[0].finger).toBe(true);
    expect(steps[0].title).toBe('הכרטיס הראשון שלך להיום');
    // done already: no train button, the bubble falls back to the cards.
    const shown = presentSteps(steps, (t) => t !== FIRST_RUN_COACH.homeTodayTrain);
    expect(shown[0].target).toBe(FIRST_RUN_COACH.homeToday);
  });

  it('rest day: the steps card, the next workout in the strip, then + and the map', () => {
    const steps = firstRunTourSteps('home', 'female', { homeToday: { strengthToday: false, optionalMinutes: 8, next: { dow: 2, time: '18:00' } } });
    expect(steps.map((s) => s.target)).toEqual([
      FIRST_RUN_COACH.homeTodaySteps, FIRST_RUN_COACH.homeWeek, FIRST_RUN_COACH.homePlus, FIRST_RUN_COACH.homeNavMap,
    ]);
    expect(steps[0].text).toBe('היום אין אימון כוח, אבל אפשר לסגור צעדים או 8 דק׳ בטן ולהדליק להבה');
    expect(steps[1].text).toBe('האימון הבא שלך: יום שלישי ב-18:00');
    const noTime = firstRunTourSteps('home', null, { homeToday: { strengthToday: false, optionalMinutes: 8, next: { dow: 0, time: null } } });
    expect(noTime[1].text).toBe('האימון הבא שלך: יום ראשון');
    const noNext = firstRunTourSteps('home', null, { homeToday: { strengthToday: false, optionalMinutes: 8, next: null } });
    expect(noNext.map((s) => s.target)).not.toContain(FIRST_RUN_COACH.homeWeek);
    for (const s of [...steps, ...noTime]) expect(`${s.title} ${s.text}`).not.toContain('—');
  });
});
