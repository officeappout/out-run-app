/**
 * method.types — the shared execution-method contract (docs/architecture/
 * workout-recommendation-engine.md §6.1-6.2). TYPES ONLY, Step 1 of the build order (§11.1).
 *
 * Named `ProtocolMethod` in code (not `Method`, as the doc calls it) to avoid collision with
 * the EXISTING, unrelated `ExecutionMethod` type (src/features/content/exercises/core/
 * exercise.types.ts:424) — that one is a per-exercise equipment/media variant (pullup-bar vs
 * rings vs bodyweight, selected via `selectMethodForContext`), not an execution/protocol style
 * (superset/pyramid/tabata/AMRAP). Do not conflate the two when reading or writing this file.
 *
 * §6.2's dual-display contract is enforced at the type level, not just documented:
 * `renderActive`/`renderPreview` are REQUIRED fields. A retrofit that only implements one
 * cannot compile as a `ProtocolMethod` — "missing display in either mode = method not done."
 */

import type { ComponentType } from 'react';

/** Matches `SegmentProtocolId` (core/types/protocol.types.ts:16) plus the doc's two
 *  not-yet-existing methods (`'intervals'`, `'office'`) that have no protocol.types.ts
 *  counterpart yet — added here first since this file is the contract, protocol.types.ts
 *  gains matching entries when §11.4/§11.7 actually build them. */
export type MethodId =
  | 'straight'
  | 'superset'
  | 'pyramid'
  | 'tabata'
  | 'emom'
  | 'amrap'
  | 'intervals'
  | 'office';

/**
 * Output of `buildSets`. Deliberately loose (`unknown[]`) at the contract level — each
 * retrofit's concrete shape (e.g. `GeneratedWorkout`, `HybridPlan`) is whatever the delegated
 * existing code already returns; `ProtocolMethod<TParams, TBuiltSets>` lets each method wrapper
 * narrow both type parameters without forcing one shared runtime shape prematurely.
 */

/**
 * Revised during the pyramid retrofit (§11.2, first real wrapper): `renderActive`/
 * `renderPreview` do NOT share one `{ builtSets }` prop shape in the live codebase —
 * `StrengthExerciseCard` (pyramid's active surface) and `PyramidStepCard` (its preview
 * surface) each take their own real, protocol-specific, session-coupled props (tap handlers,
 * rest state, cached image URLs, etc.), not a generic wrapper prop. Forcing one shared shape
 * would mean inventing a translation layer that doesn't exist today — i.e. NOT a pure
 * delegate. `TActiveProps`/`TPreviewProps` let each retrofit reference the REAL existing
 * component's REAL existing prop type directly (via the component's exported Props interface,
 * or `ComponentProps<typeof Component>` when it isn't exported).
 */
export interface ProtocolMethod<
  TParams = unknown,
  TBuiltSets = unknown,
  TActiveProps extends object = Record<string, unknown>,
  TPreviewProps extends object = Record<string, unknown>,
> {
  id: MethodId;
  name: string;

  /** Domains or exercise kinds this method can apply to (e.g. `['push','pull']`, or `['*']`
   *  for domain-agnostic methods like intervals). */
  appliesTo: string[];

  params: TParams;

  buildSets: (exercises: unknown[], params: TParams) => TBuiltSets;

  /** Live active-workout player rendering (timers, rep counters, rest, real-time cues). */
  renderActive: ComponentType<TActiveProps>;

  /** Pre-workout preview-screen rendering (summary row, icon, expected structure). */
  renderPreview: ComponentType<TPreviewProps>;
}
