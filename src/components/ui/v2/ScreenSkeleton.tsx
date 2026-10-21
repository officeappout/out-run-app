'use client';

/**
 * ScreenSkeleton — the neutral, v2-style placeholder a screen shows while its
 * feature flags are still unknown (useFeatureFlags().ready === false: the server
 * render, the hydration render, a first-ever launch before Firestore answers).
 * Shown INSTEAD of guessing a design, so a screen never paints v1 and then swaps
 * to v2 (owner bug 21.10.2026). No text, no data, no handlers — just quiet shapes
 * on the v2 surface.
 *
 * Props:
 *   variant  'page'  (default) full-height screen: header bar + a hero card + rows
 *            'inline' just the card stack, for a slot inside an already-drawn screen
 *   cards    how many row placeholders under the hero (default 3)
 */
export interface ScreenSkeletonProps {
  variant?: 'page' | 'inline';
  cards?: number;
}

const BLOCK = 'animate-pulse rounded-v2-card bg-white shadow-v2-ring';

export default function ScreenSkeleton({ variant = 'page', cards = 3 }: ScreenSkeletonProps) {
  const stack = (
    <div className="space-y-3" aria-hidden>
      <div className={`${BLOCK} h-44`} />
      {Array.from({ length: Math.max(0, cards) }, (_, i) => (
        <div key={i} className={`${BLOCK} h-20`} />
      ))}
    </div>
  );
  if (variant === 'inline') return stack;
  return (
    <div className="min-h-[100dvh] bg-v2-surface" role="status" aria-busy="true" aria-label="טוען">
      <div className="h-[calc(env(safe-area-inset-top)+56px)]" />
      <div className="mx-auto max-w-md space-y-4 px-4">
        <div className="flex items-center justify-between" aria-hidden>
          <div className="h-10 w-10 animate-pulse rounded-full bg-white shadow-v2-ring" />
          <div className="h-5 w-28 animate-pulse rounded-full bg-white shadow-v2-ring" />
          <div className="h-10 w-10 animate-pulse rounded-full bg-white shadow-v2-ring" />
        </div>
        {stack}
      </div>
    </div>
  );
}
