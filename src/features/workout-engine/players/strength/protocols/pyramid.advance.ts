/**
 * pyramid.advance — INTENTIONAL re-export of the straight head
 * (protocol-blocks Stage 1b, 11.07.2026).
 *
 * Pyramid is an ORDER protocol, not a clock protocol: its per-step
 * reps/hold/video come from resolvePyramidStep/resolveSetTarget
 * (set-target.utils), and effectiveSetsForExercise makes the sequence
 * length authoritative for the set count. Given that, the advance
 * decision itself is identical to straight sets. Keeping a named module
 * preserves one-file-per-protocol in the registry without forking logic.
 */
export { straightAdvance as pyramidAdvance } from './straight.advance';
