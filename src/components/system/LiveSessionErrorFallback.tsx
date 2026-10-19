'use client';

import { useRouter } from 'next/navigation';
import { Dumbbell, Footprints, Home, Map as MapIcon, Play } from 'lucide-react';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import RouteErrorFallback from './RouteErrorFallback';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
  boundary: string;
  /**
   * `strength` (default): secondary = leave to /home and clear the strength
   * session (what the page's own exit does to the store).
   * `run`: secondary = back to /map WITHOUT clearing — the map shell owns a
   * running session and its own stop/save flow, so nothing is discarded.
   */
  kind?: 'strength' | 'run';
}

/**
 * Route boundary for a LIVE workout (strength player, run dashboard).
 *
 * Why "המשך אימון" is a plain `reset()`: the session lives in Zustand stores
 * (useSessionStore, useRunningPlayer) that are module-level and NOT wiped by
 * an error boundary — the route segment re-mounts and re-attaches to them
 * (active/page.tsx reclaims an active 'strength' session instead of starting
 * a new one; the plan reloads from sessionStorage 'active_workout_data').
 * Neither store uses zustand `persist`, so this survives a boundary reset,
 * not a full page reload — which is exactly why we no longer fall through to
 * global-error (that path replaced the document).
 *
 * Strength "יציאה לדף הבית" abandons the session the same way the page's own
 * exit does for the store (clearSession), so the next workout doesn't inherit
 * its clock. A run is never cleared here (see `kind`).
 */
export default function LiveSessionErrorFallback({ error, reset, boundary, kind = 'strength' }: Props) {
  const router = useRouter();
  const isRun = kind === 'run';
  return (
    <RouteErrorFallback
      error={error}
      reset={reset}
      boundary={boundary}
      icon={isRun ? Footprints : Dumbbell}
      title="משהו השתבש באימון"
      description="זמן האימון שלך נשמר. אפשר לחזור לאימון ולהמשיך."
      retryLabel="המשך אימון"
      retryIcon={Play}
      secondaryAction={isRun ? {
        label: 'חזרה למפה',
        icon: MapIcon,
        onClick: () => router.replace('/map'),
      } : {
        label: 'יציאה לדף הבית',
        icon: Home,
        onClick: () => {
          try {
            useSessionStore.getState().clearSession();
          } catch {
            /* store unavailable — navigating is still the right call */
          }
          router.replace('/home');
        },
      }}
    />
  );
}
