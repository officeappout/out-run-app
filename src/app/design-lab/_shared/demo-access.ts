/**
 * Design lab gate — prototype screens built on fixtures (no Firebase reads,
 * no auth). Open in `next dev` and on Vercel preview deployments; 404 in
 * production.
 */
export function isDesignLabEnabled(): boolean {
  if (process.env.NODE_ENV === 'development') return true;
  return process.env.VERCEL_ENV === 'preview';
}
