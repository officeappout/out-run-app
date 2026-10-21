// @vitest-environment jsdom
/**
 * i18n wave 2 (namespace `onboarding`, keys `quiz.*`): VisualSlider snapshots recorded BEFORE the
 * extraction, from unmodified origin/main. The extraction commit must render the same markup.
 *
 * jsdom (not react-dom/server) because the copy depends on effects: the admin steps load
 * (coverflow vs the degraded slider) and the resolved exercise content (name, max reps, seconds
 * vs reps). The content service is mocked with fixed answers, framer-motion is replaced by plain
 * elements (no animation state in the markup) and CoverflowStrip by a marker (its own copy is in
 * strength-quiz-i18n-parity.test.tsx). Timers are fake and never advanced, so the JIT tutorial
 * stays up on stepIndex 0. Cases: v1 / v2 (enable_home_v2), male / female, coverflow / degraded
 * slider, seconds / reps / no content, skill category at its floor (escape), first / middle /
 * last step, the strip hint (enable_strength_quiz_hint_v2) and known / unknown category names.
 */
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { act, createElement, forwardRef, Fragment, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('framer-motion', () => {
  const MOTION_PROPS = new Set([
    'initial', 'animate', 'exit', 'transition', 'whileTap', 'whileHover', 'layout', 'variants', 'onAnimationComplete',
  ]);
  const cache = new Map<string, unknown>();
  const motion = new Proxy(
    {},
    {
      get: (_t, tag: string) => {
        if (!cache.has(tag)) {
          cache.set(
            tag,
            forwardRef<unknown, Record<string, unknown>>((props, ref) => {
              const rest: Record<string, unknown> = {};
              for (const [k, v] of Object.entries(props)) if (!MOTION_PROPS.has(k)) rest[k] = v;
              return createElement(tag, { ...rest, ref });
            }),
          );
        }
        return cache.get(tag);
      },
    },
  );
  return { motion, AnimatePresence: ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children) };
});
vi.mock('@/lib/haptics', () => ({ hapticSelection: () => {} }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
vi.mock('../../OnboardingStoryBar', () => ({
  default: ({ phaseLabel }: { phaseLabel?: string }) => createElement('div', { 'data-story-bar': phaseLabel ?? '' }),
}));
vi.mock('../VideoPlayer', () => ({ default: () => createElement('div', { 'data-video': '' }) }));
vi.mock('../CoverflowStrip', () => ({
  default: ({ steps, selectedIndex }: { steps: number[]; selectedIndex: number }) =>
    createElement('div', { 'data-strip': steps.join(','), 'data-selected': String(selectedIndex) }),
}));

type Content = { exerciseName: string | null; targetReps: string | null; unitType: 'reps' | 'seconds' };
const svc = { levels: [1, 4, 7] as number[], content: null as Content | null };
vi.mock('../../../services/visual-content-resolver.service', () => ({
  getOnboardingLevelsForCategory: async () => svc.levels,
  resolveContent: async () => ({
    thumbnailUrl: null,
    videoUrl: null,
    videoUrlWebm: null,
    videoUrlMov: null,
    onboardingBubbleText: null,
    exerciseName: svc.content?.exerciseName ?? null,
    targetReps: svc.content?.targetReps ?? null,
    unitType: svc.content?.unitType ?? 'reps',
  }),
  prefetchAdjacent: () => {},
  prefetchVideoUrl: () => {},
}));

import VisualSlider from '../VisualSlider';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

type Props = Partial<Parameters<typeof VisualSlider>[0]> & { female?: boolean };

async function mount({ female = false, ...over }: Props): Promise<string> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <VisualSlider
        category="push"
        initialLevel={1}
        demographics={{ age: 30, gender: female ? 'female' : 'male' }}
        onLevelConfirm={() => {}}
        onBack={() => {}}
        stepIndex={0}
        totalSteps={4}
        mode="simple"
        {...over}
      />,
    );
  });
  // Let the steps load, then the content resolve (a few microtask rounds).
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
  return host.innerHTML.replaceAll('<!-- -->', '');
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame'] });
  vi.setSystemTime(new Date('2026-10-21T12:00:00'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  if (!window.matchMedia) {
    window.matchMedia = (q: string) =>
      ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) as unknown as MediaQueryList;
  }
});
afterAll(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  svc.levels = [1, 4, 7];
  svc.content = null;
});

const snap = (name: string) => `./__snapshots__/strength-quiz-i18n/slider-${name}.html`;

describe('VisualSlider — Hebrew markup unchanged by the i18n extraction', () => {
  for (const v2 of [false, true])
    for (const female of [false, true]) {
      const tag = `v${v2 ? 2 : 1}-${female ? 'female' : 'male'}`;

      it(`coverflow, seconds, first step (tutorial) · ${tag}`, async () => {
        svc.content = { exerciseName: 'שכיבות סמיכה', targetReps: '30', unitType: 'seconds' };
        await expect(await mount({ v2, female })).toMatchFileSnapshot(snap(`coverflow-seconds-${tag}`));
      });

      it(`coverflow, reps, middle step · ${tag}`, async () => {
        svc.content = { exerciseName: 'מתח', targetReps: '1234', unitType: 'reps' };
        await expect(await mount({ v2, female, stepIndex: 1 })).toMatchFileSnapshot(snap(`coverflow-reps-${tag}`));
      });

      it(`coverflow, no content, last step · ${tag}`, async () => {
        await expect(await mount({ v2, female, stepIndex: 3 })).toMatchFileSnapshot(snap(`coverflow-empty-last-${tag}`));
      });

      it(`coverflow, no content, middle step · ${tag}`, async () => {
        await expect(await mount({ v2, female, stepIndex: 2 })).toMatchFileSnapshot(snap(`coverflow-empty-next-${tag}`));
      });

      it(`skill category at its floor (escape) · ${tag}`, async () => {
        svc.content = { exerciseName: null, targetReps: '5', unitType: 'reps' };
        await expect(await mount({ v2, female, category: 'planche', onEscape: () => {}, stepIndex: 1 })).toMatchFileSnapshot(
          snap(`skill-escape-${tag}`),
        );
      });

      it(`degraded slider (deep mode, tutorial) · ${tag}`, async () => {
        svc.content = { exerciseName: null, targetReps: '8', unitType: 'reps' };
        await expect(await mount({ v2, female, mode: 'deep', category: 'legs' })).toMatchFileSnapshot(snap(`deep-${tag}`));
      });
    }

  for (const female of [false, true]) {
    const g = female ? 'female' : 'male';
    it(`v2 strip hint (enable_strength_quiz_hint_v2), first category · ${g}`, async () => {
      await expect(await mount({ v2: true, quizHintV2: true, female })).toMatchFileSnapshot(snap(`hint-first-${g}`));
    });
    it(`v2 strip hint, reminder only · ${g}`, async () => {
      await expect(await mount({ v2: true, quizHintV2: true, quizHintReminderOnly: true, female, stepIndex: 1 })).toMatchFileSnapshot(
        snap(`hint-reminder-${g}`),
      );
    });
  }

  it('v2 category names (no exercise name): every known category + case + unknown', async () => {
    const out: string[] = [];
    for (const category of [
      'push', 'pull', 'legs', 'core', 'handstand', 'skills', 'oap', 'pull_up_pro', 'one_arm_pullup', 'muscle_up',
      'muscleup', 'planche', 'front_lever', 'handstand_pushup', 'hspu', 'Push', 'FRONT_LEVER', 'mystery_move',
    ]) {
      out.push(`<!-- ${category} -->`);
      out.push(await mount({ v2: true, category, stepIndex: 1 }));
      act(() => root?.unmount());
      host?.remove();
    }
    root = null;
    host = null;
    await expect(out.join('\n')).toMatchFileSnapshot(snap('v2-category-names'));
  });
});
