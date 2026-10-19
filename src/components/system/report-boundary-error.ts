import * as Sentry from '@sentry/nextjs';

/**
 * Reports an error caught by one of our React error boundaries to Sentry —
 * the same `captureException` call src/app/global-error.tsx makes, plus a
 * `boundary` tag so a broken widget is distinguishable from a broken screen.
 * PII scrubbing stays in the shared beforeSend (src/lib/sentry-shared.ts).
 * Never throws: reporting must not turn a contained failure into a crash.
 */
export function reportBoundaryError(
  error: unknown,
  boundary: string,
  componentStack?: string | null,
): void {
  try {
    Sentry.captureException(error, {
      tags: { boundary },
      ...(componentStack ? { contexts: { react: { componentStack } } } : {}),
    });
  } catch {
    /* Sentry unavailable — the console line below is the fallback */
  }
  console.error(`[boundary:${boundary}]`, error);
}
