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

/**
 * Initial batch size + increment for "Load More". 12 keeps the first paint
 * cheap (≈4 viewport-heights of cards) while not feeling stingy.
 */
export const LIBRARY_PAGE_SIZE = 12;

/**
 * Resolve the canonical level for an exercise.
 * Picks the lowest level across `targetPrograms` (entry-level), defaulting to 1.
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

/** Collect all gear/equipment IDs referenced by an exercise's execution methods. */
function collectExerciseEquipmentIds(exercise: Exercise): string[] {
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
function collectExerciseProgramIds(exercise: Exercise): string[] {
  const ids = new Set<string>();
  exercise.programIds?.forEach((id) => id && ids.add(id));
  exercise.targetPrograms?.forEach((tp) => tp.programId && ids.add(tp.programId));
  return Array.from(ids);
}

export function useExerciseLibraryFilters() {
  const allExercises = useExerciseLibraryStore((s) => s.allExercises);
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
    let droppedByProgram = 0;
    let droppedByLevel = 0;
    let droppedByEquipment = 0;

    // ── One-shot trace of the very first exercise through every stage ──
    // Runs ONCE per memo invocation, never per item. Tells us in plain
    // English which gate is sending exercise[0] to the floor — no more
    // guessing which filter is the culprit.
    if (allExercises.length > 0) {
      const ex = allExercises[0];

      const heName = (ex.name?.he ?? '').toLowerCase();
      const enName = (ex.name?.en ?? '').toLowerCase();
      const passSearch = !q || heName.includes(q) || enName.includes(q);

      let passMuscles = true;
      if (filters.muscles.length > 0) {
        const muscles = new Set<string>();
        if (ex.primaryMuscle) muscles.add(ex.primaryMuscle);
        ex.secondaryMuscles?.forEach((m) => muscles.add(m));
        ex.muscleGroups?.forEach((m) => muscles.add(m));
        passMuscles = filters.muscles.some((m) => muscles.has(m));
      }

      let passProgram = true;
      let passLevel = true;
      if (filters.programId) {
        const exProgs = collectExerciseProgramIds(ex);
        passProgram = exProgs.includes(filters.programId);
        if (passProgram && filters.level != null) {
          const tp = ex.targetPrograms?.find(
            (t) => t.programId === filters.programId,
          );
          const lvl = tp?.level ?? resolveExerciseLevel(ex);
          passLevel = lvl === filters.level;
        }
      }

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
      console.log('[Library] Item 0 - Pass Muscles?', passMuscles);
      // eslint-disable-next-line no-console
      console.log('[Library] Item 0 - Pass Program?', passProgram);
      // eslint-disable-next-line no-console
      console.log('[Library] Item 0 - Pass Level?', passLevel);
      // eslint-disable-next-line no-console
      console.log('[Library] Item 0 - Pass Equipment?', passEquipment);
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

      // Muscles — match if exercise targets ANY of the selected muscles
      if (filters.muscles.length > 0) {
        const muscles = new Set<string>();
        if (ex.primaryMuscle) muscles.add(ex.primaryMuscle);
        ex.secondaryMuscles?.forEach((m) => muscles.add(m));
        ex.muscleGroups?.forEach((m) => muscles.add(m));
        const hit = filters.muscles.some((m) => muscles.has(m));
        if (!hit) {
          droppedByMuscles++;
          return false;
        }
      }

      // Unified Program + Level (level is scoped INSIDE the chosen program).
      if (filters.programId) {
        const exProgs = collectExerciseProgramIds(ex);
        if (!exProgs.includes(filters.programId)) {
          droppedByProgram++;
          return false;
        }

        if (filters.level != null) {
          const tp = ex.targetPrograms?.find(
            (t) => t.programId === filters.programId,
          );
          const lvl = tp?.level ?? resolveExerciseLevel(ex);
          if (lvl !== filters.level) {
            droppedByLevel++;
            return false;
          }
        }
      }

      // ── Equipment — any-of, with optional bodyweight pseudo-chip ───────
      // Default ("Show All"): no equipment chip is selected → bypass this
      // stage entirely. This is the explicit safety net so an empty array
      // can NEVER accidentally drop exercises (including bodyweight ones).
      const equipmentIds = filters.equipmentIds;
      if (equipmentIds.length === 0) return true;

      // From here on, at least one chip is selected. The match rule is:
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
      if (matchesBodyweight || matchesGear) return true;
      droppedByEquipment++;
      return false;
    });

    // eslint-disable-next-line no-console
    console.log('[Library] Filter pipeline', {
      'DB total': allExercises.length,
      'Search Query': debouncedQuery || '(none)',
      'Active Filters': {
        muscles: filters.muscles,
        programId: filters.programId,
        level: filters.level,
        equipmentIds: filters.equipmentIds,
      },
      droppedByQuery,
      droppedByMuscles,
      droppedByProgram,
      droppedByLevel,
      droppedByEquipment,
      'Visible Count after filters': result.length,
    });

    return result;
  }, [allExercises, debouncedQuery, filters]);

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
