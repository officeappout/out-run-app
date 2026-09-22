/**
 * requestIp.ts — the one IP-extraction pattern already used ad-hoc in
 * check-email/route.ts, verify-token/route.ts, join/preview/route.ts, and
 * link-click-handler.ts (`x-forwarded-for`, first hop, trimmed, 'unknown'
 * fallback). Centralized here for the 22.09.2026 rate-limiting rollout so
 * every newly-gated route shares the exact same extraction logic.
 */
import type { NextRequest } from 'next/server';

export function getRequestIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return (forwarded ? forwarded.split(',')[0] : null)?.trim() || 'unknown';
}
