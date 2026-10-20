/**
 * Simulated GPS for the tester browser (design §3.4). Pure: a route polyline + a pace profile →
 * the next fix every tick. The runner feeds each fix to Playwright's context.setGeolocation, so
 * the app's own navigator.geolocation path (accuracy / speed filters included) is exercised —
 * NOT the in-app dev simulator, which bypasses those filters.
 */

export type GpsProfileId = 'steady' | 'intervals' | 'walk_senior' | 'urban_canyon';

interface Profile {
  /** Pace multiplier at a distance into the session (1 = base pace; >1 slower). null = standing still. */
  paceFactorAt(distanceM: number, elapsedSec: number): number | null;
  accuracy: [number, number];
  noiseM: [number, number];
  /** Chance per tick of a jump of 30–80 m (urban canyon). */
  jumpChance: number;
}

export const GPS_PROFILES: Record<GpsProfileId, Profile> = {
  steady: { paceFactorAt: () => 1, accuracy: [4, 9], noiseM: [3, 6], jumpChance: 0 },
  intervals: {
    // 400 m fast / 200 m easy, repeating.
    paceFactorAt: (d) => ((d % 600) < 400 ? 0.85 : 1.35),
    accuracy: [4, 10],
    noiseM: [3, 7],
    jumpChance: 0,
  },
  walk_senior: {
    // A 25-second pause every 500 m.
    paceFactorAt: (d, t) => {
      void t;
      const intoBlock = d % 500;
      return intoBlock > 495 ? null : 1;
    },
    accuracy: [5, 12],
    noiseM: [3, 8],
    jumpChance: 0,
  },
  urban_canyon: { paceFactorAt: () => 1, accuracy: [25, 60], noiseM: [8, 20], jumpChance: 0.04 },
};

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineM(a: [number, number], b: [number, number]): number {
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function cumulative(route: ReadonlyArray<[number, number]>): number[] {
  const out = [0];
  for (let i = 1; i < route.length; i++) out.push(out[i - 1] + haversineM(route[i - 1], route[i]));
  return out;
}

/** Point `distanceM` along the route (wraps when loop, else clamps at the end). */
export function pointAt(route: ReadonlyArray<[number, number]>, cum: readonly number[], distanceM: number, loop: boolean): [number, number] {
  const total = cum[cum.length - 1];
  if (total === 0) return route[0];
  const d = loop ? ((distanceM % total) + total) % total : Math.min(Math.max(distanceM, 0), total);
  if (d >= total) return route[route.length - 1];
  let i = 1;
  while (i < cum.length && cum[i] < d) i++;
  const seg = cum[i] - cum[i - 1];
  const f = seg === 0 ? 0 : (d - cum[i - 1]) / seg;
  const a = route[i - 1];
  const b = route[i];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

/** Deterministic PRNG (mulberry32) so a run can be replayed. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GpsFix {
  latitude: number;
  longitude: number;
  accuracy: number;
  distanceM: number;
}

export class GpsSim {
  private readonly cum: number[];
  private readonly rand: () => number;
  private distance = 0;
  private elapsed = 0;
  private lostFor = 0;
  private poorFor = 0;

  constructor(
    private readonly route: ReadonlyArray<[number, number]>,
    private readonly profile: GpsProfileId,
    private readonly basePaceMinPerKm: number,
    private readonly loop = true,
    seed = 1,
  ) {
    this.cum = cumulative(route);
    this.rand = rng(seed);
  }

  get distanceM(): number {
    return this.distance;
  }

  loseSignal(seconds: number) {
    this.lostFor = Math.max(this.lostFor, seconds);
  }

  poorAccuracy(seconds: number) {
    this.poorFor = Math.max(this.poorFor, seconds);
  }

  private between([lo, hi]: [number, number]) {
    return lo + (hi - lo) * this.rand();
  }

  /** Advances `dtSec`; returns the fix to publish, or null while the signal is lost. */
  tick(dtSec: number): GpsFix | null {
    const p = GPS_PROFILES[this.profile];
    this.elapsed += dtSec;
    const factor = p.paceFactorAt(this.distance, this.elapsed);
    if (factor !== null) {
      const mps = 1000 / (this.basePaceMinPerKm * factor * 60);
      this.distance += mps * dtSec;
    } else {
      // Standing still: move past the stop point after ~25 s.
      if (this.rand() < dtSec / 25) this.distance += 6;
    }
    if (this.lostFor > 0) {
      this.lostFor = Math.max(0, this.lostFor - dtSec);
      return null;
    }
    const [lat, lng] = pointAt(this.route, this.cum, this.distance, this.loop);
    const poor = this.poorFor > 0;
    if (poor) this.poorFor = Math.max(0, this.poorFor - dtSec);
    const noise = poor ? this.between([20, 45]) : this.between(p.noiseM);
    const jump = this.rand() < p.jumpChance ? this.between([30, 80]) : 0;
    const angle = this.rand() * 2 * Math.PI;
    const off = noise + jump;
    const dLat = (off * Math.cos(angle)) / 111_320;
    const dLng = (off * Math.sin(angle)) / (111_320 * Math.cos(rad(lat)));
    return {
      latitude: lat + dLat,
      longitude: lng + dLng,
      accuracy: poor ? this.between([40, 80]) : this.between(p.accuracy),
      distanceM: this.distance,
    };
  }
}
