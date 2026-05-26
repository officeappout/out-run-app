'use client';

/**
 * Full-screen branded splash. Shown by the landing page (`/`) while
 * Firebase restores the auth session for returning users.
 *
 * Design: solid #02040D canvas, centred spinning ring that exactly
 * replicates the conic-gradient donut from the logo's "O" glyph
 * (#00B9F7 → #0CF2E2), and a small muted caption. Zero external
 * animation libraries — the spin runs via a single CSS keyframe so
 * this component is safe in any SSR/Suspense context.
 */
export default function BrandedSplashScreen() {
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-white"
      aria-busy="true"
      aria-label="טוען"
    >
      {/*
       * Spinning donut ring — replicates the logo's "O" glyph.
       *
       * Shape:  conic-gradient arc (open at ~10 % so it reads as a
       *         spinner rather than a solid ring) masked into a donut
       *         via radial-gradient mask (inner cutout ≈ 56 % radius,
       *         matching the logo's 15 / 30 inner-to-outer ratio).
       *
       * Colors: identical to the Figma angular gradient on the "O":
       *         start #00B9F7 (cyan-blue) → end #0CF2E2 (turquoise).
       *
       * Motion: hardware-accelerated CSS transform rotate, 1.2 s per
       *         revolution, no JS animation loop needed.
       */}
      <div
        className="animate-spin"
        style={{
          width: 68,
          height: 68,
          borderRadius: '50%',
          background:
            'conic-gradient(from 0deg, #00B9F7 0%, #0CF2E2 78%, transparent 88%, transparent 100%)',
          mask: 'radial-gradient(farthest-side, transparent 55%, #000 57%)',
          WebkitMask:
            'radial-gradient(farthest-side, transparent 55%, #000 57%)',
          animationDuration: '1.2s',
          animationTimingFunction: 'linear',
        }}
      />

      <p
        className="text-black/30 text-[11px] font-medium tracking-[0.20em] uppercase"
        style={{ fontFamily: 'var(--font-simpler)' }}
      >
        טוען
      </p>
    </div>
  );
}
