'use client';

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

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
    // Check if there's an invitation token (maintain backward compatibility)
    const token = searchParams?.get('token');
    const authority = searchParams?.get('authority');
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    if (authority) params.set('authority', authority);
    const qs = params.toString();
    router.replace(`/authority-portal/login${qs ? `?${qs}` : ''}`);
  }, [router, searchParams]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-12 h-12 text-cyan-600 animate-spin mx-auto mb-4" />
        <p className="text-gray-600">מעביר לפורטל ההתחברות...</p>
      </div>
    </div>
  );
}

export default function AuthorityLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-cyan-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">טוען...</p>
        </div>
      </div>
    }>
      <AuthorityLoginContent />
    </Suspense>
  );
}
