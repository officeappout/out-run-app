'use client';

import LiveSessionErrorFallback from '@/components/system/LiveSessionErrorFallback';

/**
 * Route boundary for a live workout — keeps the in-memory session and offers
 * "המשך אימון" (see LiveSessionErrorFallback for what is / isn't preserved).
 */
export default function ActiveWorkoutError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <LiveSessionErrorFallback error={error} reset={reset} boundary="route.workout-active" />;
}
