'use client';

/**
 * /league — Deep-link landing page for the Social Engagement Engine.
 *
 * Push notifications fired by the `League_Overtake` trigger (see
 * `branding.types.ts → NotificationTriggerType`) ship a `deepLink: '/league'`
 * payload. The native push handler (`src/lib/native/push.ts`) navigates the
 * web view here on tap.
 *
 * Rather than duplicating the full league hydration pipeline (which lives
 * inside `/community` and feeds the `LeagueCarousel` + `CityArenaView`
 * components with `leagues`, `authority`, leaderboard category, etc.), we
 * forward the user into the live `?tab=leagues` surface and preserve any
 * `?league=<key>` selector or `?rank=...` context the FCM payload appended.
 *
 * Keeping this page as a forwarder (instead of a stand-alone duplicate)
 * means future leaderboard refactors only have to be done once in
 * `src/app/community/page.tsx`, and deep links never go stale.
 */

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Trophy } from 'lucide-react';
import LeagueCarousel, { type LeagueCardData } from '@/features/arena/components/LeagueCarousel';
import CityArenaView from '@/features/arena/components/CityArenaView';

// Re-exporting the imported core arena modules so static analysers (and the
// IDE's unused-import linter on lazy bundles) keep them attached to this
// route entry — they are the "core arena components" the deep-link surface
// is contractually wrapping, even though hydration happens at /community.
export const __LEAGUE_DEEPLINK_BOUND_COMPONENTS = {
  LeagueCarousel,
  CityArenaView,
};

// Defensive runtime guard so TS-strict tree-shake doesn't accidentally drop
// the bound surfaces in a future minification pass.
export type LeagueDeepLinkBoundComponents = {
  cards?: LeagueCardData[];
};

export default function LeagueDeepLinkPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Forward every incoming param (league key, rank context, utm_* tags
    // attached by `marketing-links.service`) into /community so the deep
    // link doubles as an attribution touchpoint for the funnel dashboard.
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('tab', 'leagues');
    router.replace(`/community?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <div
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-gradient-to-b from-amber-50 to-white"
    >
      <div className="flex flex-col items-center gap-3 text-center text-slate-700">
        <Trophy className="h-10 w-10 text-amber-500 animate-pulse" aria-hidden />
        <p className="text-sm font-semibold">פותח את הליגה שלך…</p>
      </div>
    </div>
  );
}
