/**
 * city-inventory/peers.ts — the "similar cities" median for point-layer
 * density (plan §3.4). Pure.
 *
 * Peer group = other authorities of the same `authorityType` (city / local
 * council / regional council), one row each (the caller passes the latest
 * run per authority). Fewer than MIN_PEERS usable values ⇒ `null` — the
 * layer's coverage stays "not measured" rather than compared with too few
 * cities. Thresholds are calibration starting points (owner Q7).
 */
import { median } from './coverage';
import { POINT_LAYER_KEYS, type AuthorityType } from './types';
import type { PointLayerKey } from './assemble';

export const MIN_PEERS = 3;

export interface PeerRow {
  authorityId: string;
  authorityType: AuthorityType;
  densities: Partial<Record<PointLayerKey, number | null>>;
}

export interface PeerMedians {
  medians: Record<PointLayerKey, number | null>;
  /** Authorities that formed the peer group (any layer). */
  peerIds: string[];
}

export function peerMedians(selfId: string, selfType: AuthorityType, rows: readonly PeerRow[]): PeerMedians {
  const peers = rows.filter((r) => r.authorityId !== selfId && r.authorityType === selfType);
  const medians = {} as Record<PointLayerKey, number | null>;
  for (const k of POINT_LAYER_KEYS) {
    const vals = peers.map((p) => p.densities[k]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    medians[k] = vals.length >= MIN_PEERS ? median(vals) : null;
  }
  return { medians, peerIds: peers.map((p) => p.authorityId).sort() };
}
