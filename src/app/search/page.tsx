'use client';

/**
 * /search — a thin shell.
 *   enable_unified_search ON  → UnifiedSearchScreen (src/features/search): one search over
 *                               exercises, parks, routes, people & groups, events, articles, help.
 *   OFF (default)             → today's search page, moved verbatim to
 *                               src/features/search/legacy/LegacySearchPage.tsx.
 * While the flags are still loading the legacy page renders, so flag-off users see exactly what
 * they see today (the flags are cached locally, so flag-on users normally skip that frame).
 */
import nextDynamic from 'next/dynamic';
import { useUnifiedSearchFlag } from '@/features/search/hooks/useUnifiedSearchFlag';
import LegacySearchPage from '@/features/search/legacy/LegacySearchPage';

// Its own chunk: flag-off users never download the unified search code.
const UnifiedSearchScreen = nextDynamic(() => import('@/features/search/components/UnifiedSearchScreen'), { ssr: false });

export default function SearchPage() {
  const { on } = useUnifiedSearchFlag();
  return on ? <UnifiedSearchScreen /> : <LegacySearchPage />;
}
