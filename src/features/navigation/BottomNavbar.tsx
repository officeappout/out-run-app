"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Home, Map, Users, TrendingUp, User } from 'lucide-react';
import { useSessionStore } from '@/features/workout-engine';
import { useUserStore } from '@/features/user';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import { V2_NAV_BOTTOM_CSS } from '@/components/ui/v2/bottom-chrome';

export default function BottomNavigation() {
  const pathname = usePathname();
  const { status } = useSessionStore();
  const profile = useUserStore((s) => s.profile);
  const isSuperAdmin = !!(profile?.core as any)?.isSuperAdmin;
  const { flags, loading: flagsLoading } = useFeatureFlags(isSuperAdmin);

  // Map sub-states (PlannedPreview / Navigate / Builder layers) request the
  // navbar slide out via `useSuppressBottomNav()`. We read the counter as
  // a derived boolean so the bar is hidden whenever ANY suppressor is up.
  const isSuppressed = useMapStore((s) => s.bottomNavSuppressionCount > 0);

  // On the map screen the tab bar floats directly over the Mapbox streets.
  // A short white fade above the bar softens that transition (readability +
  // polish). Scoped to /map only — other routes already sit on a white body.
  const isMapRoute = !!pathname?.startsWith('/map');

  if (
    pathname?.startsWith('/onboarding') ||
    pathname?.startsWith('/login') ||
    pathname?.startsWith('/run') ||
    pathname?.startsWith('/auth') ||
    pathname?.startsWith('/admin') ||
    pathname?.includes('/active')
  ) {
    return null;
  }

  if (status === 'active' || status === 'paused') {
    return null;
  }

  // Unknown flags (a device that has never seen them — first launch / cleared
  // storage): no bar for that moment rather than the classic bar that then
  // swaps to the v2 one. With the flags cached this is false on first paint.
  if (flagsLoading) {
    return null;
  }

  // The social hub (/community) merges feed and leagues into one tab. Surface
  // the entry when EITHER surface is enabled — leagues can ship independently
  // of the social feed, so we must not hide the only entry point to /community
  // when only leagues is on.
  const navItems = [
    { name: 'בית',       href: '/home',        icon: Home,       match: 'prefix' as const },
    { name: 'מפה',       href: '/map',          icon: Map,        match: 'prefix' as const },
    { name: 'התקדמות',   href: '/progression',  icon: TrendingUp, match: 'prefix' as const },
    ...(flags.enableCommunityFeed || flags.enableLeagues
      ? [
          { name: 'חברתי', href: '/community', icon: Users, match: 'community-feed' as const },
        ]
      : []),
  ];

  if (flags.enableHomeV2) {
    return (
      <BottomNavV2
        pathname={pathname ?? ''}
        isSuppressed={isSuppressed}
        showSocial={flags.enableCommunityFeed || flags.enableLeagues}
      />
    );
  }

  return (
    <motion.nav
      // y:'100%' slides the entire bar (incl. its safe-area padding) below
      // the viewport so the map's own bottom-anchored CTA cards have the
      // full width of the bottom safe-area to themselves. ~250ms tween,
      // standard material easing — fast enough to feel native, slow enough
      // not to startle the user.
      initial={false}
      animate={{ y: isSuppressed ? '100%' : '0%' }}
      transition={{ type: 'tween', duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      // pointer-events:none while hidden so users can't accidentally tap
      // through to a hidden tab from the layer card sitting above.
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        pointerEvents: isSuppressed ? 'none' : 'auto',
        willChange: 'transform',
      }}
      aria-hidden={isSuppressed}
      className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-t border-gray-200/60 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]"
    >
      {/* Map-only white fade sitting *above* the bar (bottom-full) so it feathers
          the map→tab-bar edge. Reuses the app's canonical bottom-fade string
          (page.tsx splash / workout overview). pointer-events-none is critical:
          the FAB (+) and recenter button live ~300px up but the map itself sits
          directly under this strip — without it, taps here would be swallowed.
          As a child of the sliding nav it rides the suppression animation for
          free, so it never lingers after a map card pushes the tabs out. */}
      {isMapRoute && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-full h-16 bg-gradient-to-t from-white/80 via-white/20 to-transparent"
        />
      )}
      {/* Tightened from pt-2 → pt-0.5 so the bar sits ~6px shorter on iPhone
          (≈80px total vs the previous 86px) — closer to the native iOS
          tab-bar height (≈83px including its own safe-area inset) without
          shrinking the 44×44 hit target Apple HIG requires. */}
      <div className="flex justify-around items-center px-4 pt-0.5 pb-0">
        {navItems.map((item) => {
          const Icon = item.icon;
          const onCommunity = pathname === '/community' || pathname?.startsWith('/community/');

          let isActive = false;
          if (item.match === 'community-feed') {
            // Highlight "חברתי" on /community and all /community/* subpages
            isActive = onCommunity;
          } else {
            isActive = pathname === item.href || pathname?.startsWith(item.href + '/') || false;
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              tabIndex={isSuppressed ? -1 : 0}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] min-w-[44px] px-3 rounded-xl transition-all ${
                isActive ? 'text-[#007EA8]' : 'text-gray-900'
              }`}
            >
              <Icon size={26} strokeWidth={isActive ? 2.5 : 2} />
              <span className={`text-[10px] leading-none ${isActive ? 'font-bold' : 'font-medium'}`}>
                {item.name}
              </span>
            </Link>
          );
        })}
      </div>
    </motion.nav>
  );
}

// ============================================================================
// v2 — the floating glass bar with the map as a raised circle in the middle
// (design lab "map" variant, approved 17.10.2026). Behind enable_home_v2.
// Two halves of equal width keep the circle centred whether or not the
// social tab is on; profile joins the bar so the halves stay balanced.
// ============================================================================

type V2Item = { name: string; href: string; icon: typeof Home; active: boolean };

function BottomNavV2({
  pathname,
  isSuppressed,
  showSocial,
}: {
  pathname: string;
  isSuppressed: boolean;
  showSocial: boolean;
}) {
  const on = (href: string) => pathname === href || pathname.startsWith(href + '/');
  const left: V2Item[] = [
    { name: 'בית', href: '/home', icon: Home, active: on('/home') },
    { name: 'התקדמות', href: '/progression', icon: TrendingUp, active: on('/progression') },
  ];
  const right: V2Item[] = [
    ...(showSocial ? [{ name: 'חברתי', href: '/community', icon: Users, active: on('/community') }] : []),
    { name: 'פרופיל', href: '/profile', icon: User, active: on('/profile') },
  ];
  const mapActive = on('/map');
  const tab = (item: V2Item) => {
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        tabIndex={isSuppressed ? -1 : 0}
        aria-current={item.active ? 'page' : undefined}
        className={`flex min-h-[44px] min-w-[56px] flex-col items-center justify-center gap-0.5 whitespace-nowrap text-[11px] font-extrabold transition-transform duration-150 ease-v2 active:scale-[0.96] ${
          item.active ? 'text-v2-deep' : 'text-v2-muted'
        }`}
      >
        <Icon size={21} strokeWidth={item.active ? 2.6 : 2.2} aria-hidden />
        {item.name}
      </Link>
    );
  };

  return (
    <motion.nav
      aria-label="ניווט ראשי"
      initial={false}
      animate={{ y: isSuppressed ? '140%' : '0%' }}
      transition={{ type: 'tween', duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      // bottom: the same rule bottom-chrome.ts uses for the FAB / scroll padding above it.
      style={{ bottom: V2_NAV_BOTTOM_CSS, pointerEvents: isSuppressed ? 'none' : 'auto', willChange: 'transform' }}
      aria-hidden={isSuppressed}
      className="v2-glass-bar fixed inset-x-4 z-50 flex h-[58px] items-center rounded-full px-2 shadow-v2-float"
    >
      <div className="relative flex flex-1 justify-around">{left.map(tab)}</div>
      <Link
        href="/map"
        tabIndex={isSuppressed ? -1 : 0}
        aria-label="מפה"
        aria-current={mapActive ? 'page' : undefined}
        className={`relative -mt-9 grid h-16 w-16 shrink-0 place-items-center rounded-full bg-white shadow-v2-float ring-1 ring-v2-hairline transition-transform duration-150 ease-v2 active:scale-[0.96] ${
          mapActive ? 'text-v2-deep ring-2 ring-v2-accent' : 'text-v2-deep'
        }`}
      >
        <Map size={28} strokeWidth={2.4} aria-hidden />
      </Link>
      <div className="relative flex flex-1 justify-around">{right.map(tab)}</div>
    </motion.nav>
  );
}
