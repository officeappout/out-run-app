import { describe, it, expect } from 'vitest';
import {
  buildDiveSequence,
  buildRestStep,
  globeRestCamera,
  globeCentredCamera,
  zoomForRadius,
  restRadius,
  nextSpinOffset,
  arrivalTimeoutMs,
  ISRAEL_CENTER,
  REGION_ZOOM,
  STREET_ZOOM,
  DIVE_DURATIONS,
} from '../globe-camera';
import { skyFog } from '../globe-sky';

const phone = { width: 390, height: 844 };

describe('zoomForRadius', () => {
  it('radius 512/2π px → zoom 0, doubles per zoom level', () => {
    expect(zoomForRadius(512 / (2 * Math.PI))).toBeCloseTo(0, 6);
    expect(zoomForRadius(1024 / (2 * Math.PI))).toBeCloseTo(1, 6);
  });
  it('never NaN / -Infinity for a zero radius', () => {
    expect(Number.isFinite(zoomForRadius(0))).toBe(true);
  });
});

describe('globeRestCamera — the half-circle trick', () => {
  it('pads the full height on top (centre pinned to the bottom edge), faces Israel', () => {
    const c = globeRestCamera(phone);
    expect(c.padding).toEqual({ top: 844, bottom: 0, left: 0, right: 0 });
    expect(c.center).toEqual(ISRAEL_CENTER);
    expect(c.zoom).toBeCloseTo(zoomForRadius(restRadius(phone)), 6);
    expect(restRadius(phone)).toBe(422); // top of the Earth ≈ mid-screen on a phone
  });
  it('idle spin offsets the longitude only', () => {
    const c = globeRestCamera(phone, -10);
    expect(c.center).toEqual([ISRAEL_CENTER[0] - 10, ISRAEL_CENTER[1]]);
  });
  it('falls back to a phone viewport on a zero-size node', () => {
    expect(globeRestCamera({ width: 0, height: 0 }).padding.top).toBe(844);
  });
});

describe('buildDiveSequence', () => {
  it('still locating: lift the Earth to centre, then fly to the country', () => {
    const steps = buildDiveSequence({ viewport: phone, target: null });
    expect(steps.map((s) => [s.method, s.role])).toEqual([
      ['easeTo', 'globe'],
      ['flyTo', 'region'],
    ]);
    expect(steps[0].options.padding.top).toBe(0);
    expect(steps[0].options).toEqual(globeCentredCamera(phone));
    expect(steps[1].options.zoom).toBe(REGION_ZOOM);
    expect(steps[1].options.center).toEqual(ISRAEL_CENTER);
    expect(steps.every((s) => s.options.essential)).toBe(true);
  });
  it('fix known: ONE flyTo from the current camera to the street (smooth mid-dive retarget)', () => {
    const steps = buildDiveSequence({ viewport: phone, target: { lat: 32.09, lng: 34.78 } });
    expect(steps).toHaveLength(1);
    expect(steps[0].method).toBe('flyTo');
    expect(steps[0].role).toBe('street');
    expect(steps[0].options.center).toEqual([34.78, 32.09]);
    expect(steps[0].options.zoom).toBe(STREET_ZOOM);
    expect(steps[0].options.padding).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
    expect(steps[0].options.duration).toBe(DIVE_DURATIONS.street);
  });
  it('street zoom matches the street map below (cross-fade lines up)', () => {
    expect(STREET_ZOOM).toBe(14);
  });
  it('reduced motion: jumps, no flights', () => {
    const a = buildDiveSequence({ viewport: phone, target: { lat: 31, lng: 35 }, reduceMotion: true });
    expect(a).toHaveLength(1);
    expect(a[0].method).toBe('jumpTo');
    expect(a[0].options.duration).toBe(0);
    const b = buildDiveSequence({ viewport: phone, target: null, reduceMotion: true });
    expect(b.map((s) => s.method)).toEqual(['jumpTo']);
  });
  it('an invalid target is treated as "still locating"', () => {
    const steps = buildDiveSequence({ viewport: phone, target: { lat: Number.NaN, lng: 34 } });
    expect(steps.map((s) => s.role)).toEqual(['globe', 'region']);
    expect(buildDiveSequence({ viewport: phone, target: { lat: 120, lng: 34 } })[0].role).toBe('globe');
  });
});

describe('rest / spin / safety', () => {
  it('back to rest eases to the half circle (jump under reduced motion)', () => {
    const r = buildRestStep(phone);
    expect(r.method).toBe('easeTo');
    expect(r.options.padding.top).toBe(844);
    expect(r.options.duration).toBe(DIVE_DURATIONS.rest);
    expect(buildRestStep(phone, true).method).toBe('jumpTo');
  });
  it('spin offset wraps within [-180, 180)', () => {
    expect(nextSpinOffset(0)).toBeCloseTo(-0.04, 6);
    const w = nextSpinOffset(-179.99, 1);
    expect(w).toBeGreaterThanOrEqual(-180);
    expect(w).toBeLessThan(180);
    expect(w).toBeCloseTo(179.01, 6);
  });
  it('arrival timeout exceeds the flight', () => {
    const [s] = buildDiveSequence({ viewport: phone, target: { lat: 32, lng: 34.8 } });
    expect(arrivalTimeoutMs(s)).toBeGreaterThan(s.options.duration);
  });
});

describe('skyFog', () => {
  it('t=0 is the page sky, t=1 deep space with stars; clamps', () => {
    expect(skyFog(0)['space-color']).toBe('rgb(244, 247, 250)');
    expect(skyFog(0)['star-intensity']).toBe(0);
    expect(skyFog(1)['space-color']).toBe('rgb(6, 10, 20)');
    expect(skyFog(1)['star-intensity']).toBeCloseTo(0.45, 6);
    expect(skyFog(5)).toEqual(skyFog(1));
    expect(skyFog(Number.NaN)).toEqual(skyFog(0));
  });
});
