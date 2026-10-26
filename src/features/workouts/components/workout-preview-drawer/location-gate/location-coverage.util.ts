/**
 * location-coverage.util — PURE coverage decision for a location switch (enable_location_gate_v1).
 *
 * No warning band: the switch is either allowed or the location option is disabled.
 * Only MAIN slots can pull the verdict down. Warm-up / cool-down slots still count toward the ratio's
 * denominator but always as buildable: an uncovered one is swapped for a guide, omitted, or restored by
 * the collapse-guard, so the session can always be built (fix 26.10 — counting them as uncovered made
 * almost every home -> park switch fail on the home-filmed cool-down stretches, which have no park
 * media). Strictly looser than before: no switch that was allowed becomes disabled.
 * Pyramids are out of scope and never passed in.
 * Disabled when ANY of:
 *   - a pinned (goal / skill) main is uncovered,
 *   - uncovered mains > maxUncoveredMains,
 *   - resolvable mains < min(minResolvableMains, mains),
 *   - (resolved mains + warm-up/cool-down slots) / counted < minCoverageRatio.
 */
import { LOCATION_GATE_DEFAULTS, type LocationGateConfig } from './location-gate.config';

export type CoverageSlotKind = 'main' | 'warmup' | 'cooldown';

export interface CoverageSlot {
  kind: CoverageSlotKind;
  /** Goal / skill exercise (replaceable only inside its own family). */
  pinned: boolean;
  /** Resolved to a media-bearing method (own or replacement). */
  resolved: boolean;
}

export type GateBlockReason = 'notEnoughContent' | 'pinnedUncovered' | 'tooFewMains';

export interface CoverageResult {
  counted: number;
  resolved: number;
  mains: number;
  resolvedMains: number;
  uncoveredMains: number;
  pinnedUncovered: number;
  ratio: number;
  allowed: boolean;
  reason: GateBlockReason | null;
}

export function computeLocationCoverage(
  slots: readonly CoverageSlot[],
  config: LocationGateConfig = LOCATION_GATE_DEFAULTS,
): CoverageResult {
  const counted = slots.length;
  const resolved = slots.filter((s) => s.resolved).length;
  const mainSlots = slots.filter((s) => s.kind === 'main');
  const mains = mainSlots.length;
  const resolvedMains = mainSlots.filter((s) => s.resolved).length;
  const uncoveredMains = mains - resolvedMains;
  const pinnedUncovered = mainSlots.filter((s) => s.pinned && !s.resolved).length;
  // Warm-up / cool-down always count as buildable (see the header).
  const supplemental = counted - mains;
  const ratio = counted === 0 ? 1 : (resolvedMains + supplemental) / counted;

  let reason: GateBlockReason | null = null;
  if (pinnedUncovered > 0) reason = 'pinnedUncovered';
  else if (resolvedMains < Math.min(config.minResolvableMains, mains)) reason = 'tooFewMains';
  else if (uncoveredMains > config.maxUncoveredMains || ratio < config.minCoverageRatio) reason = 'notEnoughContent';

  return {
    counted,
    resolved,
    mains,
    resolvedMains,
    uncoveredMains,
    pinnedUncovered,
    ratio,
    allowed: reason === null,
    reason,
  };
}
