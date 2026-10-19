import type { XY } from './geo';

/** Uniform-grid spatial index over line segments (projected metres) — keeps the metrics O(n) for real routes. */
export class SegmentGrid<T> {
  private cells = new Map<string, Array<{ a: XY; b: XY; data: T }>>();
  constructor(private cellM: number) {}

  private key(cx: number, cy: number) { return `${cx}:${cy}`; }

  add(a: XY, b: XY, data: T): void {
    const c = this.cellM;
    const x0 = Math.floor(Math.min(a[0], b[0]) / c), x1 = Math.floor(Math.max(a[0], b[0]) / c);
    const y0 = Math.floor(Math.min(a[1], b[1]) / c), y1 = Math.floor(Math.max(a[1], b[1]) / c);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const k = this.key(cx, cy);
        let arr = this.cells.get(k);
        if (!arr) { arr = []; this.cells.set(k, arr); }
        arr.push({ a, b, data });
      }
    }
  }

  /** Segments whose cells overlap the square of half-size r around p (may include duplicates across cells). */
  near(p: XY, r: number): Array<{ a: XY; b: XY; data: T }> {
    const c = this.cellM;
    const out: Array<{ a: XY; b: XY; data: T }> = [];
    const seen = new Set<unknown>();
    for (let cx = Math.floor((p[0] - r) / c); cx <= Math.floor((p[0] + r) / c); cx++) {
      for (let cy = Math.floor((p[1] - r) / c); cy <= Math.floor((p[1] + r) / c); cy++) {
        const arr = this.cells.get(this.key(cx, cy));
        if (!arr) continue;
        for (const s of arr) { if (!seen.has(s)) { seen.add(s); out.push(s); } }
      }
    }
    return out;
  }

  /** Segments overlapping the bbox of segment ab. */
  nearSegment(a: XY, b: XY): Array<{ a: XY; b: XY; data: T }> {
    const mid: XY = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const r = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) / 2 + 1;
    return this.near(mid, r);
  }
}
