/**
 * location-gate.config — THE tunable numbers of the location-switch gate (enable_location_gate_v1).
 *
 * Tune here (one place); no release-side logic reads a literal. The repo has no remote-config pattern for
 * plain numbers (only boolean flags in system_config/feature_flags), so these live as named constants;
 * every consumer takes a `LocationGateConfig` argument (default = LOCATION_GATE_DEFAULTS), so a future
 * Firestore override only needs to build one object and pass it in.
 *
 * Calibration (agent-briefs/catalog-coverage-audit.md, live catalog 23.10): with these numbers about 60% of
 * park -> home switches are allowed, the rest are disabled (skill programs, push/pull L13+).
 */
export interface LocationGateConfig {
  /** Share of counted slots that must resolve; warm-up / cool-down always count as resolved. 0.8 = 80%. */
  minCoverageRatio: number;
  /** Most main slots that may stay uncovered. */
  maxUncoveredMains: number;
  /** Fewer resolvable main slots than this disables the option (capped by the workout's own main count). */
  minResolvableMains: number;
}

export const LOCATION_GATE_DEFAULTS: LocationGateConfig = {
  minCoverageRatio: 0.8,
  maxUncoveredMains: 1,
  minResolvableMains: 2,
};

export function resolveLocationGateConfig(overrides?: Partial<LocationGateConfig> | null): LocationGateConfig {
  return { ...LOCATION_GATE_DEFAULTS, ...(overrides ?? {}) };
}
