'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import BottomNavigation from "@/features/navigation/BottomNavbar";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { useSessionStore } from "@/features/workout-engine/core/store/useSessionStore";
import GlobalDetailOverlay from "@/features/parks/core/components/GlobalDetailOverlay";
import { ToastProvider } from "@/components/ui/Toast";
import OfflineBanner from "@/components/ui/OfflineBanner";
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

// Routes where BottomNavigation should be completely hidden
// '/profile' intentionally removed — the profile page's tabs sit at the top
// of the screen, so the global BottomNavbar can coexist at the bottom.
const HIDDEN_NAV_ROUTES = ['/explorer', '/library', '/onboarding-new', '/gateway'];

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const { status } = useSessionStore();
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <main className="h-[100dvh] overflow-y-auto overflow-x-hidden">
        {children}
      </main>
    );
  }

  // Hide bottom navigation:
  // 1. During workout summary (status === 'finished')
  // 2. On guest/onboarding routes where nav is not relevant
  const isHiddenRoute = HIDDEN_NAV_ROUTES.some(route => pathname.startsWith(route));
  const isLandingPage = pathname === '/';
  const shouldShowBottomNav = status !== 'finished' && !isHiddenRoute && !isLandingPage;

  const isMapRoute = pathname.startsWith('/map');

  return (
    <LanguageProvider>
      <ToastProvider>
        <main
          className="h-[100dvh] overflow-y-auto overflow-x-hidden overscroll-y-contain"
          style={{
            paddingBottom:
              shouldShowBottomNav && !isMapRoute
                ? 'calc(3.25rem + env(safe-area-inset-bottom, 0px))'
                : undefined,
          }}
        >
          {children}
        </main>

        {shouldShowBottomNav && <BottomNavigation />}
        <GlobalDetailOverlay />
        <OfflineBanner />
        <MidnightClock />
      </ToastProvider>
    </LanguageProvider>
  );
}
