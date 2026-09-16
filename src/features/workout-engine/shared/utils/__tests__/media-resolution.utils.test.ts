import { describe, it, expect } from 'vitest';
import { byParkFirst, resolveExerciseMedia } from '../media-resolution.utils';

/**
 * byParkFirst is a stable partition: park-tagged elements first (original
 * relative order), then everything else (original relative order). Property
 * coverage restored as a permanent test after a reviewer's manual check
 * found a measurable behavior change from this function (see the
 * parking-lot.md correction on the same date) — this locks the three
 * invariants that make it a correct stable partition, not just "does
 * something with park."
 */

const ALPHABET_SIZE = 5; // park, home, office, undefined, null

/** Builds one array element for a given alphabet symbol. `id` gives
 *  same-tag elements (e.g. two 'park' entries) a distinct identity so
 *  duplication/loss and order can be checked precisely. */
function buildElement(symbolIdx: number, id: number): any {
  switch (symbolIdx) {
    case 0: return { location: 'park', _id: id };
    case 1: return { location: 'home', _id: id };
    case 2: return { location: 'office', _id: id };
    case 3: return undefined;
    case 4: return null;
    default: throw new Error(`bad symbol ${symbolIdx}`);
  }
}

function identityKey(el: any): string {
  if (el === undefined) return 'undefined';
  if (el === null) return 'null';
  return `obj:${el._id}`;
}

function isPark(el: any): boolean {
  return el?.location === 'park';
}

/** The three invariants byParkFirst must hold for ANY input array. */
function assertInvariants(input: any[], output: any[]): void {
  // 1. No member lost or duplicated — same multiset of identities.
  expect(output.length).toBe(input.length);
  expect(output.map(identityKey).sort()).toEqual(input.map(identityKey).sort());

  // 2. park before rest — no non-park element precedes any park element.
  const firstNonPark = output.findIndex((el) => !isPark(el));
  if (firstNonPark !== -1) {
    for (let i = firstNonPark; i < output.length; i++) {
      expect(isPark(output[i])).toBe(false);
    }
  }

  // 3. Relative order preserved within each partition (stable, not just sorted).
  expect(output.filter(isPark).map(identityKey))
    .toEqual(input.filter(isPark).map(identityKey));
  expect(output.filter((el) => !isPark(el)).map(identityKey))
    .toEqual(input.filter((el) => !isPark(el)).map(identityKey));
}

/** All arrays of exactly `len` alphabet symbols, as index-arrays. */
function allSymbolCombos(len: number): number[][] {
  if (len === 0) return [[]];
  const shorter = allSymbolCombos(len - 1);
  const result: number[][] = [];
  for (let first = 0; first < ALPHABET_SIZE; first++) {
    for (const rest of shorter) {
      result.push([first, ...rest]);
    }
  }
  return result;
}

describe('byParkFirst — exhaustive property coverage, length <= 5', () => {
  for (let len = 0; len <= 5; len++) {
    it(`holds for all ${Math.pow(ALPHABET_SIZE, len)} arrays of length ${len}`, () => {
      let count = 0;
      for (const combo of allSymbolCombos(len)) {
        const input = combo.map((symbolIdx, i) => buildElement(symbolIdx, i));
        assertInvariants(input, byParkFirst(input));
        count++;
      }
      expect(count).toBe(Math.pow(ALPHABET_SIZE, len));
    });
  }
});

/** Deterministic PRNG (mulberry32) — reproducible "random" coverage, not
 *  Math.random(): a failure here must reproduce identically on every run. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('byParkFirst — randomized property coverage, length <= 12', () => {
  it('holds across 500 seeded-random arrays up to length 12', () => {
    const rand = mulberry32(0xC0FFEE);
    for (let trial = 0; trial < 500; trial++) {
      const len = Math.floor(rand() * 13); // 0..12
      const input = Array.from({ length: len }, (_, i) =>
        buildElement(Math.floor(rand() * ALPHABET_SIZE), i));
      assertInvariants(input, byParkFirst(input));
    }
  });
});

describe('byParkFirst — named edge cases', () => {
  it('empty array → empty array', () => {
    expect(byParkFirst([])).toEqual([]);
  });

  it('no park present → order unchanged', () => {
    const input = [{ location: 'home', _id: 1 }, { location: 'office', _id: 2 }, undefined, null];
    expect(byParkFirst(input)).toEqual(input);
  });

  it('several park entries → all precede the rest, relative order kept among themselves', () => {
    const p1 = { location: 'park', _id: 1 };
    const home = { location: 'home', _id: 2 };
    const p2 = { location: 'park', _id: 3 };
    const office = { location: 'office', _id: 4 };
    const p3 = { location: 'park', _id: 5 };
    const result = byParkFirst([home, p1, office, p2, p3]);
    expect(result).toEqual([p1, p2, p3, home, office]);
  });

  it('null in the array → treated as non-park, survives, does not throw', () => {
    const park = { location: 'park', _id: 1 };
    const result = byParkFirst([null, park, undefined]);
    expect(result).toEqual([park, null, undefined]);
  });

  it('all-park array → unchanged order, nothing to partition against', () => {
    const p1 = { location: 'park', _id: 1 };
    const p2 = { location: 'park', _id: 2 };
    expect(byParkFirst([p1, p2])).toEqual([p1, p2]);
  });
});

/**
 * resolveExerciseMedia's bunnyVideoId resolution — 16.09.2026 unification.
 * Previously this ALWAYS returned undefined for a machine pseudo-exercise
 * (buildMachinePseudoExercise stamps the Bunny URL on method.media.mainVideoUrl,
 * with no execution_methods array to fall through), because the old local
 * _BUNNY_UUID regex required a trailing slash after the uuid that neither the
 * embed nor the play URL shape has. Now goes through the shared
 * extractBunnyVideoId (bunny.config.ts) instead.
 */
describe('resolveExerciseMedia — bunnyVideoId resolution through the shared extractor', () => {
  const machinePseudoExercise = { media: {} }; // buildMachinePseudoExercise's exact shape

  it('resolves bunnyVideoId from method.media.mainVideoUrl for the embed shape, and videoUrl becomes the direct Bunny stream MP4 (not the raw embed page) — this is what makes hasValidDirectVideoUrl match in the live player', () => {
    const method = { media: { mainVideoUrl: 'https://iframe.bunnycdn.com/embed/640043/19614c57-e3cb-4b9c-b303-30d0cab0fa95' } };
    const result = resolveExerciseMedia(machinePseudoExercise, method);
    expect(result.bunnyVideoId).toBe('19614c57-e3cb-4b9c-b303-30d0cab0fa95');
    expect(result.videoUrl).toContain('19614c57-e3cb-4b9c-b303-30d0cab0fa95');
    expect(result.videoUrl).toMatch(/\.mp4$/);
  });

  it('resolves bunnyVideoId from method.media.mainVideoUrl for the play shape (the shoulder-press oddball)', () => {
    const method = { media: { mainVideoUrl: 'https://player.mediadelivery.net/play/640043/c835f0ac-3769-4318-9468-9cbff90afb06' } };
    const result = resolveExerciseMedia(machinePseudoExercise, method);
    expect(result.bunnyVideoId).toBe('c835f0ac-3769-4318-9468-9cbff90afb06');
  });

  it('a genuinely non-Bunny direct video URL still resolves videoUrl with no bunnyVideoId (unaffected regular-exercise path)', () => {
    const method = { media: { mainVideoUrl: 'https://appoutimages.b-cdn.net/exercises/pushup/video.mp4' } };
    const result = resolveExerciseMedia(machinePseudoExercise, method);
    expect(result.bunnyVideoId).toBeUndefined();
    expect(result.videoUrl).toBe(method.media.mainVideoUrl);
  });
});
