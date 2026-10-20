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
import HealthDeclarationSelfHeal from "@/features/user/onboarding/components/HealthDeclarationSelfHeal";
import OnboardingSessionReset from "@/features/user/onboarding/components/OnboardingSessionReset";
import EdgeSwipeBack from "@/components/system/EdgeSwipeBack";
import { isTopPaddingExemptRoute } from "@/lib/top-padding-exempt-routes";

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
// '/privacy', '/terms' and '/accessibility' are standalone public compliance pages that must
// render as clean web documents without any mobile app chrome.
const HIDDEN_NAV_ROUTES = ['/explorer', '/intro', '/library', '/onboarding-new', '/gateway', '/privacy', '/terms', '/accessibility', '/public', '/join', '/challenge', '/booth'];

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
          {/* Accessibility entry points — visually hidden until a keyboard / switch /
              screen-reader user focuses them (WCAG 2.4.1 bypass blocks). Reachable
              from every page without adding a global footer over the map / player. */}
          <div className="sr-only focus-within:not-sr-only focus-within:fixed focus-within:top-2 focus-within:inset-x-2 focus-within:z-[200] focus-within:flex focus-within:flex-wrap focus-within:gap-2 focus-within:justify-center" dir="rtl">
            <a
              href="#main-content"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              דלג לתוכן הראשי
            </a>
            <a
              href="/accessibility"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              הצהרת נגישות
            </a>
          </div>
          <main
            id="main-content"
            tabIndex={-1}
            className="h-[100dvh] overflow-y-auto overflow-x-hidden overscroll-none focus:outline-none"
            style={{
              // Matches BottomNavbar's actual height: pt-0.5 (2px) +
              // min-h-[44px] = 46px, rounded up to 3rem (48px) for breathing
              // room. Plus the device's bottom safe-area inset. Map route
              // intentionally lets the BottomNavbar float over the canvas.
              // On all non-map routes (even hidden-nav ones like onboarding)
              // we always reserve at least env(safe-area-inset-bottom) so the
              // home indicator strip never shows the white body background.
              //
              // Keyboard: max(…, var(--kb-inset)) — while the on-screen
              // keyboard is open the padding grows to its height (animated,
              // see globals.css), so `h-full` pages end at the keyboard
              // (pinned Continue buttons stay visible) and long pages can
              // scroll their last field clear of it. Map route excluded so the
              // map canvas never resizes under the fixed search overlays.
              paddingBottom: isMapRoute
                ? undefined
                : shouldShowBottomNav
                  ? 'max(calc(3rem + env(safe-area-inset-bottom, 0px)), var(--kb-inset, 0px))'
                  : 'max(env(safe-area-inset-bottom, 0px), var(--kb-inset, 0px))',
              scrollPaddingBottom: isMapRoute ? undefined : 'var(--kb-inset, 0px)',
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
          {/* iOS app only, behind enable_home_v2: right-edge swipe = back (renders nothing). */}
          <EdgeSwipeBack />
          {/* Regenerates a signed health-declaration PDF that never reached Storage — once per
              session, in the background (renders nothing). */}
          <HealthDeclarationSelfHeal />
          {/* Sign-out / account switch → wipe the previous account's onboarding state (renders nothing). */}
          <OnboardingSessionReset />
          <OnboardingSyncErrorToast />
        </LazyMotion>
      </ToastProvider>
    </LanguageProvider>
  );
}
