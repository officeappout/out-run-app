// @vitest-environment jsdom
/**
 * enable_strength_quiz_v3, part B: VisualSlider with the quizV3 prop renders the three-card slider
 * (boards Slider / SliderSkill), and GroupTransition the boards Push / Pull. Same mocks as
 * visual-slider-i18n-parity.test.tsx (the flag-off snapshots there stay untouched).
 */
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { act, createElement, forwardRef, Fragment, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('framer-motion', () => {
  const MOTION_PROPS = new Set(['initial', 'animate', 'exit', 'transition', 'whileTap', 'whileHover', 'layout', 'variants', 'onAnimationComplete']);
  const cache = new Map<string, unknown>();
  const motion = new Proxy({}, {
    get: (_t, tag: string) => {
      if (!cache.has(tag)) {
        const Motion = forwardRef<unknown, Record<string, unknown>>(function MotionStub(props, ref) {
          const rest: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(props)) if (!MOTION_PROPS.has(k)) rest[k] = v;
          return createElement(tag, { ...rest, ref });
        });
        cache.set(tag, Motion);
      }
      return cache.get(tag);
    },
  });
  return { motion, useReducedMotion: () => true, AnimatePresence: ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children) };
});
vi.mock('@/lib/haptics', () => ({ hapticSelection: () => {} }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
vi.mock('../../OnboardingStoryBar', () => ({
  default: ({ phaseLabel, phaseFillPercent }: { phaseLabel?: string; phaseFillPercent?: number }) =>
    createElement('div', { 'data-story-bar': phaseLabel ?? '', 'data-fill': String(phaseFillPercent) }),
}));
vi.mock('../../visual-assessment/VideoPlayer', () => ({ default: () => createElement('div', { 'data-video': '' }) }));

const svc = { levels: [1, 4, 7, 10, 13, 16] as number[] };
vi.mock('../../../services/visual-content-resolver.service', () => ({
  getOnboardingLevelsForCategory: async () => svc.levels,
  resolveContent: async (_cat: string, level: number) => ({
    thumbnailUrl: null, videoUrl: null, videoUrlWebm: null, videoUrlMov: null, onboardingBubbleText: null,
    exerciseName: `ex-${level}`, targetReps: '12', unitType: 'reps',
  }),
  prefetchAdjacent: () => {},
  prefetchVideoUrl: () => {},
}));

import VisualSlider, { type QuizV3SliderProps } from '../../visual-assessment/VisualSlider';
import GroupTransition from '../GroupTransition';
import { progressRowItems, transitionModel } from '../quiz-v3-model';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

async function render(node: ReactNode) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(node); });
  for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); });
  return host;
}
const q = (sel: string) => host!.querySelector(sel);
const click = async (el: Element | null) => { await act(async () => { (el as HTMLElement).click(); }); };
const text = () => host!.textContent ?? '';

function v3(over: Partial<QuizV3SliderProps> = {}): QuizV3SliderProps {
  return { categories: ['push', 'pull', 'legs', 'core'], categoryIndex: 0, startMiddle: true, ...over };
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  if (!window.matchMedia) {
    window.matchMedia = (m: string) =>
      ({ matches: false, media: m, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) as unknown as MediaQueryList;
  }
});
afterAll(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  svc.levels = [1, 4, 7, 10, 13, 16];
});

describe('VisualSlider + quizV3 (board Slider)', () => {
  it('opens on the middle step with both chips and "הרמה שלי"', async () => {
    await render(<VisualSlider category="push" initialLevel={1} demographics={{ age: 30, gender: 'male' }}
      onLevelConfirm={() => {}} stepIndex={0} totalSteps={4} mode="simple" v2 quizV3={v3()} />);
    expect(q('[data-quiz-v3-slider="push"]')).not.toBeNull();
    expect(q('[data-side-card="easier"] [data-level-chip="easier"]')).not.toBeNull();
    expect(q('[data-side-card="harder"] [data-level-chip="harder"]')).not.toBeNull();
    expect(q('[data-level-chip="mine"]')?.textContent).toBe('הרמה שלי');
    // Same marks and colours as the in-workout swap (LevelCompareIcon): harder up green, easier down orange.
    expect(q('[data-level-chip="harder"]')?.getAttribute('data-level-icon')).toBe('higher');
    expect(q('[data-level-chip="harder"] img')?.getAttribute('src')).toBe('/assets/icons/ui/level_up.svg');
    expect(q('[data-level-chip="harder"]')?.className).toContain('text-emerald-500');
    expect(q('[data-level-chip="easier"]')?.getAttribute('data-level-icon')).toBe('lower');
    expect(q('[data-level-chip="easier"] img')?.getAttribute('src')).toBe('/assets/icons/ui/level_down.svg');
    expect(q('[data-level-chip="easier"]')?.className).toContain('text-orange-500');
    expect(q('[data-level-chip="mine"] img')?.getAttribute('src')).toBe('/assets/icons/ui/level_same.svg');
    expect(text()).toContain('ex-7'); // middle of 6 steps = index 2 = level 7
    expect(text()).toContain('רמה 7 · מקסימום: 12 חזרות');
    expect(text()).toContain('מה התרגיל הכי קשה שבטוח תצליח?');
    expect(text()).not.toContain('עוד לא מצליחים?');
    expect(host!.querySelectorAll('[data-quiz-v3-progress] li')[0].getAttribute('data-state')).toBe('current');
  });

  it('hides the easier card at the floor; the swipe hint stays until the first move', async () => {
    await render(<VisualSlider category="pull" initialLevel={1} demographics={{ age: 30, gender: 'female' }}
      onLevelConfirm={() => {}} stepIndex={1} totalSteps={4} mode="simple" v2
      quizV3={v3({ categoryIndex: 1, startMiddle: false })} />);
    expect(q('[data-side-card="easier"]')).toBeNull();
    expect(q('[data-swipe-hint]')?.textContent).toContain('גללי לצדדים');
    await click(q('[data-side-card="harder"]'));
    expect(q('[data-swipe-hint]')).toBeNull();
    expect(q('[data-side-card="easier"]')).not.toBeNull();
  });

  it('confirm reports the level and the exercise name', async () => {
    const chosen = vi.fn();
    const confirmed = vi.fn();
    await render(<VisualSlider category="push" initialLevel={1} demographics={{ age: 30, gender: 'male' }}
      onLevelConfirm={confirmed} stepIndex={0} totalSteps={4} mode="simple" v2 quizV3={v3({ onChosen: chosen })} />);
    const cta = Array.from(host!.querySelectorAll('button')).find((b) => b.textContent === 'זו הרמה שלי');
    await click(cta!);
    expect(chosen).toHaveBeenCalledWith(7, 'ex-7');
    expect(confirmed).toHaveBeenCalledWith(7);
  });

  it('the help link re-opens the tutorial lines', async () => {
    await render(<VisualSlider category="push" initialLevel={1} demographics={{ age: 30, gender: 'male' }}
      onLevelConfirm={() => {}} stepIndex={0} totalSteps={4} mode="simple" v2 quizV3={v3()} />);
    expect(q('[data-help-link]')?.textContent).toBe('לא הבנת מה צריך לעשות? לחץ להסבר');
    await click(q('[data-help-link]'));
    expect(q('[data-help-card]')?.textContent).toContain('גרור כדי לשנות את הקושי והתרגיל');
  });
});

describe('VisualSlider + quizV3, skill (board SliderSkill)', () => {
  it('"not yet" is the first card; its CTA runs the existing escape', async () => {
    const escape = vi.fn();
    const confirmed = vi.fn();
    await render(<VisualSlider category="planche" initialLevel={5} demographics={{ age: 30, gender: 'male' }}
      onLevelConfirm={confirmed} onEscape={escape} stepIndex={0} totalSteps={1} mode="simple" v2
      quizV3={v3({ categories: ['planche'], startMiddle: false })} />);
    expect(q('[data-center-card="notYet"]')?.textContent).toContain('עוד לא מצליח');
    expect(q('[data-center-card="notYet"]')?.textContent).toContain('ex-1');
    expect(q('[data-side-card="easier"]')).toBeNull();
    expect(q('[data-side-card="harder"]')?.textContent).toContain('ex-1');
    expect(text()).toContain('איפה אתה בפלאנץ׳?');
    const cta = Array.from(host!.querySelectorAll('button')).find((b) => b.textContent === 'מתחילים מכאן');
    await click(cta!);
    expect(escape).toHaveBeenCalledTimes(1);
    expect(confirmed).not.toHaveBeenCalled();
  });

  it('moving harder leaves "not yet" and confirms the first step', async () => {
    const escape = vi.fn();
    const confirmed = vi.fn();
    await render(<VisualSlider category="planche" initialLevel={5} demographics={{ age: 30, gender: 'male' }}
      onLevelConfirm={confirmed} onEscape={escape} stepIndex={0} totalSteps={1} mode="simple" v2
      quizV3={v3({ categories: ['planche'], startMiddle: false })} />);
    await click(q('[data-side-card="harder"]'));
    expect(q('[data-center-card="step"]')).not.toBeNull();
    expect(q('[data-side-card="easier"]')?.textContent).toContain('עוד לא מצליח');
    const cta = Array.from(host!.querySelectorAll('button')).find((b) => b.textContent === 'מתחילים מכאן');
    await click(cta!);
    expect(confirmed).toHaveBeenCalledWith(1);
    expect(escape).not.toHaveBeenCalled();
  });
});

describe('GroupTransition (boards Push / Pull)', () => {
  const FULL = ['push', 'pull', 'legs', 'core'];
  it('first group: chip, title, three tiles, lemur line', async () => {
    await render(<GroupTransition model={transitionModel(FULL, 0, {})!} progress={progressRowItems(FULL, 0)}
      gender="male" fillPercent={25} onNext={() => {}} />);
    expect(text()).toContain('קבוצה 1 מתוך 4');
    expect(q('h1')?.textContent).toBe('עכשיו: שרירי הדחיפה');
    expect(text()).toContain('זכור: עוצרים על הכי קשה שאתה בטוח שתצליח.');
    expect(text()).toContain('בואו נבדוק');
    expect(q('[data-quiz-v3-saved]')).toBeNull();
  });
  it('next group: the saved card, no lemur, done badge on push', async () => {
    const saved = { push: { group: 'push' as const, level: 6, exerciseName: 'שכיבות סמיכה' } };
    const onNext = vi.fn();
    await render(<GroupTransition model={transitionModel(FULL, 1, saved)!} progress={progressRowItems(FULL, 1)}
      gender="female" fillPercent={50} onNext={onNext} />);
    expect(q('[data-quiz-v3-saved]')?.textContent).toContain('דחיפה נשמרה');
    expect(q('[data-quiz-v3-saved]')?.textContent).toContain('שכיבות סמיכה · רמה 6');
    expect(text()).not.toContain('זכרי');
    expect(host!.querySelectorAll('[data-quiz-v3-progress] li')[0].getAttribute('data-state')).toBe('done');
    const cta = Array.from(host!.querySelectorAll('button')).find((b) => b.textContent === 'ממשיכים למשיכה');
    await click(cta!);
    expect(onNext).toHaveBeenCalled();
  });
});
