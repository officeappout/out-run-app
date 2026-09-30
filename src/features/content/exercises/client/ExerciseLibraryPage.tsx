'use client';

/**
 * ExerciseLibraryPage — main client component for /library.
 *
 * Two exports:
 *   • default (`ExerciseLibraryPage`)   — standalone full-page surface with
 *     its own sticky header (back button + title + search field). Used by
 *     the `/library` route.
 *   • named  (`ExerciseLibraryContent`) — header-less, search-input-less
 *     embed. Used by `/search` so the unified search page can render the
 *     library inside its own AppHeader + shared search field. The caller
 *     drives the corpus by writing to `useExerciseLibraryStore.setQuery`
 *     directly.
 *
 * Both renderers share `ExerciseLibraryBody` which owns the heavy logic:
 *   • Filter pills row
 *   • Live result counter
 *   • Paginated list (`LIBRARY_PAGE_SIZE` batches) with an
 *     IntersectionObserver sentinel that triggers loadMore() near the bottom
 *   • Skeleton shimmer + empty/error states
 *   • ExerciseDetailSheet
 *
 * Perceived performance:
 *   • First paint shows skeleton shimmer cards while the corpus loads.
 *   • Each card defers its preview <video src> until it actually scrolls
 *     into view (see ExerciseVideoPlayer's strict-lazy mode).
 *   • Pagination caps the DOM size; new rows mount only when the sentinel
 *     enters the viewport.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Search, X } from 'lucide-react';
import MuscleFilterBar from './components/MuscleFilterBar';
import ActiveFilterChipsRow from './components/ActiveFilterChipsRow';
import SecondaryFiltersSheet from './components/SecondaryFiltersSheet';
import ExerciseImageCard from './components/ExerciseImageCard';
import ExerciseDetailSheet from './components/ExerciseDetailSheet';
import { useExerciseLibraryStore } from './store/useExerciseLibraryStore';
import { useExerciseLibraryFilters } from './hooks/useExerciseLibraryFilters';
import { ensureEquipmentCachesLoaded } from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import { getAllPrograms } from '@/features/content/programs/core/program.service';
import { getAllGearDefinitions } from '@/features/content/equipment/gear/core/gear-definition.service';
import type { GearDefinition } from '@/features/content/equipment/gear/core/gear-definition.types';

/** Mobile-shell column width applied across the page (450px per spec). */
const COLUMN = 'max-w-[450px] mx-auto';

/**
 * Shimmer placeholder mirroring ExerciseImageCard's silhouette (2-col grid).
 * Pure tailwind (no JS) so it has zero runtime cost while loading.
 */
function SkeletonCard() {
  return (
    <div className="h-[168px] rounded-[18px] bg-gray-200 animate-pulse" />
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Shared body — pills row + counter + list + detail sheet.
// Renders WITHOUT any sticky header or search input so it can be embedded
// inside another page's chrome (e.g. /search).
// ────────────────────────────────────────────────────────────────────────────

interface ExerciseLibraryBodyProps {
  /** When true (default), render the muscle bar + secondary-filters chrome above the result grid. */
  showFilterPills?: boolean;
  /** Top padding above the counter row. Defaults to `pt-3` for full page;
   *  callers embedding the library inside their own scroll container can
   *  override (e.g. `pt-0`) so the counter sits flush. */
  topPadding?: string;
}

function ExerciseLibraryBody({
  showFilterPills = true,
  topPadding = 'pt-3',
}: ExerciseLibraryBodyProps) {
  const openDetail = useExerciseLibraryStore((s) => s.openDetail);
  const resetFilters = useExerciseLibraryStore((s) => s.resetFilters);
  const setAllPrograms = useExerciseLibraryStore((s) => s.setAllPrograms);

  // Gear catalog — loaded once here (not inside SecondaryFiltersSheet/
  // ActiveFilterChipsRow individually) so both share one fetch instead of
  // each re-querying Firestore for the same list. Programs are fetched here
  // too but land in the STORE (setAllPrograms) rather than local state —
  // useExerciseLibraryFilters' actual filtering logic needs the program
  // catalog too (master→children expansion, #7; domain-vs-skill
  // classification, #10), not just the sheet/chips-row UI.
  const [gear, setGear] = useState<GearDefinition[]>([]);

  // Fresh start on every mount. The Zustand store is a module singleton so
  // any filter the user applied in a previous session would otherwise
  // survive a navigate-away-and-back and silently empty the list.
  useEffect(() => {
    resetFilters();
    void ensureEquipmentCachesLoaded();
    getAllPrograms().then(setAllPrograms).catch(() => {});
    getAllGearDefinitions().then(setGear).catch(() => {});
    // Mount-only — stable refs from Zustand / module-level singleton.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    paginated,
    visibleCount,
    hasMore,
    loadMore,
    isLoading,
    loadError,
    totalCount,
  } = useExerciseLibraryFilters();

  // ── Infinite-scroll sentinel ──────────────────────────────────────────
  // CRITICAL: the effect must depend on `paginated.length` — NOT just
  // `hasMore` — so the observer is re-created after every loadMore() call.
  // Re-creating the observer forces a fresh initial-observation, which
  // fires unconditionally and immediately if the sentinel is still visible.
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && hasMoreRef.current) {
            loadMoreRef.current();
          }
        }
      },
      { rootMargin: '400px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paginated.length]);

  return (
    <>
      {showFilterPills && (
        <div className={`${COLUMN} px-4 pt-3 space-y-2`}>
          <MuscleFilterBar />
          <ActiveFilterChipsRow gear={gear} />
        </div>
      )}

      {/* ── Result Counter ── live with filter changes */}
      <div className={`${COLUMN} px-4 ${topPadding} pb-1`}>
        <p className="text-[12px] font-semibold text-gray-500" dir="rtl">
          {isLoading ? (
            'טוען תרגילים...'
          ) : loadError ? (
            <span className="text-red-600">שגיאה בטעינה</span>
          ) : (
            <>
              נמצאו{' '}
              <span className="text-gray-900 font-bold tabular-nums">
                {visibleCount}
              </span>{' '}
              תרגילים
            </>
          )}
        </p>
      </div>

      {/* ── List ── */}
      <main className={`${COLUMN} px-4 pt-2 pb-8`}>
        {loadError ? (
          <div className="mt-12 text-center">
            <p className="text-sm text-red-600 font-semibold">
              שגיאה בטעינת התרגילים
            </p>
            <p className="text-xs text-gray-500 mt-1 break-all">{loadError}</p>
            <p className="text-[11px] text-gray-400 mt-3">
              בדוק חיבור לאינטרנט והרשאות Firestore. הפרטים המלאים מודפסים ב-Console.
            </p>
          </div>
        ) : isLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : totalCount === 0 ? (
          <div className="mt-16 text-center">
            <p className="text-sm font-semibold text-gray-700">
              לא נטענו תרגילים מהשרת
            </p>
            <p className="text-xs text-gray-500 mt-1">
              ייתכן שאין חיבור ל-Firestore או שהאוסף ריק. בדוק את ה-Console.
            </p>
          </div>
        ) : paginated.length === 0 ? (
          <div className="mt-16 text-center">
            <p className="text-sm font-semibold text-gray-700">לא נמצאו תרגילים</p>
            <p className="text-xs text-gray-500 mt-1">נסה להסיר חלק מהמסננים</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              {paginated.map((ex) => (
                <ExerciseImageCard
                  key={ex.id}
                  exercise={ex}
                  onClick={() => openDetail(ex)}
                />
              ))}
            </div>

            {/* Sentinel is ALWAYS rendered so sentinelRef.current is never
                null when the effect runs. The IO callback gates loadMore()
                via hasMoreRef, so it is safe to observe even when the list
                is fully loaded — it simply won't call loadMore. */}
            <div ref={sentinelRef} aria-hidden className="h-px w-full" />

            {hasMore && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <SkeletonCard />
                <SkeletonCard />
              </div>
            )}
          </>
        )}
      </main>

      <SecondaryFiltersSheet gear={gear} />
      <ExerciseDetailSheet />
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Embed export — header-less, search-input-less. The host page is expected
// to render its own search input and write to `useExerciseLibraryStore`
// directly via `setQuery`.
// ────────────────────────────────────────────────────────────────────────────

export function ExerciseLibraryContent(props: ExerciseLibraryBodyProps) {
  return (
    <div className="bg-background-light" dir="rtl">
      <ExerciseLibraryBody {...props} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Default export — standalone /library page with its own sticky header.
// ────────────────────────────────────────────────────────────────────────────

export default function ExerciseLibraryPage() {
  const router = useRouter();
  const query = useExerciseLibraryStore((s) => s.filters.query);
  const setQuery = useExerciseLibraryStore((s) => s.setQuery);

  const handleQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value),
    [setQuery],
  );

  return (
    <div className="min-h-[100dvh] bg-background-light" dir="rtl">
      {/* ── Sticky Header ── */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-100">
        <div className={`${COLUMN} px-4 pt-3 pb-2`}>
          <div className="flex items-center gap-2 mb-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="p-2 -ms-2 text-gray-500 hover:text-gray-800 rounded-full"
              aria-label="חזרה"
            >
              <ArrowRight size={22} />
            </button>
            <h1 className="text-lg font-bold text-gray-900">ספריית תרגילים</h1>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search
              size={18}
              className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
            <input
              type="text"
              value={query}
              onChange={handleQueryChange}
              placeholder="חפש תרגיל..."
              className="w-full ps-10 pe-10 py-2.5 text-sm bg-gray-100 border border-transparent rounded-2xl focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-gray-400"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label="נקה חיפוש"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>
      </header>

      <ExerciseLibraryBody />
    </div>
  );
}
