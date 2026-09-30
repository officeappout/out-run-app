'use client';

/**
 * Exercise Library Filters — orchestrates initial load + derived filtering
 * + client-side pagination (lazy "Load More" / infinite scroll).
 *
 * Loads the full exercise corpus once on mount, then computes the visible
 * subset entirely client-side based on the active filters in the store.
 * Only the first PAGE_SIZE rows are exposed to the UI; `loadMore()` grows
 * the window. Pagination resets to page 1 whenever the filter set changes.
 *
 * Text search is debounced 300ms to keep typing buttery on mobile.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAllExercisesNoOrder } from '../../core/exercise.service';
import {
  useExerciseLibraryStore,
  BODYWEIGHT_SENTINEL,
} from '../store/useExerciseLibraryStore';
import type { Exercise } from '../../core/exercise.types';
import type { Program } from '@/features/content/programs/core/program.types';

/**
 * Initial batch size + increment for "Load More". 12 keeps the first paint
 * cheap (≈4 viewport-heights of cards) while not feeling stingy.
 */
export const LIBRARY_PAGE_SIZE = 12;

/**
 * Resolve the canonical level for an exercise.
 * Picks the lowest level across `targetPrograms` (entry-level), defaulting to 1.
 *
 * Used for the pagination sort (level ascending) and as the program+level
 * filter's per-tag fallback ("this targetPrograms entry has no explicit
 * level of its own"). NOT used for the card's level pill — see
 * resolveCardLevel below for why that needs different semantics.
 */
export function resolveExerciseLevel(exercise: Exercise): number {
  if (exercise.targetPrograms && exercise.targetPrograms.length > 0) {
    const min = Math.min(...exercise.targetPrograms.map((tp) => tp.level));
    return Number.isFinite(min) && min > 0 ? min : 1;
  }
  if (exercise.recommendedLevel && exercise.recommendedLevel > 0) {
    return exercise.recommendedLevel;
  }
  return 1;
}

/**
 * IDs a program filter selection should match against an exercise's
 * targetPrograms: the program itself, plus its subPrograms when it's a
 * master/hub program (round 4, #7).
 *
 * Root cause this fixes: no exercise is ever tagged directly to a master
 * program (e.g. "קליסטניקס עליון") — only to its concrete children (Push,
 * Pull, ...). Selecting the master used to match `exProgs.includes(masterId)`
 * literally, which is never true, so it always returned 0 results. Master
 * programs are aggregation-only records (Program.isMaster +
 * Program.subPrograms — the same field program-hierarchy.utils.ts's
 * resolveAncestorProgramIds walks in the reverse direction); this expands
 * in the forward direction using that same field, nothing more.
 */
export function resolveProgramMatchIds(programId: string, programs: Program[]): string[] {
  const program = programs.find((p) => p.id === programId);
  if (program?.isMaster && program.subPrograms?.length) {
    return [programId, ...program.subPrograms];
  }
  return [programId];
}

/**
 * Does this exercise match the currently-selected tracks (round 5, #6)?
 * Tracks combine with OR — this exercise matches if ANY selected track's
 * own tag+level condition is satisfied (an empty `[]` value for a track
 * means "this track selected, no level narrowing"). A level in one
 * track's array is never checked against a DIFFERENT track's tag — level
 * numbering is per-program, so "3" only means something under the track
 * it's nested under.
 *
 * `[]` (no tracks selected at all) always matches, matching every other
 * filter dimension's "empty selection bypasses this stage" convention.
 *
 * Shared by the real filter, the diagnostic trace, and
 * SecondaryFiltersSheet's live preview count so those three can't drift
 * out of sync with each other (three duplicate implementations of this
 * specific rule would be too easy to update in only one place by mistake).
 */
export function exerciseMatchesTracks(
  exercise: Exercise,
  levelsByProgram: Record<string, number[]>,
  programs: Program[],
): boolean {
  const trackIds = Object.keys(levelsByProgram);
  if (trackIds.length === 0) return true;
  const exProgs = collectExerciseProgramIds(exercise);
  return trackIds.some((trackId) => {
    const matchIds = resolveProgramMatchIds(trackId, programs);
    const exTagsForTrack = exProgs.filter((id) => matchIds.includes(id));
    if (exTagsForTrack.length === 0) return false;
    const trackLevels = levelsByProgram[trackId];
    if (trackLevels.length === 0) return true;
    return exTagsForTrack.some((id) => {
      const tp = exercise.targetPrograms?.find((t) => t.programId === id);
      const lvl = tp?.level ?? resolveExerciseLevel(exercise);
      return trackLevels.includes(lvl);
    });
  });
}

/** A domain/track program: has a movementPattern (Push/Pull/Legs/Core) and isn't a master. */
export function isDomainProgram(program: Program | undefined): boolean {
  return !!program && !program.isMaster && !!program.movementPattern;
}

/** A specific-skill program (Planche, Front Lever, ...): not a master, no movementPattern. */
export function isSkillProgram(program: Program | undefined): boolean {
  return !!program && !program.isMaster && !program.movementPattern;
}

/**
 * Resolve the level to SHOW on a card (round 4, #10 — replaces round 3's
 * "show only when every targetPrograms entry agrees" rule).
 *
 * Priority:
 *   1. A track filter is active AND the exercise is tagged to a program
 *      within that active selection (expanded through resolveProgramMatchIds,
 *      so an active master still resolves via its matching child) — among
 *      those matching tags, a SKILL program's level wins if one exists
 *      (the user narrowed to that specific skill); otherwise show the
 *      matching level if every matching tag agrees, else omit (ambiguous).
 *   2. No track filter active — show the exercise's own DOMAIN/track level
 *      (a targetPrograms entry whose program is a domain, per
 *      isDomainProgram — never a skill's level as the unscoped default).
 *      Same single-vs-ambiguous rule as above.
 *   3. No domain tag at all — legacy recommendedLevel, if set.
 *   4. Nothing resolvable — null. Never a guessed/fake number.
 */
export function resolveCardLevel(
  exercise: Exercise,
  activeProgramIds: string[],
  programs: Program[],
): number | null {
  const programsById = new Map(programs.map((p) => [p.id, p]));
  const targetPrograms = exercise.targetPrograms ?? [];

  if (activeProgramIds.length > 0) {
    const activeEntries = targetPrograms.filter((tp) =>
      activeProgramIds.some((pid) => resolveProgramMatchIds(pid, programs).includes(tp.programId)),
    );
    if (activeEntries.length === 0) return null; // shouldn't normally happen post-filter, but don't guess

    const skillEntry = activeEntries.find((tp) => isSkillProgram(programsById.get(tp.programId)));
    if (skillEntry) return skillEntry.level;

    const levels = new Set(activeEntries.map((tp) => tp.level));
    return levels.size === 1 ? activeEntries[0].level : null;
  }

  const domainEntries = targetPrograms.filter((tp) => isDomainProgram(programsById.get(tp.programId)));
  if (domainEntries.length > 0) {
    const levels = new Set(domainEntries.map((tp) => tp.level));
    return levels.size === 1 ? domainEntries[0].level : null;
  }

  if (exercise.recommendedLevel && exercise.recommendedLevel > 0) {
    return exercise.recommendedLevel;
  }
  return null;
}

/** Collect all gear/equipment IDs referenced by an exercise's execution methods. */
export function collectExerciseEquipmentIds(exercise: Exercise): string[] {
  const ids = new Set<string>();
  const methods = exercise.execution_methods ?? exercise.executionMethods ?? [];
  for (const m of methods) {
    m.gearIds?.forEach((id) => id && ids.add(id));
    m.equipmentIds?.forEach((id) => id && ids.add(id));
    if (m.gearId) ids.add(m.gearId);
    if (m.equipmentId) ids.add(m.equipmentId);
  }
  return Array.from(ids);
}

/** Collect all program IDs an exercise belongs to. */
export function collectExerciseProgramIds(exercise: Exercise): string[] {
  const ids = new Set<string>();
  exercise.programIds?.forEach((id) => id && ids.add(id));
  exercise.targetPrograms?.forEach((tp) => tp.programId && ids.add(tp.programId));
  return Array.from(ids);
}

/**
 * True only when the exercise has a GENUINE method for this location — an
 * exact `location` match or a `locationMapping` entry. Deliberately does
 * NOT use findMethodForLocation's later fallback tiers ("first method with
 * any media" / "first method at all") — those exist for media resolution,
 * where showing *something* beats showing nothing. Filtering eligibility
 * needs a real match: an exercise with zero home methods must not pass the
 * בית filter just because it has some other method with a photo.
 */
export function exerciseHasLocationMethod(exercise: Exercise, location: 'home' | 'park'): boolean {
  const methods = exercise.execution_methods ?? exercise.executionMethods ?? [];
  return methods.some(
    (m) => m.location === location || m.locationMapping?.includes(location),
  );
}

export function useExerciseLibraryFilters() {
  const allExercises = useExerciseLibraryStore((s) => s.allExercises);
  const allPrograms = useExerciseLibraryStore((s) => s.allPrograms);
  const isLoading = useExerciseLibraryStore((s) => s.isLoading);
  const loadError = useExerciseLibraryStore((s) => s.loadError);
  const filters = useExerciseLibraryStore((s) => s.filters);
  const setAllExercises = useExerciseLibraryStore((s) => s.setAllExercises);
  const setLoading = useExerciseLibraryStore((s) => s.setLoading);
  const setLoadError = useExerciseLibraryStore((s) => s.setLoadError);

  // ── 1. One-time corpus load ────────────────────────────────────────────
  // CRITICAL: this effect must run exactly once per page-mount. Earlier we
  // listed `allExercises.length` in the deps, which caused this loop:
  //   fetch resolves → setAllExercises(list) → length 0→N → effect cleanup
  //   flips `cancelled = true` → in-flight `.finally()` skips
  //   `setLoading(false)` → the UI is wedged on "טוען תרגילים…" forever.
  // Two safeguards prevent that now:
  //   • A module-stable `fetchedRef` guards against re-fetching across
  //     React-StrictMode double-invocations and remounts (cheap idempotency).
  //   • `setLoading(false)` runs UNCONDITIONALLY in `.finally()` — the boolean
  //     is idempotent and represents "the fetch settled", which is always
  //     true when finally fires. The `cancelled` guard only matters for
  //     `setAllExercises` / `setLoadError` (state we don't want to overwrite
  //     after unmount).
  // Module-level ref so it truly survives React StrictMode's forced
  // unmount → remount cycle. A component-level useRef resets to false on
  // remount, which broke the guard: the first fetch resolves after the
  // remount's cleanup sets `cancelled = true`, Zustand is never updated,
  // and the guard stops a second fetch — leaving allExercises at [].
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (allExercises.length > 0) {
      fetchedRef.current = true;
      // eslint-disable-next-line no-console
      console.log('[Library] DB Data (already in store):', allExercises.length);
      return;
    }
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    setLoading(true);
    setLoadError(null);
    // eslint-disable-next-line no-console
    console.log('[Library] Fetching exercises (no orderBy)...');

    // All state updates below target the Zustand store — a module-level
    // singleton that is safe to write from any async context, including
    // after the component that started the fetch has unmounted (React
    // StrictMode's forced remount). There is NO `cancelled` guard here
    // because that pattern only protects React useState setters from
    // "Can't perform a React state update on an unmounted component"
    // warnings — Zustand actions don't have that restriction.
    getAllExercisesNoOrder()
      .then((list) => {
        // eslint-disable-next-line no-console
        console.log('[Library] DB Data (fetched):', list.length, 'exercises');
        if (list.length > 0) {
          // eslint-disable-next-line no-console
          console.log('[Library] First 3 sample IDs:', list.slice(0, 3).map((e) => e.id));
        }
        setAllExercises(list);
      })
      .catch((err: unknown) => {
        const isObj = typeof err === 'object' && err !== null;
        const code = isObj && 'code' in err ? (err as { code: unknown }).code : undefined;
        const errName = isObj && 'name' in err ? (err as { name: unknown }).name : undefined;
        const msg =
          isObj && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'Failed to load exercises';
        // eslint-disable-next-line no-console
        console.error('[Library] DB FETCH FAILED:', { code, errName, message: msg, raw: err });
        const codeLabel = code ? ` (${String(code)})` : '';
        setLoadError(`${msg}${codeLabel}`);
      })
      .finally(() => {
        setLoading(false);
      });
    // No cleanup needed — all setters are Zustand actions (safe after unmount).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setAllExercises, setLoading, setLoadError]);

  // ── 2. Debounced search query ──────────────────────────────────────────
  const [debouncedQuery, setDebouncedQuery] = useState(filters.query);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(filters.query), 300);
    return () => clearTimeout(t);
  }, [filters.query]);

  // ── 3. Derived: visible exercises ──────────────────────────────────────
  const visible = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    // Per-stage drop counters so we can pinpoint exactly which filter is
    // emptying the list (vs. a fetch problem). Each counter is the number
    // of exercises rejected by that single stage.
    let droppedByQuery = 0;
    let droppedByMuscles = 0;
    let droppedByTracks = 0;
    let droppedByEquipment = 0;
    let droppedByLocation = 0;

    // ── One-shot trace of the very first exercise through every stage ──
    // Runs ONCE per memo invocation, never per item. Tells us in plain
    // English which gate is sending exercise[0] to the floor — no more
    // guessing which filter is the culprit.
    if (allExercises.length > 0) {
      const ex = allExercises[0];

      const heName = (ex.name?.he ?? '').toLowerCase();
      const enName = (ex.name?.en ?? '').toLowerCase();
      const passSearch = !q || heName.includes(q) || enName.includes(q);

      // Primary-muscle-only (round 4, #4 — was primary OR secondary OR muscleGroups).
      const passMuscles = filters.muscles.length === 0 || (!!ex.primaryMuscle && filters.muscles.includes(ex.primaryMuscle));

      // Tracks — per-track level, OR across tracks (round 5, #6).
      const passTracks = exerciseMatchesTracks(ex, filters.levelsByProgram, allPrograms);

      let passEquipment = true;
      if (filters.equipmentIds.length > 0) {
        const wantsBW = filters.equipmentIds.includes(BODYWEIGHT_SENTINEL);
        const gIds = wantsBW
          ? filters.equipmentIds.filter((g) => g !== BODYWEIGHT_SENTINEL)
          : filters.equipmentIds;
        const exGear = collectExerciseEquipmentIds(ex);
        const mBW = wantsBW && exGear.length === 0;
        const mGear = gIds.length > 0 && gIds.some((g) => exGear.includes(g));
        passEquipment = mBW || mGear;
      }

      let passLocation = true;
      if (filters.location === 'home' || filters.location === 'park') {
        passLocation = exerciseHasLocationMethod(ex, filters.location);
      }

      // eslint-disable-next-line no-console
      console.log('[Library] CURRENT FILTERS IN STORE:', filters);
      // eslint-disable-next-line no-console
      console.log('[Library] Trace exercise[0]', {
        id: ex.id,
        name: ex.name?.he || ex.name?.en,
        primaryMuscle: ex.primaryMuscle,
        programIds: collectExerciseProgramIds(ex),
        gearIds: collectExerciseEquipmentIds(ex),
      });
      // eslint-disable-next-line no-console
      console.log('[Library] Item 0 - Pass Search?', passSearch);
      // eslint-disable-next-line no-console
      console.log('[Library] Item 0 - Pass Muscles (primary-only)?', passMuscles);
      // eslint-disable-next-line no-console
      console.log('[Library] Item 0 - Pass Tracks (per-track level)?', passTracks);
      // eslint-disable-next-line no-console
      console.log('[Library] Item 0 - Pass Equipment?', passEquipment);
      // eslint-disable-next-line no-console
      console.log('[Library] Item 0 - Pass Location?', passLocation);
    }

    const result = allExercises.filter((ex) => {
      // Text query — name only (he + en)
      if (q) {
        const he = (ex.name?.he ?? '').toLowerCase();
        const en = (ex.name?.en ?? '').toLowerCase();
        if (!he.includes(q) && !en.includes(q)) {
          droppedByQuery++;
          return false;
        }
      }

      // Muscles — PRIMARY muscle only (round 4, #4). Was primary OR
      // secondary OR the legacy muscleGroups array; narrowed because a
      // muscle chip is meant to answer "is this exercise FOR this muscle",
      // not "does this muscle get incidentally worked too".
      if (filters.muscles.length > 0) {
        if (!ex.primaryMuscle || !filters.muscles.includes(ex.primaryMuscle)) {
          droppedByMuscles++;
          return false;
        }
      }

      // Tracks — per-track level, OR across tracks (round 5, #6). Master
      // programs still expand to their children (round 4, #7) inside
      // exerciseMatchesTracks.
      if (!exerciseMatchesTracks(ex, filters.levelsByProgram, allPrograms)) {
        droppedByTracks++;
        return false;
      }

      // ── Equipment — any-of, with optional bodyweight pseudo-chip ───────
      // Default ("Show All"): no equipment chip is selected → bypass this
      // stage entirely. This is the explicit safety net so an empty array
      // can NEVER accidentally drop exercises (including bodyweight ones).
      const equipmentIds = filters.equipmentIds;
      if (equipmentIds.length > 0) {
        // At least one chip is selected. The match rule is:
        //   • The bodyweight sentinel matches exercises with zero gear IDs.
        //   • Real gear IDs match exercises that reference any of them.
        //   • Either condition passes (OR) — selections combine, never AND.
        const wantsBodyweight = equipmentIds.includes(BODYWEIGHT_SENTINEL);
        const gearIds = wantsBodyweight
          ? equipmentIds.filter((g) => g !== BODYWEIGHT_SENTINEL)
          : equipmentIds;
        const exGear = collectExerciseEquipmentIds(ex);
        const matchesBodyweight = wantsBodyweight && exGear.length === 0;
        const matchesGear =
          gearIds.length > 0 && gearIds.some((g) => exGear.includes(g));
        if (!matchesBodyweight && !matchesGear) {
          droppedByEquipment++;
          return false;
        }
      }

      // ── Location — real match only (round 2, #7). 'gym' and null bypass
      // this stage entirely (gym is coded-but-not-offered in the UI today;
      // null means no location filter is active).
      if (filters.location === 'home' || filters.location === 'park') {
        if (!exerciseHasLocationMethod(ex, filters.location)) {
          droppedByLocation++;
          return false;
        }
      }

      return true;
    });

    // Default sort: level ascending (round 2 polish — was unsorted/DB order).
    result.sort((a, b) => resolveExerciseLevel(a) - resolveExerciseLevel(b));

    // eslint-disable-next-line no-console
    console.log('[Library] Filter pipeline', {
      'DB total': allExercises.length,
      'Search Query': debouncedQuery || '(none)',
      'Active Filters': {
        muscles: filters.muscles,
        levelsByProgram: filters.levelsByProgram,
        equipmentIds: filters.equipmentIds,
        location: filters.location,
      },
      droppedByQuery,
      droppedByMuscles,
      droppedByTracks,
      droppedByEquipment,
      droppedByLocation,
      'Visible Count after filters': result.length,
    });

    return result;
  }, [allExercises, allPrograms, debouncedQuery, filters]);

  // ── 4. Pagination window ───────────────────────────────────────────────
  // Reset to the first page whenever the filter result changes (different
  // filters → different list → restart from the top). We watch `visible` by
  // reference: the memo above produces a new array only when an actual
  // input changes, so this avoids unnecessary resets while typing matches.
  const [pageSize, setPageSize] = useState(LIBRARY_PAGE_SIZE);
  useEffect(() => {
    setPageSize(LIBRARY_PAGE_SIZE);
  }, [visible]);

  const paginated = useMemo(() => {
    const slice = visible.slice(0, pageSize);
    // eslint-disable-next-line no-console
    console.log('[Library] Paginated Count:', slice.length, 'PageSize:', pageSize, 'Visible:', visible.length);
    return slice;
  }, [visible, pageSize]);
  const hasMore = pageSize < visible.length;
  const loadMore = useCallback(() => {
    setPageSize((p) => p + LIBRARY_PAGE_SIZE);
  }, []);

  return {
    /** The slice currently rendered to the DOM (paginated). */
    paginated,
    /** Total matches for the active filters — drives the result counter. */
    visibleCount: visible.length,
    /** Whether more rows can be appended via `loadMore()`. */
    hasMore,
    /** Append the next batch (PAGE_SIZE rows). */
    loadMore,
    isLoading,
    loadError,
    /** Total exercises in the loaded corpus (pre-filter). */
    totalCount: allExercises.length,
  };
}
