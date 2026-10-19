/**
 * route-elevation-ahead — the elevation strip in the live route-run sheet
 * (home v2, board R3-prop-route-live): profile area + "you are here" marker
 * + km ticks + "climb in N m".
 *
 * DATA: no route document carries elevation SAMPLES today. official_routes
 * (trails pipeline #424/#426, firestore-docs.routeDocPayload) stores only
 * `elevationGain` / `maxGrade`; trail_segments store aggregate min/max/gain
 * per segment (SegmentElevation). So `readElevationSamples` returns null for
 * every route that exists now and the strip renders nothing. It is ready for
 * an equally-spaced profile on the route doc:
 *   elevationProfile: { stepM: number; elevationsM: number[] }
 * (e.g. dem-tile-cache/elevation-profile's 15 m resample, if the pipeline
 * starts storing it). We never fetch DEM at runtime.
 *
 * Pure — all geometry in a caller-sized viewBox. RTL: the route's start is on
 * the RIGHT (x = W at 0 m, x = 0 at the finish).
 */

export interface ElevationSamples {
  /** Distance between consecutive samples (m). */
  stepM: number;
  /** Elevation (m) at 0, stepM, 2·stepM, … along the route. */
  elevationsM: number[];
}

const MAX_SAMPLES = 5000;

/** Defensive read of `route.elevationProfile`; null unless it's a usable profile. */
export function readElevationSamples(route: unknown): ElevationSamples | null {
  if (!route || typeof route !== 'object') return null;
  const raw = (route as { elevationProfile?: unknown }).elevationProfile;
  if (!raw || typeof raw !== 'object') return null;
  const { stepM, elevationsM } = raw as { stepM?: unknown; elevationsM?: unknown };
  if (typeof stepM !== 'number' || !Number.isFinite(stepM) || stepM <= 0) return null;
  if (!Array.isArray(elevationsM) || elevationsM.length < 2 || elevationsM.length > MAX_SAMPLES) return null;
  if (!elevationsM.every((e) => typeof e === 'number' && Number.isFinite(e))) return null;
  return { stepM, elevationsM: elevationsM as number[] };
}

export const profileLengthM = (s: ElevationSamples): number => (s.elevationsM.length - 1) * s.stepM;

/** Elevation at `alongM` (linear between samples, clamped to the profile). */
export function elevationAt(s: ElevationSamples, alongM: number): number {
  const L = profileLengthM(s);
  const x = Math.max(0, Math.min(L, Number.isFinite(alongM) ? alongM : 0));
  const i = Math.min(s.elevationsM.length - 2, Math.floor(x / s.stepM));
  const t = (x - i * s.stepM) / s.stepM;
  return s.elevationsM[i] + (s.elevationsM[i + 1] - s.elevationsM[i]) * t;
}

/**
 * A loop session is rotated to start where the user joined it
 * (useWorkoutSession → planFromPoint), so along-session metres are offset
 * from the stored profile. Re-sample starting at `offsetM`, wrapping round.
 */
export function rotateElevationSamples(s: ElevationSamples, offsetM: number): ElevationSamples {
  const L = profileLengthM(s);
  if (!Number.isFinite(offsetM) || L <= 0) return s;
  const off = ((offsetM % L) + L) % L;
  if (off === 0) return s;
  const elevationsM = s.elevationsM.map((_, i) => elevationAt(s, (off + i * s.stepM) % L));
  // The wrapped end closes the loop back at the start elevation.
  elevationsM[elevationsM.length - 1] = elevationsM[0];
  return { stepM: s.stepM, elevationsM };
}

export interface ClimbAhead {
  /** Metres from the user to the start of the climb. */
  inM: number;
  /** Average grade over the climb, %. */
  gradePct: number;
  lengthM: number;
}

/**
 * The next sustained uphill ahead of `alongM`: consecutive sample intervals
 * at ≥ minGradePct whose combined length ≥ minLengthM, starting within
 * lookAheadM. null when the road ahead is flat / downhill.
 */
export function nextClimbAhead(
  s: ElevationSamples,
  alongM: number,
  opts: { lookAheadM?: number; minGradePct?: number; minLengthM?: number } = {},
): ClimbAhead | null {
  const lookAhead = opts.lookAheadM ?? 1500;
  const minGrade = opts.minGradePct ?? 3;
  const minLen = opts.minLengthM ?? 60;
  const n = s.elevationsM.length;
  const start = Math.max(0, Math.floor((Number.isFinite(alongM) ? alongM : 0) / s.stepM));
  let runStart = -1;
  let runRise = 0;
  for (let i = start; i < n - 1; i++) {
    const rise = s.elevationsM[i + 1] - s.elevationsM[i];
    const grade = (rise / s.stepM) * 100;
    if (grade >= minGrade) {
      if (runStart < 0) {
        if (i * s.stepM - alongM > lookAhead) return null;
        runStart = i;
        runRise = 0;
      }
      runRise += rise;
    } else if (runStart >= 0) {
      const len = (i - runStart) * s.stepM;
      if (len >= minLen) return climb(runStart, len, runRise);
      runStart = -1;
    }
  }
  if (runStart >= 0) {
    const len = (n - 1 - runStart) * s.stepM;
    if (len >= minLen) return climb(runStart, len, runRise);
  }
  return null;

  function climb(idx: number, len: number, rise: number): ClimbAhead {
    return {
      inM: Math.max(0, idx * s.stepM - alongM),
      gradePct: Math.round((rise / len) * 1000) / 10,
      lengthM: len,
    };
  }
}

/** Hebrew line for the strip header ("עלייה קלה בעוד 300 מ׳"); null when none. */
export function climbLabel(c: ClimbAhead | null): string | null {
  if (!c) return null;
  const kind = c.gradePct < 6 ? 'עלייה קלה' : 'עלייה';
  if (c.inM < 30) return `${kind} עכשיו`;
  const m = c.inM < 1000 ? `${Math.round(c.inM / 10) * 10} מ׳` : `${(c.inM / 1000).toFixed(1)} ק״מ`;
  return `${kind} בעוד ${m}`;
}

export interface KmTick {
  label: string;
  /** x in the strip's viewBox (RTL: start on the right). */
  x: number;
}

const fmtKm = (km: number) => (Number.isInteger(km) ? String(km) : km.toFixed(1));

/**
 * Whole-km ticks plus the finish. On long routes ticks thin out to every
 * n-th km (≤ maxTicks). An integer tick within 30% of a km of the finish is
 * dropped so the labels don't collide.
 */
export function kmTicks(totalM: number, width: number, maxTicks = 7): KmTick[] {
  if (!Number.isFinite(totalM) || totalM <= 0 || width <= 0) return [];
  const totalKm = totalM / 1000;
  const x = (m: number) => width * (1 - m / totalM);
  const whole = Math.floor(totalKm);
  const every = Math.max(1, Math.ceil((whole + 1) / Math.max(2, maxTicks - 1)));
  const ticks: KmTick[] = [];
  for (let k = 0; k <= whole; k += every) {
    if (k > 0 && totalKm - k < 0.3 * every) break;
    ticks.push({ label: String(k), x: x(k * 1000) });
  }
  ticks.push({ label: fmtKm(Math.round(totalKm * 10) / 10), x: 0 });
  return ticks;
}

export interface ElevationStripGeometry {
  /** Closed area path (fill). */
  areaD: string;
  /** Profile line path (stroke). */
  lineD: string;
  /** "You are here" marker. */
  you: { x: number; y: number };
  ticks: KmTick[];
  totalM: number;
}

/**
 * SVG geometry for the strip. `totalM` is the route length the user's
 * progress is measured against (NavBannerV2's along-route metres); the
 * profile is stretched onto it so a profile a few metres shorter/longer
 * than the drawn path still lines up end to end. `padTop` keeps the
 * marker's dot inside the box at the highest point.
 */
export function buildElevationStrip(
  s: ElevationSamples,
  alongM: number | null,
  totalM: number,
  box: { width: number; height: number; padTop?: number; padBottom?: number; maxPoints?: number },
): ElevationStripGeometry | null {
  const L = profileLengthM(s);
  if (L <= 0 || !Number.isFinite(totalM) || totalM <= 0) return null;
  const { width: W, height: H } = box;
  const padTop = box.padTop ?? 6;
  const padBottom = box.padBottom ?? 4;
  const maxPoints = Math.max(2, box.maxPoints ?? 120);
  let min = Infinity;
  let max = -Infinity;
  for (const e of s.elevationsM) { if (e < min) min = e; if (e > max) max = e; }
  // A flat route still gets a visible band: at least 10 m of vertical range.
  const range = Math.max(10, max - min);
  const mid = (max + min) / 2;
  const lo = mid - range / 2;
  const y = (e: number) => padTop + (H - padTop - padBottom) * (1 - (e - lo) / range);
  const xAt = (m: number) => W * (1 - Math.max(0, Math.min(totalM, m)) / totalM);
  const scale = L / totalM; // route metres → profile metres
  const n = Math.min(maxPoints, s.elevationsM.length);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const m = (i / (n - 1)) * totalM;
    pts.push([xAt(m), y(elevationAt(s, m * scale))]);
  }
  const r = (v: number) => Math.round(v * 10) / 10;
  const lineD = pts.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${r(px)} ${r(py)}`).join(' ');
  const areaD = `${lineD} L${r(pts[pts.length - 1][0])} ${H} L${r(pts[0][0])} ${H} Z`;
  const along = alongM != null && Number.isFinite(alongM) ? Math.max(0, Math.min(totalM, alongM)) : 0;
  return {
    areaD,
    lineD,
    you: { x: r(xAt(along)), y: r(y(elevationAt(s, along * scale))) },
    ticks: kmTicks(totalM, W),
    totalM,
  };
}

/**
 * Metres along `canonical` (the stored route path the profile belongs to) at
 * which `session` (the session's own path — rotated for loops) starts.
 * 0 when they start at the same vertex; null when the session start isn't a
 * canonical vertex (the profile can't be aligned → the strip hides).
 */
export function sessionStartOffsetM(
  canonical: ReadonlyArray<readonly [number, number] | readonly number[]>,
  session: ReadonlyArray<readonly [number, number] | readonly number[]>,
): number | null {
  if (canonical.length < 2 || session.length < 2) return null;
  const same = (a: readonly number[], b: readonly number[]) =>
    Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
  if (same(canonical[0], session[0])) return 0;
  let acc = 0;
  for (let i = 1; i < canonical.length; i++) {
    const a = canonical[i - 1];
    const b = canonical[i];
    const dLat = ((b[1] - a[1]) * Math.PI) / 180;
    const dLng = ((b[0] - a[0]) * Math.PI) / 180;
    const h = Math.sin(dLat / 2) ** 2
      + Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    acc += 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
    if (same(b, session[0])) return acc;
  }
  return null;
}
