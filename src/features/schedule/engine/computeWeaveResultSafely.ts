/**
 * Extracted from ScheduleBuilderDrawer.tsx's own useMemo into this
 * dedicated, JSX-free file so it's unit-testable without React/JSX — this
 * repo's vitest has no JSX-transform plugin configured (confirmed directly
 * while trying to write a render-level crash test for that drawer;
 * `vitest.config.ts`'s own comment already says "no jsdom/component
 * testing yet"). A `.test.ts` file importing anything from
 * ScheduleBuilderDrawer.tsx would still fail to parse — vite transforms
 * the whole file, and that file's default export has real JSX in its
 * render body, elsewhere in the same file.
 *
 * Fails soft on purpose — this data-prep step must return "no data" on its
 * own if buildWeaverInput/weaveWeek throw on an unexpected profile shape,
 * not rely on a rendering safety net to catch it. Crash protection for the
 * drawer is two layers: this function for the engine, ErrorBoundary
 * (TrainingPlannerOverlay.tsx) for render.
 */
import { buildWeaverInput, type WeaverInputProfile } from './weaverInput';
import { weaveWeek, type WeaveWeekResult } from './scheduleWeaver';

export function computeWeaveResultSafely(
  profile: unknown,
  focus: number,
  availableDayCount: number,
  asOfDate: Date,
): WeaveWeekResult | null {
  try {
    const input = buildWeaverInput(profile as WeaverInputProfile | null | undefined, focus, availableDayCount, asOfDate);
    if (!input) return null;
    return weaveWeek(input);
  } catch (err) {
    console.error('[ScheduleBuilderDrawer] buildWeaverInput/weaveWeek threw — showing no data instead of crashing:', err);
    return null;
  }
}
