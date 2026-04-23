"use client";

/**
 * /explorer — Lightweight park discovery for guests (MAP_ONLY users).
 *
 * Uses React.lazy + Suspense instead of next/dynamic to preserve
 * the forwardRef on UnifiedLocationStep (next/dynamic wraps in a
 * non-forwardRef shell, which causes the React ref warning).
 *
 * The component is rendered only on the client (guarded by a mount
 * check) to prevent hydration errors from browser-only APIs.
 */

import React, { Suspense, useState, useEffect, lazy } from 'react';
import { useRouter } from 'next/navigation';

// ── Lazy import preserves forwardRef (unlike next/dynamic) ───────────
const UnifiedLocationStep = lazy(
  () => import('@/features/user/onboarding/components/steps/UnifiedLocationStep')
);

function LoadingPlaceholder() {
  return (
    <div className="fixed inset-0 bg-[#F8FAFC] flex items-center justify-center">
      <div className="text-4xl font-black text-[#5BC2F2] animate-pulse tracking-widest">
        OUT
      </div>
    </div>
  );
}

export default function ExplorerPage() {
  const router = useRouter();

  // Client-only guard — prevents SSR of browser-dependent code
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return <LoadingPlaceholder />;

  return (
    <Suspense fallback={<LoadingPlaceholder />}>
      <UnifiedLocationStep
        mode="explorer"
        onNext={() => {}}
        onExplorerDismiss={() => {
          router.push('/map?fromExplorer=true');
        }}
      />
    </Suspense>
  );
}
