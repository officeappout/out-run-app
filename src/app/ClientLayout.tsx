'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { LazyMotion, domAnimation } from 'framer-motion';
import BottomNavigation from "@/features/navigation/BottomNavbar";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { useSessionStore } from "@/features/workout-engine/core/store/useSessionStore";
import GlobalDetailOverlay from "@/features/parks/core/components/GlobalDetailOverlay";
import ChatInbox from "@/features/social/components/ChatInbox";
import { useChatStore } from "@/features/social/store/useChatStore";
import ActivityPanel from "@/features/social/components/ActivityPanel";
import { useActivityPanelStore } from "@/features/social/store/useActivityPanelStore";
import { ToastProvider } from "@/components/ui/Toast";
import OfflineBanner from "@/components/ui/OfflineBanner";
import GlobalErrorOverlay from "@/components/system/GlobalErrorOverlay";
import OnboardingSyncErrorToast from "@/components/system/OnboardingSyncErrorToast";
import { useMidnightRefresh } from "@/features/activity";

/**
 * Mounts the global midnight clock once. Bumps the dateKey atom at 00:00
 * (and on tab-foreground) so every consumer of `useDayStatus` re-evaluates
 * exactly at the day boundary — protecting the streak from open-overnight
 * sessions and breaking the "Today is yesterday" failure mode.
 */
function MidnightClock() {
  useMidnightRefresh();
  return null;
}

// Routes where BottomNavigation should be completely hidden.
// '/profile' intentionally removed — the profile page's tabs sit at the top
// of the screen, so the global BottomNavbar can coexist at the bottom.
// '/privacy' and '/terms' are standalone public compliance pages that must
// render as clean web documents without any mobile app chrome.
const HIDDEN_NAV_ROUTES = ['/explorer', '/library', '/onboarding-new', '/gateway', '/privacy', '/terms', '/public', '/join', '/challenge', '/booth'];

// THE RULE: a route belongs on this list if some element of its own screen
// (a header bar, a hero image) is deliberately edge-to-edge — its own
// background/photo already reaches the TRUE top of the screen, with only
// its inner content/controls pushed down via that element's own
// env(safe-area-inset-top) padding. <main>'s global top padding (below)
// must NOT also apply to such a route — it would push the whole
// header/image down, leaving an empty gap above it that never reaches the
// true edge, which looks worse than having no padding at all. A route
// belongs here because of what ITS OWN top-most visual element does, not
// because of anything about the route's purpose or nesting.
//
//   /arena/create, /onboarding-new/profile, /progress, /debug/health-sync
//     — exact routes, no nested pages underneath.
//   /community/[id] — every community detail page; bare /community (the
//     list/tabs page) is unaffected and does NOT need the exemption.
//   /profile/[userId] — every user-profile page EXCEPT /profile/exercise/*,
//     which is a different, unrelated route nested under /profile/.
//   /workouts/[id]/overview — full-bleed hero photo, not a header bar; the
//     other 3 routes nested under /workouts/[id]/ (bare, /history, /active)
//     are NOT edge-to-edge and must stay off this list.
const TOP_PADDING_EXEMPT_EXACT_ROUTES = ['/arena/create', '/onboarding-new/profile', '/progress', '/debug/health-sync'];
function isTopPaddingExemptRoute(pathname: string): boolean {
  if (TOP_PADDING_EXEMPT_EXACT_ROUTES.includes(pathname)) return true;
  if (pathname.startsWith('/community/')) return true;
  if (pathname.startsWith('/profile/') && !pathname.startsWith('/profile/exercise/')) return true;
  if (pathname.startsWith('/workouts/') && pathname.endsWith('/overview')) return true;
  return false;
}

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const { status } = useSessionStore();
  const pathname = usePathname();

  // Global chat sheet — driven by useChatStore from anywhere in the app
  // (e.g. UserProfileSheet "שלח הודעה" → openDM, /feed → open).
  // This is the single mount; the legacy local mount on /feed has been
  // removed so we never end up with two ChatInbox overlays at z-[70].
  const chatIsOpen = useChatStore((s) => s.isOpen);
  const chatActiveThread = useChatStore((s) => s.activeThread);
  const chatClose = useChatStore((s) => s.close);

  // Global activity (notifications) panel — opened from AppHeader's bell icon.
  const activityPanelOpen = useActivityPanelStore((s) => s.isOpen);
  const activityPanelClose = useActivityPanelStore((s) => s.close);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Route-dependent logic is gated by `mounted` to avoid SSR/client pathname
  // mismatch, but the provider tree renders on BOTH the first (pre-mount)
  // paint and all subsequent renders — eliminating the hydration flicker
  // that occurred when LanguageProvider / ToastProvider were absent until
  // useEffect fired.
  const isHiddenRoute = mounted && HIDDEN_NAV_ROUTES.some(route => pathname.startsWith(route));
  const isLandingPage = mounted && pathname === '/';
  const shouldShowBottomNav = mounted && status !== 'finished' && !isHiddenRoute && !isLandingPage;
  const isMapRoute = mounted && pathname.startsWith('/map');
  const isTopPaddingExempt = mounted && isTopPaddingExemptRoute(pathname);

  return (
    <LanguageProvider>
      <ToastProvider>
        {/* LazyMotion loads only the domAnimation feature subset (~15 kB less
            than the full bundle). Files that already use motion.* continue to
            work unchanged; new code using m.* will benefit from tree-shaking. */}
        <LazyMotion features={domAnimation}>
          <main
            className="h-[100dvh] overflow-y-auto overflow-x-hidden overscroll-none"
            style={{
              // Matches BottomNavbar's actual height: pt-0.5 (2px) +
              // min-h-[44px] = 46px, rounded up to 3rem (48px) for breathing
              // room. Plus the device's bottom safe-area inset. Map route
              // intentionally lets the BottomNavbar float over the canvas.
              // On all non-map routes (even hidden-nav ones like onboarding)
              // we always reserve at least env(safe-area-inset-bottom) so the
              // home indicator strip never shows the white body background.
              paddingBottom: isMapRoute
                ? undefined
                : shouldShowBottomNav
                  ? 'calc(3rem + env(safe-area-inset-bottom, 0px))'
                  : 'env(safe-area-inset-bottom, 0px)',
              // Same reasoning as paddingBottom above, mirrored for the top
              // inset — no screen had a global guarantee against rendering
              // under the status bar/notch; each had to remember its own
              // env(safe-area-inset-top) padding, and some didn't. Map route
              // keeps the same exception as bottom — map layers manage their
              // own top chrome (search bar, mode pills) over the full-bleed
              // canvas.
              //
              // isTopPaddingExempt covers the OTHER kind of exception: a
              // handful of screens whose own header is deliberately
              // edge-to-edge — its background reaches the true top of the
              // screen, and ONLY its inner content is pushed down via the
              // header's own env(safe-area-inset-top) padding. Giving those
              // routes this padding too would push the whole header down,
              // leaving an empty gap above it that never reaches the true
              // edge — see isTopPaddingExemptRoute() below for the exact
              // list and why each one is there.
              paddingTop: isMapRoute || isTopPaddingExempt ? undefined : 'env(safe-area-inset-top, 0px)',
            }}
          >
            {children}
          </main>

          {shouldShowBottomNav && <BottomNavigation />}
          <GlobalDetailOverlay />
          <ChatInbox
            isOpen={chatIsOpen}
            onClose={chatClose}
            initialThread={chatActiveThread}
          />
          <ActivityPanel isOpen={activityPanelOpen} onClose={activityPanelClose} />
          <OfflineBanner />
          <GlobalErrorOverlay />
          <MidnightClock />
          <OnboardingSyncErrorToast />
        </LazyMotion>
      </ToastProvider>
    </LanguageProvider>
  );
}
