// @vitest-environment jsdom
/**
 * enable_strength_quiz_v3, part C: the outro screens in order (boards SkillUnlock, Done, Explain1..3),
 * what onFinish hands the page, and the hidden "הידעת?" bubble.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, forwardRef, Fragment, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('framer-motion', () => {
  const MOTION_PROPS = new Set(['initial', 'animate', 'exit', 'transition', 'whileTap', 'whileHover', 'layout', 'variants']);
  const motion = new Proxy({}, {
    get: (_t, tag: string) => forwardRef<unknown, Record<string, unknown>>(function MotionStub(props, ref) {
      const rest: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(props)) if (!MOTION_PROPS.has(k)) rest[k] = v;
      return createElement(tag, { ...rest, ref });
    }),
  });
  return { motion, useReducedMotion: () => true, AnimatePresence: ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children) };
});
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
vi.mock('../../OnboardingStoryBar', () => ({
  default: ({ phaseLabel }: { phaseLabel?: string }) => createElement('div', { 'data-story-bar': phaseLabel ?? '' }),
}));
vi.mock('../../../services/visual-content-resolver.service', () => ({
  getOnboardingLevelsForCategory: async () => [1, 2, 4, 5, 6, 7, 9, 10, 14, 16],
  resolveContent: async (_cat: string, level: number) => ({ exerciseName: `ex-${level}` }),
}));

import QuizV3Outro, { type QuizV3OutroProps } from '../QuizV3Outro';
import ProgramSummaryScreen from '../ProgramSummaryScreen';
import { buildProgramSummary } from '../quiz-v3-summary';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement;
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); });

async function mount(el: ReactNode) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(el); });
}
const q = (sel: string) => host.querySelector(sel);
const text = () => host.textContent ?? '';
const buttonByText = (s: string) => Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes(s)) as HTMLButtonElement;
const click = async (b: Element | null | undefined) => { await act(async () => { (b as HTMLElement).click(); }); };

function props(over: Partial<QuizV3OutroProps> = {}): QuizV3OutroProps {
  return {
    levels: { push: 16, pull: 14, legs: 8, core: 6 },
    masterLevel: 11,
    gender: 'male',
    demographics: { gender: 'male', age: 30 } as QuizV3OutroProps['demographics'],
    onFinish: vi.fn(),
    onExitBack: vi.fn(),
    renderSkillSlider: (slot) => createElement('button', { 'data-skill-slider': slot.skillId, onClick: () => slot.onConfirm(3) }, 'slider'),
    ...over,
  };
}

describe('QuizV3Outro', () => {
  it('no skill unlocked: opens on the summary; the explainers; finish with no skills', async () => {
    const p = props({ levels: { push: 6, pull: 4, legs: 8, core: 6 }, masterLevel: 6 });
    await mount(createElement(QuizV3Outro, p));
    expect(q('[data-quiz-v3="done"]')).not.toBeNull();
    expect(text()).toContain('התוכנית שלך מוכנה');
    expect(Array.from(host.querySelectorAll('[data-quiz-v3-row]')).map((e) => e.getAttribute('data-quiz-v3-row'))).toEqual(['push', 'pull', 'legs', 'core']);
    expect(q('[data-quiz-v3-fact]')).toBeNull();
    await click(buttonByText('מה זה אומר?'));
    expect(q('[data-quiz-v3="explain-1"]')).not.toBeNull();
    // Weakest group is pull (4).
    expect(text()).toContain('רגע, אבל מה זה אומר "רמה 4 במשיכה"?');
    expect(text()).toContain('רמה 4 · אתה כאן');
    await click(buttonByText('הבא'));
    expect(text()).toContain('כל אימון ממלא את הטבעת');
    expect(text()).toContain('רמה 5');
    await click(buttonByText('הבא'));
    expect(text()).toContain('האימונים יתאימו ללו״ז שלך');
    expect(buttonByText('דלג')).toBeUndefined();
    await click(buttonByText('להצהרת הבריאות'));
    expect(p.onFinish).toHaveBeenCalledWith([]);
  });

  it('both skills unlock: planche selected first; add → summary; skip → last explainer; finish with planche', async () => {
    const p = props();
    await mount(createElement(QuizV3Outro, p));
    expect(q('[data-quiz-v3="skills"]')).not.toBeNull();
    expect(text()).toContain('רמה משוערת 7 · לפי הדחיפה שלך');
    expect(text()).toContain('רמה משוערת 5 · לפי המשיכה שלך');
    expect(q('[data-quiz-v3-skill="planche"] [aria-pressed="true"]')).not.toBeNull();
    expect(q('[data-quiz-v3-skill="front_lever"] [aria-pressed="false"]')).not.toBeNull();
    // Mini map: here / next / goal from the questionnaire ladder.
    expect(q('[data-quiz-v3-skill="planche"]')!.textContent).toContain('ex-7');
    expect(q('[data-quiz-v3-skill="planche"]')!.textContent).toContain('פלאנץ׳ מלא');
    await click(buttonByText('להוסיף לתוכנית שלי'));
    expect(q('[data-quiz-v3="done"]')).not.toBeNull();
    await click(buttonByText('מה זה אומר?'));
    await click(buttonByText('דלג'));
    expect(q('[data-quiz-v3="explain-3"]')).not.toBeNull();
    await click(buttonByText('להצהרת הבריאות'));
    expect(p.onFinish).toHaveBeenCalledWith([{ skillId: 'planche', level: 7 }]);
  });

  it('"maybe later" adds nothing; refine opens the skill questionnaire and its level is kept', async () => {
    const p = props();
    await mount(createElement(QuizV3Outro, p));
    await click(buttonByText('לדייק את הרמה בשאלון קצר'));
    expect(q('[data-skill-slider="planche"]')).not.toBeNull();
    await click(q('[data-skill-slider="planche"]'));
    expect(q('[data-quiz-v3="done"]')).not.toBeNull();
    for (const label of ['מה זה אומר?', 'הבא', 'הבא', 'להצהרת הבריאות']) await click(buttonByText(label));
    expect(p.onFinish).toHaveBeenLastCalledWith([{ skillId: 'planche', level: 3 }]);

    act(() => root?.unmount());
    const p2 = props();
    await mount(createElement(QuizV3Outro, p2));
    await click(buttonByText('אולי אחר כך'));
    for (const label of ['מה זה אומר?', 'הבא', 'הבא', 'להצהרת הבריאות']) await click(buttonByText(label));
    expect(p2.onFinish).toHaveBeenCalledWith([]);
  });

  it('back from the first screen leaves the outro', async () => {
    const p = props();
    await mount(createElement(QuizV3Outro, p));
    await click(host.querySelector('header button'));
    expect(p.onExitBack).toHaveBeenCalledTimes(1);
  });

  it('after a failed save: opens on the last explainer with the error', async () => {
    const onSkipSave = vi.fn();
    await mount(createElement(QuizV3Outro, props({ saveError: 'שגיאה', onSkipSave })));
    expect(q('[data-quiz-v3="explain-3"]')).not.toBeNull();
    expect(q('[role="alert"]')!.textContent).toContain('שגיאה');
    await click(buttonByText('המשך בלי לשמור עכשיו'));
    expect(onSkipSave).toHaveBeenCalled();
  });
});

describe('QuizV3Outro (review fixes)', () => {
  it('last CTA follows the real next route: the add-track week when the declaration is signed', async () => {
    await mount(createElement(QuizV3Outro, props({ resume: true, finishesAtHealth: false })));
    expect(buttonByText('ממשיכים לשבוע שלי')).toBeDefined();
    expect(buttonByText('להצהרת הבריאות')).toBeUndefined();
  });

  it('resume keeps the earlier choice', async () => {
    const p = props({ resume: true, initialChosen: [{ skillId: 'front_lever', level: 5 }] });
    await mount(createElement(QuizV3Outro, p));
    await click(buttonByText('להצהרת הבריאות'));
    expect(p.onFinish).toHaveBeenCalledWith([{ skillId: 'front_lever', level: 5 }]);
  });

  it('caps the estimate at the skill program top level', async () => {
    await mount(createElement(QuizV3Outro, props({ levels: { push: 25, pull: 3 }, maxSkillLevels: { planche: 10 } })));
    expect(text()).toContain('רמה משוערת 10 · לפי הדחיפה שלך');
  });

  it('no demographics: no "לדייק" link (no blank 5b), the estimate is used', async () => {
    await mount(createElement(QuizV3Outro, props({ skillSliderAvailable: false })));
    expect(buttonByText('לדייק את הרמה בשאלון קצר')).toBeUndefined();
    expect(buttonByText('להוסיף לתוכנית שלי')).toBeDefined();
  });
});

describe('ProgramSummaryScreen "הידעת?"', () => {
  const summary = buildProgramSummary({ push: { currentLevel: 6, percent: 5 } });
  it('hidden without a fact, shown with a real one', async () => {
    await mount(createElement(ProgramSummaryScreen, { summary, gender: 'female', onNext: () => {} }));
    expect(q('[data-quiz-v3-fact]')).toBeNull();
    act(() => root?.unmount());
    await mount(createElement(ProgramSummaryScreen, { summary, gender: 'female', onNext: () => {}, fact: { group: 'push', percentile: 70, source: 'ACSM' } }));
    expect(q('[data-quiz-v3-fact]')!.textContent).toContain('בדחיפה את ברמה גבוהה מ-70% מהנשים בגילך.');
  });
});
