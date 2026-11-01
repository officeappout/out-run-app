/**
 * Pilot AJ8: a machine's Bunny video tries MP4 before native HLS on iOS, and the chain ends
 * (so the player can show the photo instead of a black box).
 */
import { describe, it, expect } from 'vitest';
import { bunnySourceChain, nextBunnySource } from '../bunny-sources';

const ID = '11111111-2222-3333-4444-555555555555';

describe('bunnySourceChain', () => {
  it('native HLS (iOS): MP4 720p, MP4 360p, then HLS last', () => {
    const chain = bunnySourceChain(ID, true);
    expect(chain).toHaveLength(3);
    expect(chain[0]).toMatch(new RegExp(`/${ID}/play_720p\\.mp4$`));
    expect(chain[1]).toMatch(new RegExp(`/${ID}/play_360p\\.mp4$`));
    expect(chain[2]).toMatch(new RegExp(`/${ID}/playlist\\.m3u8$`));
  });

  it('hls.js browsers: only the MP4 fallbacks (hls.js plays HLS itself)', () => {
    const chain = bunnySourceChain(ID, false);
    expect(chain.every((u) => u.endsWith('.mp4'))).toBe(true);
    expect(chain).toHaveLength(2);
  });
});

describe('nextBunnySource', () => {
  const chain = ['a', 'b', 'c'];
  it('walks the chain and ends with null', () => {
    expect(nextBunnySource(chain, null)).toBe('a');
    expect(nextBunnySource(chain, 'a')).toBe('b');
    expect(nextBunnySource(chain, 'c')).toBeNull();
    expect(nextBunnySource(chain, 'unknown')).toBeNull();
  });
});
