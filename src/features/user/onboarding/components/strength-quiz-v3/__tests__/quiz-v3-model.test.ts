import { describe, expect, it } from 'vitest';
import {
  assessmentFill,
  easyStartIndex,
  neighbourSteps,
  moveSelection,
  progressRowItems,
  quizV3Back,
  skillIcon,
  sliderCards,
  startStepIndex,
  swipeDirection,
  transitionModel,
} from '../quiz-v3-model';

const FULL = ['push', 'pull', 'legs', 'core'];

describe('progressRowItems (progress icons row)', () => {
  it('current = the index, done before it, upcoming after', () => {
    expect(progressRowItems(FULL, 0).map((i) => i.state)).toEqual(['current', 'upcoming', 'upcoming', 'upcoming']);
    expect(progressRowItems(FULL, 2).map((i) => i.state)).toEqual(['done', 'done', 'current', 'upcoming']);
    expect(progressRowItems(FULL, 4).map((i) => i.state)).toEqual(['done', 'done', 'done', 'done']);
  });
  it('uses the muscle icons and leaves skill ids out', () => {
    const items = progressRowItems(['push', 'planche', 'core'], 1);
    expect(items.map((i) => i.group)).toEqual(['push', 'core']);
    expect(items.map((i) => i.state)).toEqual(['done', 'upcoming']);
    expect(items[0].icon).toBe('/icons/muscles/chest.svg');
    expect(progressRowItems(FULL, 0).map((i) => i.icon)).toEqual([
      '/icons/muscles/chest.svg', '/icons/muscles/back.svg', '/icons/muscles/quads.svg', '/icons/muscles/abs.svg',
    ]);
  });
});

describe('transitionModel', () => {
  it('first group: 1 of 4, push muscles, lemur, nothing saved', () => {
    const m = transitionModel(FULL, 0, {})!;
    expect(m).toMatchObject({ group: 'push', groupNumber: 1, groupTotal: 4, showLemur: true, saved: null, isFirst: true });
    expect(m.muscles).toEqual(['chest', 'shoulders', 'triceps']);
  });
  it('later groups carry the previous group\'s saved choice, no lemur', () => {
    const saved = { push: { group: 'push' as const, level: 6, exerciseName: 'שכיבות סמיכה' } };
    const m = transitionModel(FULL, 1, saved)!;
    expect(m).toMatchObject({ group: 'pull', groupNumber: 2, showLemur: false, isFirst: false, saved: saved.push });
    expect(m.muscles).toEqual(['back', 'biceps']);
    expect(transitionModel(FULL, 2, saved)!.muscles).toEqual(['quads', 'glutes']);
    expect(transitionModel(FULL, 2, saved)!.saved).toBeNull();
    expect(transitionModel(FULL, 3, saved)!.muscles).toEqual(['abs']);
  });
  it('skills (and out of range) get no transition; numbering counts groups only', () => {
    expect(transitionModel(['planche'], 0, {})).toBeNull();
    expect(transitionModel(FULL, 9, {})).toBeNull();
    expect(transitionModel(['planche', 'core'], 1, {})).toMatchObject({ groupNumber: 1, groupTotal: 1, isFirst: true });
  });
});

describe('slider start', () => {
  it('second (easier) step, Y1', () => {
    expect(easyStartIndex(7)).toBe(1);
    expect(easyStartIndex(2)).toBe(1);
    expect(easyStartIndex(1)).toBe(0);
    expect(easyStartIndex(0)).toBe(0);
  });
  it('startEasy, or the step nearest the last answer', () => {
    const steps = [1, 4, 7, 10, 13, 16, 20];
    expect(startStepIndex(steps, 1, true)).toBe(1);
    expect(startStepIndex(steps, 16, false)).toBe(5);
    expect(startStepIndex(steps, 15, false)).toBe(5);
    expect(startStepIndex([], 5, false)).toBe(0);
  });
  it('neighbourSteps: the side cards previews', () => {
    const steps = [1, 4, 7];
    expect(neighbourSteps(steps, 1)).toEqual({ easier: 1, harder: 7 });
    expect(neighbourSteps(steps, 0)).toEqual({ easier: null, harder: 4 });
    expect(neighbourSteps(steps, 2)).toEqual({ easier: 4, harder: null });
    // The skill "not yet" card (-1): the first step is the harder neighbour.
    expect(neighbourSteps(steps, -1)).toEqual({ easier: null, harder: 1 });
  });
});

describe('sliderCards (chip states)', () => {
  it('middle: both side cards, dot = index', () => {
    expect(sliderCards(6, 2, false)).toEqual({ center: 'step', easier: 'step', harder: 'step', dotCount: 6, activeDot: 2 });
  });
  it('floor and ceiling hide a side', () => {
    expect(sliderCards(6, 0, false)).toMatchObject({ easier: null, harder: 'step' });
    expect(sliderCards(6, 5, false)).toMatchObject({ easier: 'step', harder: null });
  });
  it('skill "not yet" card: first card and first dot', () => {
    expect(sliderCards(4, -1, true)).toEqual({ center: 'notYet', easier: null, harder: 'step', dotCount: 5, activeDot: 0 });
    expect(sliderCards(4, 0, true)).toEqual({ center: 'step', easier: 'notYet', harder: 'step', dotCount: 5, activeDot: 1 });
  });
  it('moveSelection clamps, -1 only with "not yet"', () => {
    expect(moveSelection(6, 0, -1, false)).toBe(0);
    expect(moveSelection(6, 0, -1, true)).toBe(-1);
    expect(moveSelection(6, -1, -1, true)).toBe(-1);
    expect(moveSelection(6, -1, 1, true)).toBe(0);
    expect(moveSelection(6, 5, 1, false)).toBe(5);
    expect(moveSelection(6, 2, 1, false)).toBe(3);
  });
});

describe('swipeDirection', () => {
  it('RTL: swipe left = easier, right = harder', () => {
    expect(swipeDirection(-80, 5, true)).toBe(-1);
    expect(swipeDirection(80, 5, true)).toBe(1);
  });
  it('LTR mirrors', () => {
    expect(swipeDirection(80, 0, false)).toBe(-1);
    expect(swipeDirection(-80, 0, false)).toBe(1);
  });
  it('short or vertical moves do nothing', () => {
    expect(swipeDirection(20, 0, true)).toBe(0);
    expect(swipeDirection(60, 100, true)).toBe(0);
  });
});

describe('quizV3Back', () => {
  it('slider → its transition; transition → previous slider; first → exit', () => {
    expect(quizV3Back(false, 1, 'pull')).toBe('toTransition');
    expect(quizV3Back(true, 1, 'pull')).toBe('toPrevSlider');
    expect(quizV3Back(true, 0, 'push')).toBe('exit');
  });
  it('a skill slider has no transition', () => {
    expect(quizV3Back(false, 0, 'planche')).toBe('exit');
    expect(quizV3Back(false, 2, 'planche')).toBe('toPrevSlider');
  });
});

describe('misc', () => {
  it('assessmentFill', () => {
    expect(assessmentFill(0, 4)).toBe(25);
    expect(assessmentFill(1, 4)).toBe(50);
    expect(assessmentFill(5, 4)).toBe(100);
    expect(assessmentFill(0, 0)).toBe(100);
  });
  it('skillIcon', () => {
    expect(skillIcon('planche')).toBe('/icons/programs/planche.svg');
    expect(skillIcon('FRONT_LEVER')).toBe('/icons/programs/front_lever.svg');
    expect(skillIcon('mystery')).toBe('/icons/programs/muscle.svg');
  });
});
