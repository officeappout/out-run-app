import { describe, expect, it } from 'vitest';
import { resolveVideoAcross, videoLangOf, type ExerciseMedia } from '../exercise.types';
import { buildSheetData } from '../../client/utils/sheet-data.utils';
import { pickPreviewVideo } from '../../client/utils/card-media.utils';

const v = (videoId: string) => ({ videoId, provider: 'bunny' as const });

describe('resolveVideoAcross (AH5)', () => {
  const methodHeOnly: ExerciseMedia = { fullTutorial: { he: v('m-he') }, previewVideo: { he: v('mp-he') } };
  const rootBoth: ExerciseMedia = { fullTutorial: { he: v('r-he'), en: v('r-en') }, previewVideo: { en: v('rp-en') } };

  it('Hebrew is the old chain: first slot that resolves', () => {
    expect(resolveVideoAcross('fullTutorial', [methodHeOnly, rootBoth], 'he')?.videoId).toBe('m-he');
    expect(resolveVideoAcross('fullTutorial', [undefined, rootBoth], 'he')?.videoId).toBe('r-he');
    expect(resolveVideoAcross('previewVideo', [methodHeOnly, rootBoth], 'he')?.videoId).toBe('mp-he');
  });

  it('English upload in any slot wins over Hebrew in an earlier slot', () => {
    expect(resolveVideoAcross('fullTutorial', [methodHeOnly, rootBoth], 'en')?.videoId).toBe('r-en');
    expect(resolveVideoAcross('previewVideo', [methodHeOnly, rootBoth], 'en')?.videoId).toBe('rp-en');
  });

  it('English with no English upload falls back to the Hebrew chain', () => {
    expect(resolveVideoAcross('fullTutorial', [methodHeOnly, undefined], 'en')?.videoId).toBe('m-he');
    expect(resolveVideoAcross('fullTutorial', [undefined, undefined], 'en')).toBeUndefined();
  });

  it('only en leaves Hebrew', () => {
    expect(videoLangOf('en')).toBe('en');
    expect(videoLangOf('es')).toBe('he');
    expect(videoLangOf(undefined)).toBe('he');
  });

  it('library sheet and card use the content language', () => {
    const ex = {
      id: 'x',
      name: { he: 'שכיבת סמיכה', en: 'Push-up' },
      media: rootBoth,
      execution_methods: [{ location: 'park', media: methodHeOnly }],
    } as any;
    expect(buildSheetData(ex, 'park', undefined, 'he').tutorial?.videoId).toBe('m-he');
    expect(buildSheetData(ex, 'park', undefined, 'en').tutorial?.videoId).toBe('r-en');
    expect(pickPreviewVideo(ex, 'park')?.videoId).toBe('mp-he');
    expect(pickPreviewVideo(ex, 'park', 'en')?.videoId).toBe('rp-en');
  });
});
