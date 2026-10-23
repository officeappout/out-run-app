import type { OrderedParticipant } from './presence-order';

/** "5:30" from seconds per km; '' when unknown. */
export function formatPace(secPerKm: number | undefined): string {
  if (!secPerKm || !Number.isFinite(secPerKm) || secPerKm <= 0) return '';
  const total = Math.round(secPerKm);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export type RailStatusKey =
  | 'rail.status.run' | 'rail.status.runKm' | 'rail.status.set' | 'rail.status.setOnly'
  | 'rail.status.round' | 'rail.status.minute' | 'rail.status.paused' | 'rail.status.done'
  | 'rail.status.here' | 'rail.status.seenAgo' | 'rail.status.seenAgoMin';

/** The tiny status line under an avatar, as a catalog key + params (no Hebrew in code). */
export function railStatus(p: OrderedParticipant): { key: RailStatusKey; params: Record<string, string | number> } {
  if (p.state === 'done') return { key: 'rail.status.done', params: {} };
  if (p.freshness === 'stale') {
    const sec = p.lastSeenSec ?? 0;
    return sec >= 90
      ? { key: 'rail.status.seenAgoMin', params: { min: Math.round(sec / 60) } }
      : { key: 'rail.status.seenAgo', params: { sec } };
  }
  if (p.state === 'paused') return { key: 'rail.status.paused', params: {} };
  switch (p.kind) {
    case 'run': {
      const pace = formatPace(p.paceSecPerKm);
      const km = (p.distanceKm ?? 0).toFixed(1);
      return pace ? { key: 'rail.status.run', params: { km, pace } } : { key: 'rail.status.runKm', params: { km } };
    }
    case 'strength':
      return p.set != null
        ? (p.totalSets ? { key: 'rail.status.set', params: { set: p.set, total: p.totalSets } } : { key: 'rail.status.setOnly', params: { set: p.set } })
        : { key: 'rail.status.here', params: {} };
    case 'amrap':
      return { key: 'rail.status.round', params: { round: (p.roundsDone ?? 0) + 1 } };
    case 'emom':
      return p.minute != null ? { key: 'rail.status.minute', params: { minute: p.minute } } : { key: 'rail.status.here', params: {} };
  }
}

// ── placement (draggable up / down / other side, remembered) ───────────────

export interface RailPlacement {
  /** Logical edge: 'start' / 'end' of the reading direction (in Hebrew: start = right, end = left). */
  side: 'start' | 'end';
  /** 0..1 of the free vertical range: where the rail's top sits. */
  topFrac: number;
  collapsed: boolean;
}

export const DEFAULT_RAIL_PLACEMENT: RailPlacement = { side: 'end', topFrac: 0, collapsed: false };
export const RAIL_STORAGE_KEY = 'together_rail_placement_v2';

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

export function parsePlacement(raw: string | null | undefined): RailPlacement {
  if (!raw) return DEFAULT_RAIL_PLACEMENT;
  try {
    const v = JSON.parse(raw) as Partial<RailPlacement>;
    return {
      side: v.side === 'start' ? 'start' : 'end',
      topFrac: clamp01(Number(v.topFrac ?? 0)),
      collapsed: v.collapsed === true,
    };
  } catch {
    return DEFAULT_RAIL_PLACEMENT;
  }
}

/** Where a drag ended → the side (by screen half) and the vertical fraction. */
export function resolveDrop(input: { isRtl?: boolean; x: number; y: number; viewW: number; freeTop: number; freeHeight: number; grabOffsetY?: number }): RailPlacement {
  const top = input.y - (input.grabOffsetY ?? 0) - input.freeTop;
  return {
    // Physical half → logical edge. LTR: left half = start; RTL: left half = end.
    side: (input.x < input.viewW / 2) === !(input.isRtl ?? false) ? 'start' : 'end',
    topFrac: input.freeHeight > 0 ? clamp01(top / input.freeHeight) : 0,
    collapsed: false,
  };
}

/** Pixel top for a placement, given the free area and the rail's own height. */
export function placementTopPx(topFrac: number, freeTop: number, freeHeight: number, railHeight: number): number {
  const range = Math.max(0, freeHeight - railHeight);
  return freeTop + clamp01(topFrac) * range;
}

/** Tap a face to pick the duel opponent, tap again to clear. */
export function toggleSelected(current: string | null, tapped: string): string | null {
  return current === tapped ? null : tapped;
}

/** The physical edge a logical side sits on (for icons that point at the edge). */
export function physicalEdge(side: RailPlacement['side'], isRtl: boolean): 'left' | 'right' {
  return (side === 'start') === !isRtl ? 'left' : 'right';
}
