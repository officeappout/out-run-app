/**
 * /library — Smart Exercise Library (Phase 5)
 *
 * Lazy-loads the heavy client component to keep the initial bundle small.
 */

import nextDynamic from 'next/dynamic';

export const dynamic = 'force-dynamic';

const ExerciseLibraryPage = nextDynamic(
  () => import('@/features/content/exercises/client/ExerciseLibraryPage'),
  { ssr: false },
);

export default function LibraryRoutePage() {
  return <ExerciseLibraryPage />;
}
