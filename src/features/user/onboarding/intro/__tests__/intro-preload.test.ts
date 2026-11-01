import { describe, expect, it, vi } from 'vitest';
import { BARRIER_STORY_META, storyImages } from '../intro-copy';
import { introPreloadOrder, warmImages } from '../intro-preload';

describe('intro image warm-up (pilot note AJ2)', () => {
  it('on the bridge: every story image, the first story first', () => {
    const all = introPreloadOrder(-1);
    expect(all.slice(0, 3)).toEqual(storyImages(BARRIER_STORY_META[0]));
    expect(new Set(all).size).toBe(all.length);
    expect(all).toEqual(BARRIER_STORY_META.flatMap((m) => storyImages(m)));
  });

  it('on a story: only what is still to come, the next one first', () => {
    expect(introPreloadOrder(1).slice(0, 3)).toEqual(storyImages(BARRIER_STORY_META[2]));
    expect(introPreloadOrder(1)).not.toContain(storyImages(BARRIER_STORY_META[1])[0]);
    expect(introPreloadOrder(BARRIER_STORY_META.length - 1)).toEqual([]);
  });

  it('requests and decodes each image once, and keeps it alive', () => {
    const cache = new Map();
    const decode = vi.fn(() => Promise.resolve());
    const make = vi.fn(() => ({ src: '', decode }));
    warmImages(['/a.jpg', '/b.png'], cache, make);
    warmImages(['/a.jpg', '/b.png', '/c.jpg'], cache, make);
    expect(make).toHaveBeenCalledTimes(3);
    expect(decode).toHaveBeenCalledTimes(3);
    expect(Array.from(cache.keys())).toEqual(['/a.jpg', '/b.png', '/c.jpg']);
    expect(cache.get('/a.jpg').src).toBe('/a.jpg');
  });
});
