/**
 * tabata.method — ProtocolMethod retrofit for the existing tabata protocol (§11.2/§11.3).
 * Pure delegation: zero new logic, zero touched existing files, zero live call sites.
 *
 * HIGHER STAKES than superset/pyramid: tabata is LIVE IN PRODUCTION (85 programLevelSettings
 * docs, 0.12-0.22 probability by level band, since 29.07.2026). This wrapper does not touch
 * `tabata.block.ts`/`tabata.advance.ts`/`block-protocol.ts` — it only references them, exactly
 * like the pyramid/superset retrofits reference their own live logic. No behavior change is
 * possible through this file alone: nothing calls it yet.
 *
 * Equivalence, not a runtime backtest: `buildSets` below is a direct passthrough call to
 * `buildTabataBlock` (same function, same arguments) — there is no transformation to verify
 * against real prod data, because none is introduced; a 2-line passthrough cannot diverge
 * from calling the function directly. An automated equivalence test was attempted and
 * dropped: `vitest.config.ts` restricts tests to pure `.ts` logic
 * ("No jsdom/component testing yet; that is a separate decision") and only includes
 * "__tests__" directory ".test.ts" files — importing this file's `renderActive`/
 * `renderPreview` (`.tsx` components) transitively breaks that boundary. Respected rather than forced;
 * `buildTabataBlock` itself is already covered by `logic/protocols/__tests__/tabata-block.test.ts`.
 *
 * Active surface: `IsometricTimerCard` (the real work/rest clock UI) — mounted inside
 * `ActiveExerciseView.tsx`, which computes its `duration`/`isTimeBased` props from block
 * state. Preview surface: `ExerciseCard`, with a tabata `volumeOverride`
 * (`${workSec} שנ'`) — the SAME component superset's preview delegates to (also
 * `ExerciseCard`, parametrized), confirmed directly in `GeneratedWorkoutExerciseList.tsx`'s
 * tabata section branch (orange border wrapper, `volumeOverride` from
 * `tabataBlock.config.workSec`).
 */

import type { ComponentProps } from 'react';
import type { ProtocolMethod } from '../types/method.types';
import type { WorkoutExercise } from '../../logic/workout-generator.types';
import { buildTabataBlock } from '../../logic/protocols/tabata.block';
import IsometricTimerCard from '../../players/strength/components/IsometricTimerCard';
import ExerciseCard from '@/features/workouts/components/workout-preview-drawer/components/exercise-list/ExerciseCard';

/** Derived from `buildTabataBlock`'s own third parameter — not hand-transcribed, so this
 *  can never silently drift from the real signature. */
export type TabataBuildContext = Parameters<typeof buildTabataBlock>[2];

export const tabataMethod: ProtocolMethod<
  TabataBuildContext,
  ReturnType<typeof buildTabataBlock>,
  ComponentProps<typeof IsometricTimerCard>,
  ComponentProps<typeof ExerciseCard>
> = {
  id: 'tabata',
  name: 'טבטה',
  appliesTo: ['*'],

  /** No override — a real generation call passes the actual pool/level/location context. */
  params: {},

  buildSets: (exercises, context) =>
    buildTabataBlock('tabata', exercises as WorkoutExercise[], context),

  renderActive: IsometricTimerCard,
  renderPreview: ExerciseCard,
};
