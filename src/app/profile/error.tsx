'use client';

import RouteErrorFallback from '@/components/system/RouteErrorFallback';

/** Route boundary — a crash here no longer replaces the whole app (bottom nav stays). */
export default function ProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorFallback error={error} reset={reset} boundary="route.profile" />;
}
