'use client';

import { useState, useEffect } from 'react';
import BottomNavigation from "@/features/navigation/BottomNavbar";
import { LanguageProvider } from "@/contexts/LanguageContext";

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

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

  return (
    <LanguageProvider>
      <main>
        {children}
      </main>
      
      <BottomNavigation />
    </LanguageProvider>
  );
}
