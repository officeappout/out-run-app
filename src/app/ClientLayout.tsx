'use client';

import { useState, useEffect } from 'react';
import BottomNavigation from "@/features/navigation/BottomNavbar";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { useSessionStore } from "@/features/workout-engine/core/store/useSessionStore";

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const { status } = useSessionStore();

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

  // Hide bottom navigation when workout is finished (summary screen is showing)
  const shouldShowBottomNav = status !== 'finished';

  return (
    <LanguageProvider>
      <main>
        {children}
      </main>
      
      {shouldShowBottomNav && <BottomNavigation />}
    </LanguageProvider>
  );
}
