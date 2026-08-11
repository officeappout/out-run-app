'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { LazyMotion, domAnimation } from 'framer-motion';
import BottomNavigation from "@/features/navigation/BottomNavbar";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { useSessionStore } from "@/features/workout-engine/core/store/useSessionStore";
import GlobalDetailOverlay from "@/features/parks/core/components/GlobalDetailOverlay";
import GlobalGPSTracker from "@/features/parks/core/components/GlobalGPSTracker";
import ChatInbox from "@/features/social/components/ChatInbox";
import { useChatStore } from "@/features/social/store/useChatStore";
import ActivityPanel from "@/features/social/components/ActivityPanel";
import { useActivityPanelStore } from "@/features/social/store/useActivityPanelStore";
import { ToastProvider } from "@/components/ui/Toast";
import OfflineBanner from "@/components/ui/OfflineBanner";
import GlobalErrorOverlay from "@/components/system/GlobalErrorOverlay";
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
            }}
          >
            {children}
          </main>

          {shouldShowBottomNav && <BottomNavigation />}
          <GlobalDetailOverlay />
          <GlobalGPSTracker />
          <ChatInbox
            isOpen={chatIsOpen}
            onClose={chatClose}
            initialThread={chatActiveThread}
          />
          <ActivityPanel isOpen={activityPanelOpen} onClose={activityPanelClose} />
          <OfflineBanner />
          <GlobalErrorOverlay />
          <MidnightClock />
        </LazyMotion>
      </ToastProvider>
    </LanguageProvider>
  );
}
