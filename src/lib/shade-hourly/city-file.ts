/**
 * Compact binary file of one city's hourly shade: per street segment, its
 * id, its line geometry and 168 quantized cells. The caller gzips it
 * (`shade/hourly/v1/<city>.bin.gz`). Little-endian throughout.
 *
 * Header (24 bytes):
 *   0  'SHH1' magic
 *   4  u8 version (1)
 *   5  u8 months (12)
 *   6  u8 hours (14)
 *   7  u8 first hour (6)
 *   8  u32 segment count
 *   12 u16 reference year
 *   14 u8 reference day of month (21)
 *   15 u8 reserved
 *   16 f32 sample-latitude (sun table origin)
 *   20 f32 sample-longitude
 * Segment record:
 *   f64 id (OSM way id × 1000 + piece, or any number < 2^53)
 *   u16 point count n, then n × (i32 lon×1e6, i32 lat×1e6)
 *   168 × u8 quantized cells
 *
 * Pure (DataView over Uint8Array — no Buffer, runs anywhere).
 */
import type { LonLat } from '../shade/types';
import { FIRST_HOUR, GRID_CELLS, HOURS_PER_DAY, MONTHS, REFERENCE_DAY_OF_MONTH } from './time-grid';

export const CITY_FILE_MAGIC = 'SHH1';
export const CITY_FILE_VERSION = 1;
const HEADER_BYTES = 24;
const COORD_SCALE = 1e6;

export interface HourlySegment {
  id: number;
  line: LonLat[];
  /** 168 quantized cells (see quantize.ts). */
  cells: Uint8Array;
}

export interface CityFileHeader {
  version: number;
  count: number;
  year: number;
  origin: LonLat;
}

/** Incremental writer: push segments one by one, get the bytes at the end. */
export function createCityFileWriter(year: number, origin: LonLat) {
  const chunks: Uint8Array[] = [];
  let count = 0;
  let bytes = 0;
  return {
    push(seg: HourlySegment) {
      if (seg.cells.length !== GRID_CELLS) throw new Error(`segment ${seg.id}: expected ${GRID_CELLS} cells, got ${seg.cells.length}`);
      const n = Math.min(seg.line.length, 0xffff);
      const buf = new Uint8Array(8 + 2 + n * 8 + GRID_CELLS);
      const dv = new DataView(buf.buffer);
      dv.setFloat64(0, seg.id, true);
      dv.setUint16(8, n, true);
      for (let i = 0; i < n; i++) {
        dv.setInt32(10 + i * 8, Math.round(seg.line[i][0] * COORD_SCALE), true);
        dv.setInt32(14 + i * 8, Math.round(seg.line[i][1] * COORD_SCALE), true);
      }
      buf.set(seg.cells, 10 + n * 8);
      chunks.push(buf);
      bytes += buf.length;
      count++;
    },
    get count() {
      return count;
    },
    finish(): Uint8Array {
      const out = new Uint8Array(HEADER_BYTES + bytes);
      const dv = new DataView(out.buffer);
      for (let i = 0; i < 4; i++) out[i] = CITY_FILE_MAGIC.charCodeAt(i);
      out[4] = CITY_FILE_VERSION;
      out[5] = MONTHS;
      out[6] = HOURS_PER_DAY;
      out[7] = FIRST_HOUR;
      dv.setUint32(8, count, true);
      dv.setUint16(12, year, true);
      out[14] = REFERENCE_DAY_OF_MONTH;
      dv.setFloat32(16, origin[1], true);
      dv.setFloat32(20, origin[0], true);
      let off = HEADER_BYTES;
      for (const c of chunks) {
        out.set(c, off);
        off += c.length;
      }
      return out;
    },
  };
}

export function decodeCityFile(bytes: Uint8Array): { header: CityFileHeader; segments: HourlySegment[] } {
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== CITY_FILE_MAGIC) throw new Error(`not an hourly shade file (magic ${JSON.stringify(magic)})`);
  if (bytes[4] !== CITY_FILE_VERSION) throw new Error(`unsupported hourly shade file version ${bytes[4]}`);
  if (bytes[5] !== MONTHS || bytes[6] !== HOURS_PER_DAY || bytes[7] !== FIRST_HOUR) {
    throw new Error(`hourly shade grid mismatch (${bytes[5]}×${bytes[6]} from ${bytes[7]})`);
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = dv.getUint32(8, true);
  const header: CityFileHeader = {
    version: bytes[4],
    count,
    year: dv.getUint16(12, true),
    origin: [dv.getFloat32(20, true), dv.getFloat32(16, true)],
  };
  const segments: HourlySegment[] = [];
  let off = HEADER_BYTES;
  for (let s = 0; s < count; s++) {
    if (off + 10 > bytes.length) throw new Error(`truncated hourly shade file at segment ${s}`);
    const id = dv.getFloat64(off, true);
    const n = dv.getUint16(off + 8, true);
    const line: LonLat[] = [];
    for (let i = 0; i < n; i++) {
      line.push([dv.getInt32(off + 10 + i * 8, true) / COORD_SCALE, dv.getInt32(off + 14 + i * 8, true) / COORD_SCALE]);
    }
    const cStart = off + 10 + n * 8;
    if (cStart + GRID_CELLS > bytes.length) throw new Error(`truncated hourly shade file at segment ${s}`);
    segments.push({ id, line, cells: bytes.slice(cStart, cStart + GRID_CELLS) });
    off = cStart + GRID_CELLS;
  }
  return { header, segments };
}
