/**
 * method-dimension.utils — generic per-dimension method resolver dispatch.
 *
 * `selectMethodForDimension` is the single entrypoint the swap-all feature calls; it
 * generalises the SoT method resolver to (dimension, value). Phase 1 supports the
 * 'location' dimension only, delegating VERBATIM to `selectMethodForContext` so the
 * location fallback ladder — and its generation call sites — stay untouched
 * (regression-safe). Phase 2 ('persona') and Phase 3 ('language') slot in as
 * additional cases without touching the location path.
 *
 * PURE / ISOMORPHIC: no React, no Firebase, no I/O.
 */

import type {
  Exercise,
  ExecutionLocation,
  ExecutionMethod,
} from '@/features/content/exercises/core/exercise.types';
import { selectMethodForContext, type SelectMethodOptions } from './method-selection.utils';

export type SwapDimension = 'location' | 'persona' | 'language';

export interface DimensionContext {
  dimension: SwapDimension;
  /** e.g. 'park' | 'home' | 'street' (location); 'women_home' (persona); 'en' (language). */
  value: string;
}

/**
 * Resolve the best ExecutionMethod for an exercise under a (dimension, value) context
 * + available gear. Return contract mirrors `selectMethodForContext`:
 *   ExecutionMethod → the best method for this dimension-value.
 *   null            → EXCLUDE this exercise here (never falls back to method[0]).
 */
export function selectMethodForDimension(
  exercise: Exercise,
  ctx: DimensionContext,
  availableGear: string[],
  options: SelectMethodOptions = {},
): ExecutionMethod | null {
  switch (ctx.dimension) {
    case 'location':
      // Phase 1 — delegate verbatim; the location ladder is unchanged.
      return selectMethodForContext(
        exercise,
        ctx.value as ExecutionLocation,
        availableGear,
        options,
      );
    case 'persona':
      // Phase 2 — selectMethodForPersona(exercise, ctx.value, availableGear, options).
      return null;
    case 'language':
      // Phase 3 — language is a media-slot axis (localises media on the SAME method),
      // not a method-array swap; handled outside the method resolver.
      return null;
    default:
      return null;
  }
}
