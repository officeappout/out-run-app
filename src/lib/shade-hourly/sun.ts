/**
 * Sun position (azimuth / elevation) — NOAA Solar Calculator equations
 * (https://gml.noaa.gov/grad/solcalc/calcdetails.html, after Meeus,
 * "Astronomical Algorithms"). Accurate to well under 0.1° for 1950–2050,
 * which is far tighter than any shadow we cast from it.
 *
 * Pure, no deps. Time is always a UTC instant (Date); local-clock
 * conversion for Israel lives in `israel-time.ts`.
 */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export interface SunPosition {
  /** Degrees clockwise from true north (0 = N, 90 = E, 180 = S, 270 = W). */
  azimuthDeg: number;
  /** Apparent elevation above the horizon in degrees (refraction-corrected). Negative = below. */
  elevationDeg: number;
  /** Solar declination, degrees (exposed for tests / debugging). */
  declinationDeg: number;
  /** Equation of time, minutes (apparent − mean solar time). */
  equationOfTimeMin: number;
}

/** Julian Day for a UTC instant. */
export function julianDay(date: Date): number {
  return date.getTime() / 86_400_000 + 2_440_587.5;
}

/** NOAA atmospheric refraction correction (degrees) for a geometric elevation. */
function refractionDeg(elev: number): number {
  if (elev > 85) return 0;
  const te = Math.tan(elev * DEG);
  let arcsec: number;
  if (elev > 5) arcsec = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5;
  else if (elev > -0.575) arcsec = 1735 + elev * (-518.2 + elev * (103.4 + elev * (-12.79 + elev * 0.711)));
  else arcsec = -20.774 / te;
  return arcsec / 3600;
}

export function sunPosition(date: Date, latDeg: number, lonDeg: number): SunPosition {
  const jd = julianDay(date);
  const t = (jd - 2_451_545) / 36_525;

  const l0 = (((280.46646 + t * (36000.76983 + t * 0.0003032)) % 360) + 360) % 360;
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const c =
    Math.sin(m * DEG) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m * DEG) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m * DEG) * 0.000289;
  const trueLong = l0 + c;
  const omega = 125.04 - 1934.136 * t;
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(omega * DEG);
  const meanObliq = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliq = meanObliq + 0.00256 * Math.cos(omega * DEG);
  const decl = Math.asin(Math.sin(obliq * DEG) * Math.sin(appLong * DEG)) * RAD;

  const y = Math.tan((obliq / 2) * DEG) ** 2;
  const eqTime =
    4 *
    RAD *
    (y * Math.sin(2 * l0 * DEG) -
      2 * e * Math.sin(m * DEG) +
      4 * e * y * Math.sin(m * DEG) * Math.cos(2 * l0 * DEG) -
      0.5 * y * y * Math.sin(4 * l0 * DEG) -
      1.25 * e * e * Math.sin(2 * m * DEG));

  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60 + date.getUTCMilliseconds() / 60_000;
  const tst = (((utcMinutes + eqTime + 4 * lonDeg) % 1440) + 1440) % 1440;
  const hourAngle = tst / 4 < 0 ? tst / 4 + 180 : tst / 4 - 180;

  const lat = latDeg * DEG;
  const d = decl * DEG;
  const cosZen = Math.max(-1, Math.min(1, Math.sin(lat) * Math.sin(d) + Math.cos(lat) * Math.cos(d) * Math.cos(hourAngle * DEG)));
  const zenith = Math.acos(cosZen) * RAD;
  const geomElev = 90 - zenith;

  let azimuth: number;
  const denom = Math.cos(lat) * Math.sin(zenith * DEG);
  if (Math.abs(denom) < 1e-12) {
    azimuth = latDeg > 0 ? 180 : 0;
  } else {
    const cosAz = Math.max(-1, Math.min(1, (Math.sin(lat) * cosZen - Math.sin(d)) / denom));
    const a = Math.acos(cosAz) * RAD;
    azimuth = hourAngle > 0 ? (a + 180) % 360 : (540 - a) % 360;
  }

  return {
    azimuthDeg: azimuth,
    elevationDeg: geomElev + refractionDeg(geomElev),
    declinationDeg: decl,
    equationOfTimeMin: eqTime,
  };
}
