'use client';

/**
 * ExerciseLibraryPage — main client component for /library.
 *
 * Layout (RTL, top → bottom):
 *   1. Sticky header: back button + title + search field + 4 filter pills
 *   2. Result counter: 'נמצאו {count} תרגילים' (live, debounced w/ filters)
 *   3. Result list — paginated (LIBRARY_PAGE_SIZE batches) with an
 *      IntersectionObserver sentinel that calls loadMore() near the bottom
 *      → effectively infinite scroll.
 *   4. Bottom drawers (FilterSheet — managed by FilterPills; ExerciseDetailSheet)
 *
 * Desktop polish: every horizontal block is centered in a max-w-[450px]
 * column so the app reads like a native mobile shell on large screens.
 *
 * Perceived performance:
 *   • First paint shows skeleton shimmer cards while the corpus loads.
 *   • Each card defers its preview <video src> until it actually scrolls
 *     into view (see ExerciseVideoPlayer's strict-lazy mode).
 *   • Pagination caps the DOM size; new rows mount only when the sentinel
 *     enters the viewport.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Search, X } from 'lucide-react';
import FilterPills from './components/FilterPills';
import ExerciseLibraryCard from './components/ExerciseLibraryCard';
import ExerciseDetailSheet from './components/ExerciseDetailSheet';
import { useExerciseLibraryStore } from './store/useExerciseLibraryStore';
import { useExerciseLibraryFilters } from './hooks/useExerciseLibraryFilters';
import { ensureEquipmentCachesLoaded } from '@/features/workout-engine/shared/utils/gear-mapping.utils';

/** Mobile-shell column width applied across the page (450px per spec). */
const COLUMN = 'max-w-[450px] mx-auto';

/**
 * Shimmer placeholder mirroring ExerciseLibraryCard's silhouette.
 * Pure tailwind (no JS) so it has zero runtime cost while loading.
 */
function SkeletonCard() {
  return (
    <div
      className="relative w-full bg-white border-[0.5px] border-[#E0E9FF] rounded-lg shadow-sm overflow-hidden"
      dir="rtl"
    >
      <div className="flex flex-row-reverse items-center py-2 px-3 animate-pulse">
        <div className="flex items-center text-gray-200 ms-1 me-1">
          <div className="w-4 h-4 rounded-full bg-gray-100" />
        </div>
        <div className="flex-1 flex flex-col justify-center mx-2 min-w-0 gap-2">
          <div className="h-3 bg-gray-200 rounded w-3/4" />
          <div className="h-2.5 bg-gray-100 rounded-full w-1/3" />
        </div>
        <div className="w-16 h-16 rounded-xl bg-gray-200 flex-shrink-0" />
      </div>
    </div>
  );
}

export default function ExerciseLibraryPage() {
  const router = useRouter();
  const query = useExerciseLibraryStore((s) => s.filters.query);
  const setQuery = useExerciseLibraryStore((s) => s.setQuery);
  const openDetail = useExerciseLibraryStore((s) => s.openDetail);
  const resetFilters = useExerciseLibraryStore((s) => s.resetFilters);

  // Fresh start on every visit. The Zustand store is a module singleton so
  // any filter the user applied in a previous session would otherwise
  // survive a navigate-away-and-back and silently empty the list.
  useEffect(() => {
    resetFilters();
    // Warm the gear label caches so resolveEquipmentLabel() can resolve
    // raw Firestore document IDs (e.g. VQoqHLfhHGhPsaz2zsQO) to Hebrew
    // labels without showing 'ציוד לא מזוהה' in the detail sheet.
    void ensureEquipmentCachesLoaded();
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
  //
  // Why: IntersectionObserver only fires when the intersection STATE
  // changes (not-intersecting → intersecting). If the sentinel is already
  // inside the rootMargin zone when `loadMore` adds items (common when the
  // list is short), the IO sees no state change and never fires again.
  // Re-creating the observer forces a fresh initial-observation, which
  // fires unconditionally and immediately if the sentinel is still visible.
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;
  // Ref so the IO callback always reads the latest value without being
  // listed as a dep (avoids recreating the observer on every render).
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // eslint-disable-next-line no-console
          console.log('[Library] Sentinel Intersecting:', entry.isIntersecting, '| hasMore:', hasMoreRef.current);
          if (entry.isIntersecting && hasMoreRef.current) {
            loadMoreRef.current();
          }
        }
      },
      // 400px look-ahead so the next batch is in the DOM before the user
      // reaches the sentinel — eliminates any visible "pop-in" of new rows.
      { rootMargin: '400px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
    // Re-observe after every batch so the IO fires again if the sentinel
    // is still in the detection zone after new items mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paginated.length]);

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

          {/* Filter pills — edge-to-edge scroll row, 8px breathing room below search */}
          <div className="mt-2 -mx-4">
            <FilterPills />
          </div>
        </div>
      </header>

      {/* ── Result Counter ── live with filter changes */}
      <div className={`${COLUMN} px-4 pt-3 pb-1`}>
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
          // First-paint shimmer — 8 placeholder rows feels "loaded" instantly
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : totalCount === 0 ? (
          // Fetch returned an empty collection (no Firestore exception, no
          // documents). This is a different failure than "filters too narrow"
          // — usually wrong project, missing collection, or rules denying the
          // listAll. Tell the user clearly so it doesn't get confused with
          // "no results".
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
          <div className="space-y-2">
            {paginated.map((ex) => (
              <ExerciseLibraryCard
                key={ex.id}
                exercise={ex}
                onClick={() => openDetail(ex)}
              />
            ))}

            {/* Sentinel is ALWAYS rendered so sentinelRef.current is never
                null when the effect runs. The IO callback gates loadMore()
                via hasMoreRef, so it is safe to observe even when the list
                is fully loaded — it simply won't call loadMore. */}
            <div ref={sentinelRef} aria-hidden className="h-px w-full" />

            {/* Skeleton rows appear only while more items are expected. */}
            {hasMore && (
              <div className="space-y-2">
                <SkeletonCard />
                <SkeletonCard />
              </div>
            )}
          </div>
        )}
      </main>

      <ExerciseDetailSheet />
    </div>
  );
}
