/**
 * i18n wave 2 (namespace `onboarding`, keys `quiz.*`): snapshots recorded BEFORE the extraction,
 * from unmodified origin/main. The extraction commit must render the same Hebrew markup.
 *
 * Covers the strength quiz components that render statically: TierSelectionCard (v1, v2 male /
 * female), BlurredWhyStep (v1 + v2, every age group × goal × gender, every target-area name, the
 * unknown-area / unknown-age fallbacks, one exercise vs many), StripDragHint (intro / after ×
 * male / female, end labels) and CoverflowStrip (tile aria labels). VisualSlider needs effects
 * (async content) — see visual-slider-i18n-parity.test.tsx (jsdom).
 *
 * `<!-- -->` is stripped before comparing: react-dom/server's separator between adjacent text
 * nodes, not rendered text (`עד {x}` is two text nodes before and one t() string after).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags: {} }) }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
vi.mock('@/lib/haptics', () => ({ hapticSelection: () => {} }));
// The story bar is another area's component (its label is not part of this extraction).
vi.mock('../../OnboardingStoryBar', () => ({
  default: ({ phaseLabel }: { phaseLabel?: string }) => <div data-story-bar={phaseLabel ?? ''} />,
}));

import TierSelectionCard from '../TierSelectionCard';
import BlurredWhyStep from '../BlurredWhyStep';
import StripDragHint from '../StripDragHint';
import CoverflowStrip from '../CoverflowStrip';

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/strength-quiz-i18n/${name}.html`;
const noop = () => {};

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-21T12:00:00'));
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});
afterAll(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('TierSelectionCard', () => {
  it('v1', async () => {
    await expect(html(<TierSelectionCard onSelect={noop} />)).toMatchFileSnapshot(snap('tier-v1'));
  });
  it('v1, female (v1 copy is not gendered)', async () => {
    await expect(html(<TierSelectionCard onSelect={noop} gender="female" />)).toMatchFileSnapshot(snap('tier-v1-female'));
  });
  it('v2, male', async () => {
    await expect(html(<TierSelectionCard onSelect={noop} v2 gender="male" />)).toMatchFileSnapshot(snap('tier-v2-male'));
  });
  it('v2, female', async () => {
    await expect(html(<TierSelectionCard onSelect={noop} v2 gender="female" />)).toMatchFileSnapshot(snap('tier-v2-female'));
  });
  it('v2, clamped levels', async () => {
    await expect(
      html(<TierSelectionCard onSelect={noop} v2 gender="male" clampTierLevel={(l) => Math.min(l, 12)} />),
    ).toMatchFileSnapshot(snap('tier-v2-clamped'));
  });
  it('v2, unknown gender — neutral copy (gender batch 3)', async () => {
    await expect(html(<TierSelectionCard onSelect={noop} v2 />)).toMatchFileSnapshot(snap('tier-v2-other'));
  });
});

const AGE_GROUPS = ['14-18', '18-21', '21-26', '26-50', '50+'] as const;
const GOALS = ['health', 'muscle', 'body_focus', 'skills', null] as const;
const GENDERS = ['male', 'female'] as const;
// Every TARGET_AREA_NAMES key + upper case / padded / unknown.
const AREAS = [
  'push', 'pull', 'legs', 'core', 'handstand', 'skills', 'muscle_up', 'muscleup', 'planche', 'front_lever',
  'back_lever', 'handstand_pushup', 'hspu', 'one_arm_pullup', 'oap', 'pull_up_pro', 'pull_up', 'push_up',
  'l_sit', 'human_flag', 'chest', 'back', 'shoulders', 'biceps', 'triceps', 'full_body', 'abs', 'glutes',
  'arms', ' PLANCHE ', 'nonsense', null,
] as const;

describe('BlurredWhyStep', () => {
  for (const v2 of [false, true]) {
    it(`every age group × goal × gender, v${v2 ? 2 : 1}`, async () => {
      const out: string[] = [];
      for (const ageGroup of AGE_GROUPS)
        for (const goal of GOALS)
          for (const gender of GENDERS) {
            out.push(`<!-- ${ageGroup} · ${goal} · ${gender} -->`);
            out.push(
              html(
                <BlurredWhyStep
                  gender={gender}
                  ageGroup={ageGroup}
                  goal={goal}
                  targetArea="planche"
                  exerciseCount={5}
                  onNext={noop}
                  onBack={noop}
                  v2={v2}
                />,
              ),
            );
          }
      await expect(out.join('\n')).toMatchFileSnapshot(snap(`why-matrix-v${v2 ? 2 : 1}`));
    });
  }

  it('every target area, muscle + skills goals, both genders (v2)', async () => {
    const out: string[] = [];
    for (const targetArea of AREAS)
      for (const goal of ['muscle', 'skills'] as const)
        for (const gender of GENDERS) {
          out.push(`<!-- ${targetArea} · ${goal} · ${gender} -->`);
          out.push(
            html(
              <BlurredWhyStep gender={gender} ageGroup="26-50" goal={goal} targetArea={targetArea} exerciseCount={3} onNext={noop} v2 />,
            ),
          );
        }
    await expect(out.join('\n')).toMatchFileSnapshot(snap('why-areas-v2'));
  });

  it('one exercise, many exercises, unknown age group (v2)', async () => {
    const out: string[] = [];
    for (const exerciseCount of [1, 2, 12])
      for (const gender of GENDERS) {
        out.push(`<!-- count ${exerciseCount} · ${gender} -->`);
        out.push(
          html(<BlurredWhyStep gender={gender} ageGroup="18-21" goal="skills" targetArea={null} exerciseCount={exerciseCount} onNext={noop} v2 />),
        );
      }
    for (const gender of GENDERS) {
      out.push(`<!-- unknown age group · ${gender} -->`);
      out.push(html(<BlurredWhyStep gender={gender} ageGroup="99" goal="muscle" targetArea="abs" exerciseCount={4} onNext={noop} v2 />));
    }
    await expect(out.join('\n')).toMatchFileSnapshot(snap('why-counts-v2'));
  });

  it("gender 'other' / unknown — neutral copy (gender batch 3), v2", async () => {
    const out: string[] = [];
    for (const goal of ['skills', 'health'] as const) {
      out.push(`<!-- other · ${goal} -->`);
      out.push(
        html(
          <BlurredWhyStep
            gender="other"
            ageGroup="21-26"
            goal={goal}
            targetArea="pull_up"
            exerciseCount={4}
            onNext={noop}
            v2
          />,
        ),
      );
    }
    await expect(out.join('\n')).toMatchFileSnapshot(snap('why-gender-other-v2'));
  });
});

describe('StripDragHint', () => {
  for (const pill of ['intro', 'after', null] as const)
    for (const gender of ['male', 'female', 'other'] as const) {
      it(`pill ${pill}, ${gender}`, async () => {
        await expect(
          html(
            <StripDragHint
              pill={pill}
              gender={gender}
              showEndLabels={pill !== null}
              showDemoFinger={false}
              showStaticFinger={false}
              fingerRun={0}
              fingerNode={<span>finger</span>}
            />,
          ),
        ).toMatchFileSnapshot(snap(`hint-${pill}-${gender}`));
      });
    }
});

describe('CoverflowStrip', () => {
  it('tile aria labels', async () => {
    await expect(
      html(<CoverflowStrip steps={[1, 4, 7, 10, 13, 16, 20]} selectedIndex={2} thumbnails={{ 4: 'https://x/4.jpg', 7: null }} onSelect={noop} />),
    ).toMatchFileSnapshot(snap('strip'));
  });
});
