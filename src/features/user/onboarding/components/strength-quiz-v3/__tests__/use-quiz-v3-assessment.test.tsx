// @vitest-environment jsdom
/** useQuizV3Assessment: transition → slider → next transition, and back, as the page drives it. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));

import { useQuizV3Assessment, type QuizV3Assessment } from '../useQuizV3Assessment';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CATS = ['push', 'pull', 'legs', 'core'];
let root: Root | null = null;
let api: (QuizV3Assessment & { index: number; setIndex: (n: number) => void }) | null = null;

function Probe({ enabled }: { enabled: boolean }) {
  const [index, setIndex] = useState(0);
  const v3 = useQuizV3Assessment(enabled, CATS, index);
  api = { ...v3, index, setIndex };
  return null;
}

function mount(enabled: boolean) {
  const host = document.createElement('div');
  root = createRoot(host);
  act(() => root!.render(<Probe enabled={enabled} />));
}

afterEach(() => { act(() => root?.unmount()); root = null; api = null; });

describe('useQuizV3Assessment', () => {
  it('flag off: no transition, no slider props', () => {
    mount(false);
    expect(api!.transition).toBeNull();
    expect(api!.sliderProps).toBeUndefined();
  });

  it('forward: transition, slider, choice saved, next transition shows it', () => {
    mount(true);
    expect(api!.transition?.group).toBe('push');
    act(() => api!.leaveTransition());
    expect(api!.transition).toBeNull();
    expect(api!.sliderProps?.startMiddle).toBe(true);
    act(() => { api!.sliderProps!.onChosen!(6, 'שכיבות סמיכה'); api!.setIndex(1); });
    expect(api!.transition?.group).toBe('pull');
    expect(api!.transition?.saved).toEqual({ group: 'push', level: 6, exerciseName: 'שכיבות סמיכה' });
  });

  it('back: slider → transition → previous slider (answered, so not the middle) → exit', () => {
    mount(true);
    act(() => api!.leaveTransition());
    act(() => { api!.sliderProps!.onChosen!(6, null); api!.setIndex(1); });
    act(() => api!.leaveTransition());
    let r: string = '';
    act(() => { r = api!.back(); });
    expect(r).toBe('handled');
    expect(api!.transition?.group).toBe('pull');
    act(() => { r = api!.back(); });
    expect(r).toBe('toPrevSlider');
    act(() => api!.setIndex(0));
    expect(api!.transition).toBeNull();
    expect(api!.sliderProps?.startMiddle).toBe(false);
    act(() => { r = api!.back(); });
    expect(r).toBe('handled');
    act(() => { r = api!.back(); });
    expect(r).toBe('exit');
  });
});

/** The page swaps a skill for its foundation group at the same index ("not yet" escape). */
let swapApi: (QuizV3Assessment & { swap: () => void }) | null = null;
function SwapProbe() {
  const [cats, setCats] = useState<string[]>(['planche', 'pull']);
  const v3 = useQuizV3Assessment(true, cats, 0);
  swapApi = { ...v3, swap: () => setCats(['push', 'pull']) };
  return null;
}

describe('useQuizV3Assessment: skill "not yet" swap', () => {
  it('the swapped-in muscle group opens on its transition', () => {
    const host = document.createElement('div');
    root = createRoot(host);
    act(() => root!.render(<SwapProbe />));
    // On the skill slider (no transition), with the transition flag cleared as after a back step.
    expect(swapApi!.transition).toBeNull();
    act(() => swapApi!.leaveTransition());
    expect(swapApi!.transition).toBeNull();
    act(() => swapApi!.swap());
    expect(swapApi!.transition?.group).toBe('push');
    expect(swapApi!.transition?.groupNumber).toBe(1);
  });
});
