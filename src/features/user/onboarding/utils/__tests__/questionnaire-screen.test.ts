import { describe, it, expect } from 'vitest';
import { questionMotionClass, questionnaireScreen } from '../questionnaire-screen';

describe('questionnaireScreen', () => {
  it('holds on loading until the engine AND the flags are ready (no legacy→v2 swap)', () => {
    expect(questionnaireScreen({ engineLoading: true, flagsReady: true, error: null })).toBe('loading');
    expect(questionnaireScreen({ engineLoading: false, flagsReady: false, error: null })).toBe('loading');
    expect(questionnaireScreen({ engineLoading: false, flagsReady: true, error: null })).toBe('question');
  });
  it('shows the error once both are settled', () => {
    expect(questionnaireScreen({ engineLoading: false, flagsReady: true, error: 'x' })).toBe('error');
    expect(questionnaireScreen({ engineLoading: false, flagsReady: false, error: 'x' })).toBe('loading');
  });
});

describe('questionMotionClass', () => {
  it('legacy keeps today\'s exact classes', () => {
    expect(questionMotionClass(false, false)).toBe('w-full font-simpler opacity-100 scale-100 transition-all duration-300');
    expect(questionMotionClass(false, true)).toBe('w-full font-simpler opacity-0 scale-95 transition-all duration-300');
  });
  it('v2 has no CSS transition / opacity / scale fighting framer-motion', () => {
    for (const animating of [false, true]) {
      const cls = questionMotionClass(true, animating);
      expect(cls).not.toMatch(/transition|opacity-|scale-/);
      expect(cls).toContain('flex min-h-full flex-col');
    }
  });
});
