import { describe, it, expect } from 'vitest';
import { extractBunnyVideoId } from '../bunny.config';

describe('extractBunnyVideoId (16.09.2026 unification — single source of truth for both the machine-detail drawer and the live player)', () => {
  it('resolves iframe.bunnycdn.com/embed/{lib}/{uuid} — the working majority format, no trailing slash needed', () => {
    expect(
      extractBunnyVideoId('https://iframe.bunnycdn.com/embed/640043/19614c57-e3cb-4b9c-b303-30d0cab0fa95'),
    ).toBe('19614c57-e3cb-4b9c-b303-30d0cab0fa95');
  });

  it('resolves iframe.mediadelivery.net/embed/{lib}/{uuid} — same embed player, the newer domain (also what buildBunnyEmbedUrl generates)', () => {
    expect(
      extractBunnyVideoId('https://iframe.mediadelivery.net/embed/640043/38130822-7464-43c5-ba33-0d73a67592f1'),
    ).toBe('38130822-7464-43c5-ba33-0d73a67592f1');
  });

  it('resolves player.mediadelivery.net/play/{lib}/{uuid} — the shoulder-press oddball shape, previously unsupported anywhere', () => {
    expect(
      extractBunnyVideoId('https://player.mediadelivery.net/play/640043/c835f0ac-3769-4318-9468-9cbff90afb06'),
    ).toBe('c835f0ac-3769-4318-9468-9cbff90afb06');
  });

  it('resolves a slash-surrounded {uuid} anywhere in a generic CDN path', () => {
    expect(
      extractBunnyVideoId('https://vz-b17872ab-7a7.b-cdn.net/19614c57-e3cb-4b9c-b303-30d0cab0fa95/play_720p.mp4'),
    ).toBe('19614c57-e3cb-4b9c-b303-30d0cab0fa95');
  });

  it('resolves a bare 36-char {uuid} string', () => {
    expect(extractBunnyVideoId('19614c57-e3cb-4b9c-b303-30d0cab0fa95')).toBe('19614c57-e3cb-4b9c-b303-30d0cab0fa95');
  });

  it('returns null for null/undefined/empty', () => {
    expect(extractBunnyVideoId(null)).toBeNull();
    expect(extractBunnyVideoId(undefined)).toBeNull();
    expect(extractBunnyVideoId('')).toBeNull();
  });

  it('returns null for a non-Bunny URL (YouTube, direct MP4, or a plain image)', () => {
    expect(extractBunnyVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(extractBunnyVideoId('https://example.com/videos/clip.mp4')).toBeNull();
    expect(extractBunnyVideoId('https://appoutimages.b-cdn.net/equipment/x/y.jpg')).toBeNull();
  });

  it('previously required a trailing slash after the uuid (the actual bug) — confirms neither embed nor play shape has one and both still resolve', () => {
    const embed = 'https://iframe.bunnycdn.com/embed/640043/19614c57-e3cb-4b9c-b303-30d0cab0fa95';
    const play = 'https://player.mediadelivery.net/play/640043/c835f0ac-3769-4318-9468-9cbff90afb06';
    expect(embed.endsWith('/')).toBe(false);
    expect(play.endsWith('/')).toBe(false);
    expect(extractBunnyVideoId(embed)).not.toBeNull();
    expect(extractBunnyVideoId(play)).not.toBeNull();
  });
});
