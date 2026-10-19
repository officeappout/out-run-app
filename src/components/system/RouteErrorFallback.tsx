'use client';

import { useEffect, type ComponentType } from 'react';
import type { LucideProps } from 'lucide-react';
import { RefreshCw } from 'lucide-react';
import ErrorState, { type ErrorStateAction } from '@/components/ui/v2/ErrorState';
import { isChunkLoadError } from '@/lib/sentry-shared';
import { clearChunkReloadFlag, reloadOnceForChunkError } from '@/lib/chunk-reload';
import { reportBoundaryError } from './report-boundary-error';

export interface RouteErrorFallbackProps {
  error: Error & { digest?: string };
  /** Next.js segment reset — re-renders the route segment from scratch. */
  reset: () => void;
  /** Sentry `boundary` tag, e.g. "route.home". */
  boundary: string;
  title?: string;
  description?: string;
  icon?: ComponentType<LucideProps>;
  /** Label of the retry CTA (calls `reset`). Default "נסו שוב". */
  retryLabel?: string;
  retryIcon?: ComponentType<LucideProps>;
  /** Optional white pill under the CTA. */
  secondaryAction?: ErrorStateAction;
}

/**
 * Shared body of the route-level `error.tsx` boundaries. Because it renders
 * inside the root layout (ClientLayout), the bottom nav, chat, toasts and any
 * in-memory session (Zustand stores) stay alive — only the broken segment is
 * replaced. Mirrors src/app/global-error.tsx: report to Sentry, and for a
 * deploy-rollover ChunkLoadError do one hard reload instead of a retry.
 */
export default function RouteErrorFallback({
  error,
  reset,
  boundary,
  title = 'משהו השתבש',
  description = 'זה קורה לפעמים. אפשר לנסות שוב — שום דבר לא נמחק.',
  icon,
  retryLabel = 'נסו שוב',
  retryIcon = RefreshCw,
  secondaryAction,
}: RouteErrorFallbackProps) {
  useEffect(() => {
    reportBoundaryError(error, boundary);
    reloadOnceForChunkError(error);
  }, [error, boundary]);

  if (isChunkLoadError(error)) {
    return (
      <ErrorState
        title="יש גרסה חדשה"
        description="גרסה חדשה של האפליקציה זמינה. רעננו כדי להמשיך."
        primaryAction={{
          label: 'רענן עמוד',
          icon: RefreshCw,
          onClick: () => {
            clearChunkReloadFlag();
            window.location.reload();
          },
        }}
      />
    );
  }

  return (
    <ErrorState
      title={title}
      description={description}
      icon={icon}
      primaryAction={{
        label: retryLabel,
        icon: retryIcon,
        onClick: () => {
          clearChunkReloadFlag();
          reset();
        },
      }}
      secondaryAction={secondaryAction}
    />
  );
}
