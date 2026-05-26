'use client';

/* eslint-disable @next/next/no-img-element */

interface AppLogoLoaderProps {
  /** Optional helper text rendered below the logo. */
  caption?: string;
  /**
   * Tailwind classes for the outer wrapper — controls background, sizing,
   * and positioning. Defaults to a full-screen light gradient that suits
   * auth-gate and Suspense-boundary contexts.
   */
  className?: string;
}

/**
 * Branded loading placeholder for Suspense boundaries, auth-check gates,
 * and route-level loading states.
 *
 * Uses the official OUT wordmark with the same gentle pulse-breathe cycle
 * as BrandedSplashScreen and MapLoadingSkeleton, so cold-start → auth-check
 * → page-ready feels like one continuous visual language.
 *
 * Intentionally ships without framer-motion so it remains safe inside any
 * SSR Suspense fallback or synchronous render path.
 */
export default function AppLogoLoader({
  caption,
  className = 'min-h-screen bg-gradient-to-br from-gray-50 to-gray-100',
}: AppLogoLoaderProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-4 animate-in fade-in duration-300 ${className}`}
      aria-busy="true"
      aria-label={caption ?? 'טוען...'}
    >
      <div className="relative flex items-center justify-center">
        {/* Soft cyan halo — mirrors BrandedSplashScreen / MapLoadingSkeleton */}
        <div
          className="absolute inset-0 -m-6 rounded-full blur-2xl animate-pulse"
          style={{
            background: 'radial-gradient(circle, rgba(0,229,255,0.28) 0%, transparent 70%)',
            animationDuration: '2s',
          }}
        />
        <img
          src="/assets/logo/Kind=logotype.svg"
          alt="OUT"
          className="relative h-10 brightness-0 opacity-75 animate-pulse"
          style={{ animationDuration: '2s' }}
        />
      </div>

      {caption && (
        <p className="text-sm text-gray-500 font-medium animate-pulse" style={{ animationDuration: '2s' }}>
          {caption}
        </p>
      )}
    </div>
  );
}
