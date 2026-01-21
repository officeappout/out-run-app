"use client";

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Redirect page for /onboarding -> /onboarding-new/intro
 * This ensures backward compatibility with any old links
 */
export default function OnboardingRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/onboarding-new/intro');
  }, [router]);

  return (
    <div className="h-screen w-full flex items-center justify-center bg-gradient-to-br from-cyan-50 to-blue-100">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4"></div>
        <p className="text-gray-600 font-medium">מעביר לאיזור האישי...</p>
      </div>
    </div>
  );
}
