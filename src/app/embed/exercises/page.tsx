'use client';

/**
 * /embed/exercises — anonymous, chrome-free exercise library for embedding
 * in an external <iframe> (marketing site).
 *
 * Wraps the existing `ExerciseLibraryContent` (header-less, search-input-less
 * body — see src/features/content/exercises/client/ExerciseLibraryPage.tsx).
 * Per that component's own contract, the caller drives the corpus by writing
 * to `useExerciseLibraryStore.setQuery` directly — so this page supplies its
 * own minimal search input instead of pulling in AppHeader or /search's full
 * unified-search chrome.
 */

import nextDynamic from 'next/dynamic';
import { useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { useExerciseLibraryStore } from '@/features/content/exercises/client/store/useExerciseLibraryStore';
import { parseEmbedConfig } from '@/lib/embed-config';

export const dynamic = 'force-dynamic';

// Same lazy-load pattern as /search — keeps the exercise corpus parser out
// of the initial bundle.
const ExerciseLibraryContent = nextDynamic(
  () =>
    import('@/features/content/exercises/client/ExerciseLibraryPage').then(
      (m) => m.ExerciseLibraryContent,
    ),
  { ssr: false },
);

const COLUMN = 'max-w-[450px] mx-auto';

export default function EmbedExercisesPage() {
  const searchParams = useSearchParams();
  const { lang } = parseEmbedConfig(searchParams);
  const dir = lang === 'en' ? 'ltr' : 'rtl';

  const query = useExerciseLibraryStore((s) => s.filters.query);
  const setQuery = useExerciseLibraryStore((s) => s.setQuery);

  const handleQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value),
    [setQuery],
  );

  return (
    <div className="min-h-[100dvh] bg-background-light" dir={dir}>
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-md border-b border-gray-100 px-4 pt-3 pb-2">
        <div className={`${COLUMN} relative`}>
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

      <ExerciseLibraryContent topPadding="pt-2" />
    </div>
  );
}
