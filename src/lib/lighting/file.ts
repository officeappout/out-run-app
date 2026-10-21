/**
 * Per-city lighting file (`lighting/v1/<city>.json.gz`): every street piece
 * with a known answer (lit yes / no) and its line, plus a summary for the
 * city inventory. Unknown pieces are counted, not stored (a route over them
 * simply does not match — "not measured", never "unlit"). Pure.
 */
import type { LonLat } from '../shade/types';
import { LIGHTING_FILE_VERSION } from './constants';
import type { LitBasis, LitState } from './lamps';

export interface LightingSourceRef {
  key: string;
  licence: string;
  status: 'live' | 'pending_licence';
  attribution: string;
  /** ISO date of the source snapshot. */
  snapshotDate: string;
  count: number;
}

export interface LightingPiece {
  /** OSM way id × 1000 + piece. */
  id: number;
  lit: Exclude<LitState, 'unknown'>;
  basis: LitBasis;
  /** Coordinates rounded to 1e-6°. */
  line: LonLat[];
}

export interface LightingSummary {
  walkableM: number;
  /** Length with a yes/no answer. */
  knownM: number;
  litM: number;
  /** By basis, metres. */
  byBasisM: Partial<Record<LitBasis, number>>;
}

export interface LightingCityFile {
  version: number;
  city: string;
  builtAt: string;
  radiusM: number;
  minShare: number;
  sources: LightingSourceRef[];
  summary: LightingSummary;
  pieces: LightingPiece[];
}

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

export function makeLightingFile(input: Omit<LightingCityFile, 'version' | 'pieces'> & { pieces: LightingPiece[] }): LightingCityFile {
  return {
    version: LIGHTING_FILE_VERSION,
    ...input,
    pieces: input.pieces.map((p) => ({ ...p, line: p.line.map((c) => [r6(c[0]), r6(c[1])] as LonLat) })),
  };
}

/** Validate an untrusted parsed body; throws on a foreign / wrong-version file. */
export function parseLightingFile(body: unknown): LightingCityFile {
  const o = body as Partial<LightingCityFile> | null;
  if (!o || typeof o !== 'object' || o.version !== LIGHTING_FILE_VERSION || !Array.isArray(o.pieces) || typeof o.city !== 'string') {
    throw new Error('not a lighting v1 city file');
  }
  const pieces = o.pieces.filter(
    (p): p is LightingPiece => !!p && (p.lit === 'yes' || p.lit === 'no') && Array.isArray(p.line) && p.line.length >= 2,
  );
  return { ...(o as LightingCityFile), pieces };
}
