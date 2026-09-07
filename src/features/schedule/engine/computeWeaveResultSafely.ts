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
import { buildWeaverInput, type WeaverInputProfile, type WeaveMode } from './weaverInput';
import { weaveWeek, type WeaveWeekResult } from './scheduleWeaver';
import { hasStrengthTrack } from '@/lib/track-ownership';

/**
 * `mode='running'` forces the strength side to zero (weaverInput.ts's own
 * doc) — silent to a user who actually owns a strength track, since
 * "nothing built" and "nothing requested" look identical in the result
 * otherwise. Only fires when the exclusion is a real choice, not the
 * user's baseline: a user with no strength track at all was never going
 * to see strength content regardless of tab, so no note is added for them
 * — it would be explaining an absence that has nothing to do with what
 * they picked. No symmetric note for mode='strength': there's no floor
 * conflict on that side (see weaverInput.ts), so nothing to explain beyond
 * what picking the tab already makes obvious.
 */
function coachNoteForMode(mode: WeaveMode, profile: WeaverInputProfile): string | null {
  if (mode === 'running' && hasStrengthTrack(profile)) {
    return 'לא נבנו אימוני כוח השבוע — כי זה מה שבחרת (טאב ריצה).';
  }
  return null;
}

export function computeWeaveResultSafely(
  profile: unknown,
  mode: WeaveMode,
  focus: number,
  availableDayCount: number,
  asOfDate: Date,
): WeaveWeekResult | null {
  try {
    const typedProfile = profile as WeaverInputProfile | null | undefined;
    const input = buildWeaverInput(typedProfile, mode, focus, availableDayCount, asOfDate);
    if (!input) return null;
    const result = weaveWeek(input);
    const note = typedProfile ? coachNoteForMode(mode, typedProfile) : null;
    return note ? { ...result, notes: [note, ...result.notes] } : result;
  } catch (err) {
    console.error('[ScheduleBuilderDrawer] buildWeaverInput/weaveWeek threw — showing no data instead of crashing:', err);
    return null;
  }
}
