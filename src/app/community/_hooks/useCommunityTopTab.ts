import { useCallback, useEffect } from 'react';
import type { useRouter, useSearchParams } from 'next/navigation';
import { IS_COMMUNITY_FEED_ENABLED } from '@/config/feature-flags';
import type { FeatureFlags } from '@/hooks/useFeatureFlags';
import type { CommunityTopTab } from '../_lib/community-constants';
import { resolveCommunityTopTab } from '../_lib/community-logic';

/**
 * Top-level tab (פיד / ליגות) from the URL ?tab= param, plus the route guard
 * that bounces to /home when both surfaces are off.
 */
export function useCommunityTopTab(
  featureFlags: FeatureFlags,
  flagsLoading: boolean,
  searchParams: ReturnType<typeof useSearchParams>,
  router: ReturnType<typeof useRouter>,
) {
  // ── Top-level tab from URL param ─────────────────────────────────────────
  // Feed requires BOTH the compile-time MVP pause to be lifted (IS_COMMUNITY_FEED_ENABLED)
  // AND the live admin toggle (enableCommunityFeed) — the compile flag is a hard
  // ceiling that live-flipping the admin toggle must never bypass. Leagues has no
  // compile-time gate, so it resolves on the live flag alone. Neither a stale
  // ?tab= deep link nor the default (no ?tab=) can ever land on a tab that isn't
  // actually enabled — falls through to whichever surface is live, or to 'feed'
  // as an inert default when neither is (the page-level guard below redirects
  // home in that case before this matters for render).
  const tabParam = searchParams.get('tab');
  const isFeedTabAvailable = IS_COMMUNITY_FEED_ENABLED && featureFlags.enableCommunityFeed;
  // Home v2 (17.10.2026): leagues is the first / default tab (no ?tab=), the
  // feed moves to ?tab=feed. Without v2 the feed stays the default.
  const leaguesFirst = featureFlags.enableHomeV2 && featureFlags.enableLeagues;
  const defaultTopTab: CommunityTopTab = leaguesFirst ? 'leagues' : 'feed';
  const topTab: CommunityTopTab = resolveCommunityTopTab({
    tabParam,
    isFeedTabAvailable,
    enableLeagues: featureFlags.enableLeagues,
    leaguesFirst,
  });

  /** Writes `next` into the ?tab= param (the default tab is left out of the URL). */
  const applyTabParam = useCallback(
    (params: URLSearchParams, next: CommunityTopTab) => {
      if (next === defaultTopTab) params.delete('tab');
      else params.set('tab', next);
    },
    [defaultTopTab],
  );

  const setTopTab = useCallback(
    (next: CommunityTopTab) => {
      const params = new URLSearchParams(searchParams.toString());
      applyTabParam(params, next);
      const qs = params.toString();
      router.replace(`/community${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router, searchParams, applyTabParam],
  );

  // ── Route guard: redirect only when BOTH surfaces are disabled ───────────
  // The page hosts two independent surfaces: the social feed (enableCommunityFeed)
  // and leagues (enableLeagues). We only bounce to /home when neither is on.
  useEffect(() => {
    if (!flagsLoading && !featureFlags.enableCommunityFeed && !featureFlags.enableLeagues) {
      router.replace('/home');
    }
  }, [flagsLoading, featureFlags.enableCommunityFeed, featureFlags.enableLeagues, router]);

  return { isFeedTabAvailable, leaguesFirst, topTab, applyTabParam, setTopTab };
}
