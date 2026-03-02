'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import BottomNavigation from "@/features/navigation/BottomNavbar";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { useSessionStore } from "@/features/workout-engine/core/store/useSessionStore";

// Routes where BottomNavigation should be completely hidden
const HIDDEN_NAV_ROUTES = ['/explorer', '/onboarding-new', '/gateway', '/profile'];

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
      <main>
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
      <main
        className="min-h-[100dvh]"
        style={
          shouldShowBottomNav && !isMapRoute
            ? { paddingBottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px))' }
            : undefined
        }
      >
        {children}
      </main>

      {shouldShowBottomNav && <BottomNavigation />}
    </LanguageProvider>
  );
}
