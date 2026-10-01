import { describe, it, expect } from 'vitest';
import { resolveImageForLocation } from '../exercise.types';

/**
 * Hero-image fix (2026-10-01): a real video always exists for a composed
 * workout exercise — this pins that resolveImageForLocation now derives a
 * real Bunny thumbnail from it instead of (a) returning the raw video URL
 * as a broken "image", or (b) returning '' and pushing the caller to a
 * generic stock-photo fallback. See the function's own doc comment.
 */
describe('resolveImageForLocation', () => {
  it('derives a real Bunny thumbnail from a plain Bunny-hosted mainVideoUrl (no dedicated preview field)', () => {
    const exercise: any = {
      execution_methods: [
        {
          location: 'park',
          media: {
            // buildBunnyStreamUrl's own output shape — no previewVideo field at all.
            mainVideoUrl: 'https://vz-b17872ab-7a7.b-cdn.net/a1b2c3d4-e5f6-7890-abcd-ef1234567890/play_360p.mp4',
          },
        },
      ],
    };
    const image = resolveImageForLocation(exercise, 'park');
    expect(image).toBe('https://vz-b17872ab-7a7.b-cdn.net/a1b2c3d4-e5f6-7890-abcd-ef1234567890/thumbnail.jpg');
  });

  it('never returns the raw video URL itself as an "image" when nothing else resolves', () => {
    const exercise: any = {
      execution_methods: [
        { location: 'park', media: { mainVideoUrl: 'https://example.com/not-a-bunny-url.mp4' } },
      ],
    };
    const image = resolveImageForLocation(exercise, 'park');
    expect(image).not.toBe('https://example.com/not-a-bunny-url.mp4');
    expect(image).toBe('');
  });

  it('still prefers a dedicated Bunny preview thumbnail/videoId over deriving from mainVideoUrl', () => {
    const exercise: any = {
      execution_methods: [
        {
          location: 'park',
          media: {
            mainVideoUrl: 'https://vz-b17872ab-7a7.b-cdn.net/wrong-id/play_360p.mp4',
            previewVideo: { he: { videoId: 'real-preview-id' } },
          },
        },
      ],
    };
    const image = resolveImageForLocation(exercise, 'park');
    expect(image).toBe('https://vz-b17872ab-7a7.b-cdn.net/real-preview-id/thumbnail.jpg');
  });

  it('still prefers an explicit imageUrl over deriving from mainVideoUrl', () => {
    const exercise: any = {
      execution_methods: [
        {
          location: 'park',
          media: {
            mainVideoUrl: 'https://vz-b17872ab-7a7.b-cdn.net/a1b2c3d4-e5f6-7890-abcd-ef1234567890/play_360p.mp4',
            imageUrl: 'https://example.com/real-admin-uploaded-image.jpg',
          },
        },
      ],
    };
    const image = resolveImageForLocation(exercise, 'park');
    expect(image).toBe('https://example.com/real-admin-uploaded-image.jpg');
  });

  it('falls back to the legacy root-level media.videoUrl when the method has no mainVideoUrl', () => {
    const exercise: any = {
      execution_methods: [{ location: 'park', media: {} }],
      media: { videoUrl: 'https://vz-b17872ab-7a7.b-cdn.net/a1b2c3d4-e5f6-7890-abcd-ef1234567890/play_360p.mp4' },
    };
    const image = resolveImageForLocation(exercise, 'park');
    expect(image).toBe('https://vz-b17872ab-7a7.b-cdn.net/a1b2c3d4-e5f6-7890-abcd-ef1234567890/thumbnail.jpg');
  });
});
