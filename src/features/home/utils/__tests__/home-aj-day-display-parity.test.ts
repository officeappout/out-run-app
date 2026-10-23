/**
 * i18n wave 2 batch aj (namespace `home`): day-display.utils.tsx (the weekly strip / month grid day cell).
 * Snapshots recorded from the helper BEFORE the extraction: every short label of the dictionary and the category
 * fallbacks, every label / aria-label state of resolveDayDisplayProps() + DayIconCell (v1 and v2 = enable_home_v2),
 * in male / female / other. Static markup (node env); `<!-- -->` is stripped.
 */
import { describe, it, expect, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@lottiefiles/dotlottie-react', async () => {
  const { createElement } = await import('react');
  return { DotLottieReact: (p: { src: string }) => createElement('i', { 'data-src': p.src }), setWasmUrl: () => {} };
});

import { DayCellV2Context, DayIconCell, getShortLabel, resolveDayDisplayProps, type DayDisplayInput } from '../day-display.utils';
import { useLocaleStore } from '@/store/useLocaleStore';

const KEYS = ['muscle', 'upper_body', 'push', 'pushing', 'pullup', 'pull', 'pulling', 'calisthenics', 'pull_up_pro', 'full_body', 'fullbody', 'fullbady', 'leg', 'lower_body', 'legs', 'core', 'handstand', 'pilates', 'yoga', 'shoe', 'running', 'cardio', 'walking', 'heart', 'healthy_lifestyle', 'wellness', 'easy_run', 'long_run', 'short_intervals', 'long_intervals', 'fartlek_easy', 'fartlek_structured', 'tempo', 'hill_long', 'hill_short', 'hill_sprints', 'strides', 'recovery'];

const snap = (name: string) => `./__snapshots__/home-aj-day-display/${name}.txt`;
const strip = (s: string) => s.replaceAll('<!-- -->', '');
const base: DayDisplayInput = { state: 'future', isSelected: false, isRest: false, isMissed: false, isCompleted: false };

describe('day display labels', () => {
  it('the short-label dictionary, by key and in upper case', async () => {
    const out = KEYS.map((k) => `${k} => ${getShortLabel(k)} | ${getShortLabel(k.toUpperCase())}`).concat([
      `(none) => [${getShortLabel(undefined)}]`,
      `(null) => [${getShortLabel(null)}]`,
      `(unknown) => [${getShortLabel('zzz')}]`,
    ]);
    await expect(out.join('\n')).toMatchFileSnapshot(snap('short-labels'));
  });

  it('resolveDayDisplayProps: label text and colour in every state, plus the category fallbacks of a multi-activity day', async () => {
    const cases: Array<[string, Partial<DayDisplayInput>]> = [];
    for (const state of ['future', 'today', 'past'] as const) {
      for (const isRest of [false, true]) {
        for (const isCompleted of [false, true]) {
          for (const stepGoalMet of [false, true]) {
            for (const programIconKey of [undefined, 'muscle', 'walking']) {
              cases.push([`${state}/rest=${isRest}/done=${isCompleted}/steps=${stepGoalMet}/${programIconKey}`, { state, isRest, isCompleted, stepGoalMet, programIconKey }]);
            }
          }
        }
      }
    }
    cases.push(['past/missed+debt', { state: 'past', isMissed: true, debtCleared: true, programIconKey: 'muscle' }]);
    cases.push(['past/recovery rest', { state: 'past', isRest: true, isCompleted: true, isRecoveryCompletion: true }]);
    cases.push(['today/recovery rest', { state: 'today', isRest: true, isCompleted: true, isRecoveryCompletion: true }]);
    cases.push(['today/running tempo', { state: 'today', runningCategory: 'tempo' }]);
    cases.push(['future/running unknown', { state: 'future', runningCategory: 'zzz', programIconKey: 'muscle' }]);
    const lines = cases.map(([name, over]) => {
      const p = resolveDayDisplayProps({ ...base, ...over });
      return `${name} => ${JSON.stringify(p.label)}`;
    });
    for (const state of ['future', 'today', 'past'] as const) {
      for (const s of [
        [{ category: 'strength' as const, minutes: 30 }, { category: 'cardio' as const, minutes: 20 }],
        [{ category: 'maintenance' as const, minutes: 30 }, { category: 'cardio' as const, minutes: 20, programIconKey: 'shoe' }],
        [{ category: 'strength' as const, minutes: 30, programIconKey: 'push' }, { category: 'maintenance' as const, minutes: 20, runningCategory: 'hill_long' }, { category: 'cardio' as const, minutes: 10, programIconKey: 'unknown_key' }],
      ]) {
        const p = resolveDayDisplayProps({ ...base, state, isCompleted: state !== 'future', sessionsCompleted: state !== 'future', programIconKey: 'muscle', sessions: s });
        lines.push(`${state}/multi => ${JSON.stringify(p.label)} ${JSON.stringify((p.sessions ?? []).map((x) => x.label))}`);
      }
    }
    await expect(lines.join('\n')).toMatchFileSnapshot(snap('resolve-labels'));
  });

  it.each([false, true])('DayIconCell: rest Zz aria-label and labelled cells (v2=%s)', async (v2) => {
    const parts: string[] = [];
    for (const gender of ['male', 'female', 'other'] as const) {
      Object.assign(useLocaleStore.getInitialState(), { gender });
      for (const over of [
        { state: 'future' as const, isRest: true },
        { state: 'past' as const, isMissed: true },
        { state: 'today' as const, isRest: true },
        { state: 'future' as const, programIconKey: 'muscle' },
        { state: 'today' as const, isCompleted: true, programIconKey: 'shoe' },
        { state: 'past' as const, isRest: true, stepGoalMet: true },
        { state: 'past' as const, isRest: true, isCompleted: true },
      ]) {
        const props = resolveDayDisplayProps({ ...base, ...over });
        parts.push(strip(renderToStaticMarkup(h(DayCellV2Context.Provider, { value: v2 }, h(DayIconCell, { props })))));
      }
    }
    await expect(parts.join('\n')).toMatchFileSnapshot(snap(`cells-v${v2 ? 2 : 1}`));
  });
});
