import { describe, expect, it } from 'vitest';
import { buildTvMedia, tvSafeUrl, TV_MEDIA_URL_MAX } from '../core/media';
import { parseMirror } from '../services/firestore-tv-parse';
import { initialMirror, mirrorReducer } from '../core/mirror';

const bunny = (id: string) => `https://vz.example.net/${id}/play_720p.mp4`;

describe('media the TV may load', () => {
  it('only public https URLs, bounded', () => {
    expect(tvSafeUrl('https://cdn.example.com/a.mp4')).toBe('https://cdn.example.com/a.mp4');
    for (const bad of ['http://cdn.example.com/a.mp4', 'blob:https://x/1', 'data:image/png;base64,AAA', '/relative.mp4', 'javascript:alert(1)', '', null, 5, 'https://' + 'a'.repeat(TV_MEDIA_URL_MAX)]) {
      expect(tvSafeUrl(bad)).toBeUndefined();
    }
  });
  it('a Bunny clip becomes its CDN mp4, a legacy https URL stays, blobs are dropped', () => {
    expect(buildTvMedia({ bunnyVideoId: 'abc', videoUrl: 'https://old.example.com/x.mp4', imageUrl: 'https://i.example.com/p.jpg' }, bunny)).toEqual({ videoUrl: 'https://vz.example.net/abc/play_720p.mp4', imageUrl: 'https://i.example.com/p.jpg' });
    expect(buildTvMedia({ videoUrl: 'https://old.example.com/x.mp4' }, bunny)).toEqual({ videoUrl: 'https://old.example.com/x.mp4' });
    expect(buildTvMedia({ videoUrl: 'blob:https://app/1', imageUrl: 'blob:https://app/2' }, bunny)).toBeUndefined();
  });
  it('the mirror carries media and mode through the reducer and the doc parser; a hostile doc is sanitised', () => {
    const m = mirrorReducer(initialMirror(), { type: 'exercise', index: 0, count: 3, name: 'x', setCount: 2, media: { videoUrl: 'https://c.example.com/a.mp4' }, nextMedia: { imageUrl: 'https://c.example.com/b.jpg' }, mode: 'tabata' });
    const parsed = parseMirror(JSON.parse(JSON.stringify(m)));
    expect(parsed).toMatchObject({ mode: 'tabata', media: { videoUrl: 'https://c.example.com/a.mp4' }, nextMedia: { imageUrl: 'https://c.example.com/b.jpg' } });
    const hostile = parseMirror({ ...JSON.parse(JSON.stringify(m)), media: { videoUrl: 'http://evil.example.com/a.mp4', imageUrl: 'javascript:1' }, nextMedia: 'nope', mode: 'bogus' });
    expect(hostile?.media).toBeUndefined();
    expect(hostile?.nextMedia).toBeUndefined();
    expect(hostile?.mode).toBeUndefined();
  });
});
