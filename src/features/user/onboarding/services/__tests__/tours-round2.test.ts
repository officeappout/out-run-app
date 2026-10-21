import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import {
  FIRST_RUN_COACH, firstRunTourSteps, homeWeekCoachTarget, leagueTabCoachTarget, presentSteps,
} from '../first-run-tour';
import { welcomeCta } from '@/features/workout-engine/hybrid/guided-station';

/** Tour fixes round 2 (21.10) — target selection found while drawing the tutorial boards. */

const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('home step 3 — the week strip only when a real week is shown', () => {
  it('pick-a-program strip carries no target → the step falls back to the map', () => {
    expect(homeWeekCoachTarget({ pickProgramStrip: true })).toBeUndefined();
    expect(homeWeekCoachTarget({ pickProgramStrip: false })).toBe(FIRST_RUN_COACH.homeWeek);
    const onScreen = new Set<string>([FIRST_RUN_COACH.homeWorkout, FIRST_RUN_COACH.homePlus, FIRST_RUN_COACH.homeNavMap]);
    const t = homeWeekCoachTarget({ pickProgramStrip: true });
    if (t) onScreen.add(t);
    const steps = presentSteps(firstRunTourSteps('home', 'male'), (x) => onScreen.has(x));
    expect(steps).toHaveLength(3);
    expect(steps[2].target).toBe(FIRST_RUN_COACH.homeNavMap);
  });
  it('the home page wires the strip through the helper', () => {
    expect(src('../../../../../app/home/page.tsx')).toContain('data-coach={homeWeekCoachTarget({ pickProgramStrip })}');
  });
});

describe('community step 2 — exists on the default "אישי" tab', () => {
  it('the "שכונות" tab carries the fallback target; other tabs none', () => {
    expect(leagueTabCoachTarget('neighborhoods')).toBe(FIRST_RUN_COACH.communityHoodsTab);
    expect(leagueTabCoachTarget('people')).toBeUndefined();
    expect(leagueTabCoachTarget('settlements')).toBeUndefined();
    expect(src('../../../../../app/community/_components/leagues/LeaguesTabV2.tsx')).toContain('data-coach={leagueTabCoachTarget(tab.id)}');
  });
  it('on "אישי" (no invite card) both steps still show, step 2 on the "שכונות" tab', () => {
    const steps = presentSteps(firstRunTourSteps('community', 'female'), (t) =>
      t === FIRST_RUN_COACH.communityLeague || t === FIRST_RUN_COACH.communityHoodsTab);
    expect(steps).toHaveLength(2);
    expect(steps[1].target).toBe(FIRST_RUN_COACH.communityHoodsTab);
    expect(steps[1].text).toContain('+50');
    expect(steps[1].text).not.toMatch(/[א-ת]\/[א-ת]/);
  });
  it('invite card on screen → step 2 points at it', () => {
    const steps = presentSteps(firstRunTourSteps('community', 'male'), () => true);
    expect(steps[1].target).toBe(FIRST_RUN_COACH.communityInvite);
  });
});

describe('player step 3 — "סיימתי" lands below the header', () => {
  it('the runner header is marked as an occluder; the progress bars live inside it', () => {
    const header = src('../../../../workout-engine/players/strength/components/RunnerHeader.tsx');
    expect(header).toContain('data-coach-occluder');
    expect(header.indexOf('data-coach-occluder')).toBeLessThan(header.indexOf('data-coach="player-progress"'));
  });
  it('CoachMarks scrolls entry targets clear of the header and clips the hole', () => {
    const cm = src('../../../../../components/ui/CoachMarks.tsx');
    expect(cm).toContain('scrollCoachTargetIntoView(el)');
    expect(cm).toContain('clipCoachBox(padded');
  });
});

describe('station CTA — neutral', () => {
  it('"מתחילים" for everyone', () => {
    for (const gen of ['male', 'female', 'other', null, undefined] as const) expect(welcomeCta(gen)).toBe('מתחילים');
  });
});
