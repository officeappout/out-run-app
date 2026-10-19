/**
 * Google encoded polyline (precision 5) — encode / decode for [lng, lat] lines. Pure.
 * Stored route lines in generation_log use this so a 5 km loop costs ~1 KB, not ~20 KB.
 */
import type { LngLat } from '@/lib/route-quality/types';

function encodeValue(v: number): string {
  let n = v < 0 ? ~(v << 1) : v << 1;
  let out = '';
  while (n >= 0x20) {
    out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
    n >>= 5;
  }
  return out + String.fromCharCode(n + 63);
}

export function encodePolyline(path: LngLat[]): string {
  let out = '';
  let pLat = 0;
  let pLng = 0;
  for (const [lng, lat] of path) {
    const iLat = Math.round(lat * 1e5);
    const iLng = Math.round(lng * 1e5);
    out += encodeValue(iLat - pLat) + encodeValue(iLng - pLng);
    pLat = iLat;
    pLng = iLng;
  }
  return out;
}

export function decodePolyline(s: string): LngLat[] {
  const out: LngLat[] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  const next = (): number | null => {
    let shift = 0;
    let result = 0;
    let b: number;
    do {
      if (i >= s.length) return null;
      b = s.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < s.length) {
    const dLat = next();
    const dLng = next();
    if (dLat === null || dLng === null) break;
    lat += dLat;
    lng += dLng;
    out.push([lng / 1e5, lat / 1e5]);
  }
  return out;
}
