/**
 * Home v2 day cell (enable_home_v2): the same resolveDayDisplayProps() output,
 * rendered as streak flames. Server-rendered to static markup; the Lottie player
 * is stubbed so we can read which flame each day asked for.
 */
import { describe, it, expect, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@lottiefiles/dotlottie-react', async () => {
  const { createElement } = await import('react');
  return {
    DotLottieReact: (p: { src: string; autoplay?: boolean }) => createElement('i', { 'data-src': p.src, 'data-live': String(!!p.autoplay) }),
    setWasmUrl: () => {},
  };
});

import { DayCellV2Context, DayIconCell, earnedTones, resolveDayDisplayProps, toneFromFlameSrc } from '../day-display.utils';

const v2 = (el: React.ReactElement) => renderToStaticMarkup(h(DayCellV2Context.Provider, { value: true }, el));
const cell = (props: ReturnType<typeof resolveDayDisplayProps>) => h(DayIconCell, { props });

describe('toneFromFlameSrc', () => {
  it('maps the flame assets', () => {
    expect(toneFromFlameSrc('/assets/icons/ui/flame-strength.svg')).toBe('strength');
    expect(toneFromFlameSrc('/assets/icons/ui/flame-endurance.svg')).toBe('cardio');
    expect(toneFromFlameSrc('/assets/icons/ui/flame-steps.svg')).toBe('steps');
    expect(toneFromFlameSrc('/assets/lemur/lemur-rest.svg')).toBeNull();
  });
});

describe('DayIconCell under v2', () => {
  it('a completed strength day is the strength flame, still, no frame', () => {
    const props = resolveDayDisplayProps({ state: 'past', isSelected: false, isRest: false, isMissed: false, isCompleted: true, programIconKey: 'muscle' });
    expect(earnedTones(props)).toEqual(['strength']);
    const out = v2(cell(props));
    expect(out).toContain('/assets/animations/flames/strength.lottie');
    expect(out).toContain('data-live="false"');
    expect(out).not.toContain('border:');
  });

  it("today's completed flame is live", () => {
    const props = resolveDayDisplayProps({ state: 'today', isSelected: false, isRest: false, isMissed: false, isCompleted: true, programIconKey: 'muscle' });
    expect(v2(cell(props))).toContain('data-live="true"');
  });

  it('a past multi-activity day shows its main colour and one dot per activity', () => {
    const props = resolveDayDisplayProps({
      state: 'past',
      isSelected: false,
      isRest: false,
      isMissed: false,
      isCompleted: true,
      programIconKey: 'muscle',
      sessionsCompleted: true,
      sessions: [
        { category: 'strength', minutes: 35, programIconKey: 'muscle' },
        { category: 'cardio', minutes: 20 },
      ],
    });
    const tones = earnedTones(props);
    expect(tones.length).toBe(2);
    const out = v2(cell(props));
    expect(out).toContain(`/assets/animations/flames/${tones[0]}.lottie`);
    expect(out.match(/rounded-full transition-\[width,height\]/g)?.length).toBe(2);
  });

  it("today's pending workout is a white tile with an accent ring", () => {
    const props = resolveDayDisplayProps({ state: 'today', isSelected: false, isRest: false, isMissed: false, isCompleted: false, programIconKey: 'muscle' });
    expect(earnedTones(props)).toEqual([]);
    const out = v2(cell(props));
    expect(out).toContain('box-shadow:0 0 0 2px #00baf7');
    expect(out).not.toContain('lottie');
  });

  it('a rest day is a quiet Zz', () => {
    const props = resolveDayDisplayProps({ state: 'past', isSelected: false, isRest: true, isMissed: false, isCompleted: false });
    expect(v2(cell(props))).toContain('aria-label="מנוחה"');
  });

  it('without the context the v1 cell renders (no Lottie)', () => {
    const props = resolveDayDisplayProps({ state: 'past', isSelected: false, isRest: false, isMissed: false, isCompleted: true, programIconKey: 'muscle' });
    expect(renderToStaticMarkup(cell(props))).not.toContain('lottie');
  });
});
