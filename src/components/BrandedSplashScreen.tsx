'use client';

import BrandLoader from '@/components/brand/BrandLoader';

/**
 * Full-screen branded splash. Shown by the landing page (`/`) while Firebase
 * restores the auth session, and held while "הרשמה מהירה" signs the guest in
 * (pilot note AJ1: it used to be a bare white page with a tiny spinner).
 * Now the shared light BrandLoader: the cyan OUT logotype + a thin cyan bar,
 * the same loader the explorer gap and the map entry use (AJ3, AJ4).
 */
export default function BrandedSplashScreen() {
  return <BrandLoader className="z-[100]" />;
}
