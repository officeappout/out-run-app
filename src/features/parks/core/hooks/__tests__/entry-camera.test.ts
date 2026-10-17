import { describe, it, expect } from 'vitest';
import {
  decideEntryCamera,
  pickGlobeIntroTarget,
  entryCorrection,
  easeInOutCubic,
  GLOBE_INTRO_FALLBACK_CENTER,
  GLOBE_INTRO_MAX_WAIT_MS,
} from '../entry-camera';

const base = { homeV2: true, introSeen: false, prefersReducedMotion: false };

describe('decideEntryCamera', () => {
  it('flag off → the legacy single dive, whatever else is true', () => {
    expect(decideEntryCamera({ ...base, homeV2: false })).toBe('dive');
    expect(decideEntryCamera({ homeV2: false, introSeen: true, prefersReducedMotion: true })).toBe('dive');
  });
  it('v2 first-ever entry → globe intro', () => {
    expect(decideEntryCamera(base)).toBe('globe_intro');
  });
  it('v2 later entries → straight to location', () => {
    expect(decideEntryCamera({ ...base, introSeen: true })).toBe('settle');
  });
  it('reduced motion skips the flight', () => {
    expect(decideEntryCamera({ ...base, prefersReducedMotion: true })).toBe('settle');
  });
  it('a deep-linked camera target skips the flight', () => {
    expect(decideEntryCamera({ ...base, hasOtherCameraIntent: true })).toBe('settle');
  });
});

describe('pickGlobeIntroTarget', () => {
  const live = { lat: 32.1, lng: 34.8 };
  const seed = { lat: 32.0, lng: 34.7 };
  const anchor = { lat: 31.0, lng: 35.0 };
  it('prefers the live fix', () => {
    expect(pickGlobeIntroTarget({ currentLocation: live, accurateSeed: seed, coarseFallback: anchor, waitedMs: 0 })).toBe(live);
  });
  it('flies to the accurate seed without waiting', () => {
    expect(pickGlobeIntroTarget({ currentLocation: null, accurateSeed: seed, coarseFallback: anchor, waitedMs: 0 })).toBe(seed);
  });
  it('waits on the globe (null) while only a coarse fallback exists and the budget is not spent', () => {
    expect(pickGlobeIntroTarget({ currentLocation: null, accurateSeed: null, coarseFallback: anchor, waitedMs: 100 })).toBeNull();
  });
  it('after the wait budget: coarse fallback, then Israel', () => {
    const waitedMs = GLOBE_INTRO_MAX_WAIT_MS;
    expect(pickGlobeIntroTarget({ currentLocation: null, accurateSeed: null, coarseFallback: anchor, waitedMs })).toBe(anchor);
    expect(pickGlobeIntroTarget({ currentLocation: null, accurateSeed: null, coarseFallback: null, waitedMs })).toBe(GLOBE_INTRO_FALLBACK_CENTER);
  });
  it('rejects NaN coordinates', () => {
    expect(pickGlobeIntroTarget({ currentLocation: { lat: NaN, lng: NaN }, accurateSeed: null, coarseFallback: null, waitedMs: 0 })).toBeNull();
  });
});

describe('entryCorrection', () => {
  const at = { lat: 32.0, lng: 34.8 };
  it('no live fix → nothing', () => {
    expect(entryCorrection(at, null)).toBe('none');
  });
  it('within the threshold → nothing (no second movement)', () => {
    expect(entryCorrection(at, { lat: 32.0003, lng: 34.8 })).toBe('none'); // ~33m
  });
  it('a short distance → a gentle ease', () => {
    expect(entryCorrection(at, { lat: 32.005, lng: 34.8 })).toBe('ease'); // ~550m
  });
  it('far away, or still hidden behind the skeleton → jump', () => {
    expect(entryCorrection(at, { lat: 32.2, lng: 34.8 })).toBe('jump'); // ~22km
    expect(entryCorrection(at, { lat: 32.005, lng: 34.8 }, { mapHidden: true })).toBe('jump');
  });
});

describe('easeInOutCubic', () => {
  it('starts at 0, ends at 1, is symmetric at the midpoint, clamps', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
    expect(easeInOutCubic(0.25)).toBeCloseTo(1 - easeInOutCubic(0.75));
    expect(easeInOutCubic(-1)).toBe(0);
    expect(easeInOutCubic(2)).toBe(1);
  });
});
