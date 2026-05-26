'use client';

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AppLogoLoader from '@/components/AppLogoLoader';

/**
 * Legacy authority-login page - redirects to appropriate portal
 * This page is kept for backward compatibility
 *
 * If there's an invitation token, redirect to authority portal (maintains old behavior)
 * Otherwise, redirect to authority portal by default
 */
function AuthorityLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams?.get('token');
    const authority = searchParams?.get('authority');
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    if (authority) params.set('authority', authority);
    const qs = params.toString();
    router.replace(`/authority-portal/login${qs ? `?${qs}` : ''}`);
  }, [router, searchParams]);

  return <AppLogoLoader caption="מעביר לפורטל ההתחברות..." />;
}

export default function AuthorityLoginPage() {
  return (
    <Suspense fallback={<AppLogoLoader />}>
      <AuthorityLoginContent />
    </Suspense>
  );
}
