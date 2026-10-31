import { describe, it, expect, beforeEach } from 'vitest';
import { videoLanguage } from '../video-locale';
import { getVideoLanguage } from '../useVideoLanguage';
import { useLocaleStore } from '@/store/useLocaleStore';
import { resolveTutorialForLang, type ExerciseMedia } from '@/features/content/exercises/core/exercise.types';
import { resolveExerciseMedia } from '@/features/workout-engine/shared/utils/media-resolution.utils';
import { buildSheetData } from '@/features/content/exercises/client/utils/sheet-data.utils';

const he = { videoId: 'he-id', provider: 'bunny' as const };
const en = { videoId: 'en-id', provider: 'bunny' as const };
const both: ExerciseMedia = { fullTutorial: { he, en } };
const heOnly: ExerciseMedia = { fullTutorial: { he } };

describe('videoLanguage', () => {
  it('is he with the flag off, whatever the content language', () => {
    expect(videoLanguage('en', false)).toBe('he');
    expect(videoLanguage('he', false)).toBe('he');
  });
  it('is he for Hebrew content with the flag on', () => {
    expect(videoLanguage('he', true)).toBe('he');
  });
  it('is en only for English content with the flag on', () => {
    expect(videoLanguage('en', true)).toBe('en');
  });
});

describe('getVideoLanguage (store)', () => {
  beforeEach(() => useLocaleStore.setState({ locale: 'he', contentLocaleOn: false, videoLocaleOn: false }));
  it('is he by default (all flags off)', () => {
    expect(getVideoLanguage()).toBe('he');
  });
  it('is he for an English user while enable_video_locale is off', () => {
    useLocaleStore.setState({ locale: 'en', contentLocaleOn: true, videoLocaleOn: false });
    expect(getVideoLanguage()).toBe('he');
  });
  it('is he while the content locale is off, even with the video flag on', () => {
    useLocaleStore.setState({ locale: 'en', contentLocaleOn: false, videoLocaleOn: true });
    expect(getVideoLanguage()).toBe('he');
  });
  it('is en for an English user with both on', () => {
    useLocaleStore.setState({ locale: 'en', contentLocaleOn: true, videoLocaleOn: true });
    expect(getVideoLanguage()).toBe('en');
  });
});

describe('tutorial resolution by video language', () => {
  it('he picks the Hebrew upload, en the English one', () => {
    expect(resolveTutorialForLang(both, 'he')).toBe(he);
    expect(resolveTutorialForLang(both, 'en')).toBe(en);
  });
  it('en falls back to Hebrew when there is no en upload', () => {
    expect(resolveTutorialForLang(heOnly, 'en')).toBe(he);
  });

  it('resolveExerciseMedia: default is byte-identical to the explicit he call', () => {
    const ex = { media: both, execution_methods: [{ location: 'park', media: { fullTutorial: { he, en } } }] };
    const before = resolveExerciseMedia(ex, ex.execution_methods[0]);
    expect(resolveExerciseMedia(ex, ex.execution_methods[0], 'he')).toEqual(before);
    expect(before.fullTutorial).toBe(he);
    expect(resolveExerciseMedia(ex, ex.execution_methods[0], 'en').fullTutorial).toBe(en);
  });
  it('resolveExerciseMedia: en with no en upload anywhere keeps the Hebrew tutorial', () => {
    const ex = { media: heOnly, execution_methods: [{ location: 'park', media: { fullTutorial: { he } } }] };
    expect(resolveExerciseMedia(ex, ex.execution_methods[0], 'en').fullTutorial).toBe(he);
  });

  it('resolveExerciseMedia: en is found on another method when the selected one has none', () => {
    const selected = { location: 'home', media: {} };
    const ex = { execution_methods: [selected, { location: 'park', media: { fullTutorial: { he, en } } }] };
    expect(resolveExerciseMedia(ex, selected, 'en').fullTutorial).toBe(en);
    expect(resolveExerciseMedia(ex, selected).fullTutorial).toBe(he);
  });

  it('buildSheetData: default and he are identical; en swaps only the tutorial', () => {
    const method = { id: 'm1', location: 'park', media: { fullTutorial: { he, en } } };
    const exercise = { id: 'e1', name: { he: 'שכיבות', en: 'Push-ups' }, media: both, execution_methods: [method] } as any;
    const base = buildSheetData(exercise, 'park', method as any);
    expect(buildSheetData(exercise, 'park', method as any, 'he', 'he')).toEqual(base);
    expect(base.tutorial).toBe(he);
    const enSheet = buildSheetData(exercise, 'park', method as any, 'he', 'en');
    expect(enSheet.tutorial).toBe(en);
    expect({ ...enSheet, tutorial: he }).toEqual(base);
  });
});
