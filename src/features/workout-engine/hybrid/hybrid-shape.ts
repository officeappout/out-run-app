/**
 * hybrid-shape — SessionShape config (data-driven strategy).
 * (HYBRID_ENGINE_DESIGN.md §0.1 — "session shapes = variants of ONE mechanism").
 *
 * A "shape" is a named preset of composer inputs + a placement strategy. All 5
 * shapes are DATA variants of the same engine — the composer/orchestrator read
 * these fields, they are never separate code paths.
 *
 * MVP wires ONLY 'sandwich' (single-station, symmetric). The other four are
 * config stubs: defined here so the abstraction exists, but `wired:false` until
 * their placement/domain knobs are consumed (a later phase). This file is PURE
 * TypeScript per LAW 0 — no hooks, no Firebase, no I/O.
 */

import type { HybridComposeInput } from './compose-hybrid-session.service';

export type HybridShapeName =
  | 'sandwich'          // MVP: run → 1 station → run (symmetric midpoint)
  | 'trail'             // stops along the way (derived count)
  | 'loop'              // loop + one station (Sportek)
  | 'run_to_park'       // U7: destination park is the station; route TO it = aerobic
  | 'runner_collects';  // U4: aerobic-dominant, station at END, core/legs bias

/** Where the station(s) sit relative to the route (design U4/U7). */
export type StationPlacement = 'symmetric' | 'end' | 'destination';

export interface HybridShapeConfig {
  name: HybridShapeName;
  placement: StationPlacement;
  /** number = fixed station count; 'derived' = let the composer derive from strength time. */
  stationCount: number | 'derived';
  /** Bias the station domain (design U4 — runner-appropriate core/legs). */
  domainBias: 'core_legs' | null;
  /** design U5 — keep the pre-station leg a light warm-up (strength-emphasis only). */
  aerobicFirstLight: boolean;
  /** True only when composeHybridSession honours this shape today (MVP = sandwich). */
  wired: boolean;
}

const SHAPES: Record<HybridShapeName, HybridShapeConfig> = {
  sandwich:        { name: 'sandwich',        placement: 'symmetric',   stationCount: 1,         domainBias: null,        aerobicFirstLight: false, wired: true },
  trail:           { name: 'trail',           placement: 'symmetric',   stationCount: 'derived', domainBias: null,        aerobicFirstLight: false, wired: false },
  loop:            { name: 'loop',            placement: 'symmetric',   stationCount: 1,         domainBias: null,        aerobicFirstLight: false, wired: false },
  run_to_park:     { name: 'run_to_park',     placement: 'destination', stationCount: 1,         domainBias: null,        aerobicFirstLight: false, wired: false },
  runner_collects: { name: 'runner_collects', placement: 'end',         stationCount: 1,         domainBias: 'core_legs', aerobicFirstLight: false, wired: false },
};

/** Resolve a shape name to its (immutable) config. */
export function resolveHybridShape(name: HybridShapeName): HybridShapeConfig {
  return SHAPES[name];
}

/**
 * The compose-input deltas implied by a shape. MVP wires only `stationOverride`
 * (the existing composer knob — see compose-hybrid-session.service.ts:351). The
 * placement / domainBias / aerobicShareOverride knobs are documented in
 * HYBRID_ENGINE_DESIGN.md v1.1 (U2/U4) and consumed in a later phase; they are
 * intentionally NOT emitted here yet so the composer contract is unchanged.
 */
export function shapeToComposeInput(cfg: HybridShapeConfig): Partial<HybridComposeInput> {
  const delta: Partial<HybridComposeInput> = {};
  if (typeof cfg.stationCount === 'number') {
    delta.stationOverride = cfg.stationCount;
  }
  return delta;
}
