/**
 * Access gate for the design-v2 demo routes (/debug/design-v2/*).
 *
 * Enabled in `next dev` and on Vercel *preview* deployments, so design
 * reviews can open the fixture pages from a PR's preview URL. Everything
 * else denies — in particular any Vercel production deployment, even if
 * NODE_ENV somehow reads 'development'. Unknown or missing values deny.
 *
 * Reads the server-side `VERCEL_ENV` (never a NEXT_PUBLIC_* var); call it
 * only from the server `page.tsx`.
 *
 * Every demo page exports `dynamic = 'force-dynamic'` so this runs per
 * request with the deployment's runtime env, instead of being baked into a
 * static page (or a static 404) at build time. That keeps the gate correct
 * even when a build artifact is reused for a different environment (e.g. a
 * preview deployment promoted to production without a rebuild).
 */
export type DemoEnv = { NODE_ENV?: string; VERCEL_ENV?: string };

export function isDesignDemoEnabled(env: DemoEnv = process.env): boolean {
  const vercelEnv = env.VERCEL_ENV ?? '';
  // Production always wins, whatever NODE_ENV says.
  if (vercelEnv === 'production') return false;
  if (vercelEnv === 'preview') return true;
  // Local dev: no VERCEL_ENV at all, or `vercel dev` ('development').
  // Any other (unknown) VERCEL_ENV value denies.
  if (vercelEnv === '' || vercelEnv === 'development') {
    return env.NODE_ENV === 'development';
  }
  return false;
}
