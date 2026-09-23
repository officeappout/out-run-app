/**
 * requestIp.ts — the one IP-extraction helper for every rate-limit check
 * in the 22.09.2026 rollout, and (23.09.2026 code-review fix) for the
 * pre-existing ad-hoc copies this replaced in check-email/route.ts,
 * verify-token/route.ts, join/preview/route.ts, and
 * link-click-handler.ts's recordClickEvent.
 *
 * Header preference, per Vercel's own docs (vercel.com/docs/headers/
 * request-headers, fetched 23.09.2026) — quoted:
 *
 *   x-forwarded-for: "The public IP address of the client that made the
 *   request. If you are trying to use Vercel behind a proxy, we currently
 *   overwrite the X-Forwarded-For header and do not forward external IPs.
 *   This restriction is in place to prevent IP spoofing." (An Enterprise-
 *   only paid add-on, "Trusted Proxy", can re-enable a custom/passthrough
 *   X-Forwarded-For for a proxy layer the customer runs IN FRONT OF
 *   Vercel — not the case for this project.)
 *
 *   x-real-ip: "This header is identical to the x-forwarded-for header."
 *
 *   x-vercel-forwarded-for: "This header is identical to the
 *   x-forwarded-for header. However, x-forwarded-for could be overwritten
 *   if you're using a proxy on top of Vercel." — i.e. this is the one of
 *   the three that stays correct even in that one scenario the docs
 *   explicitly call out as able to disturb x-forwarded-for, so it's
 *   checked first here; x-real-ip second (the header named in code
 *   review, also documented as Vercel-guaranteed); x-forwarded-for last,
 *   as the final fallback.
 *
 * All three are Vercel-set/overwritten on this project's plan (no
 * Trusted Proxy), so a client-supplied x-forwarded-for value cannot
 * survive to influence the IP dimension of any rate limit — this
 * ordering is defense-in-depth for a future proxy-in-front-of-Vercel
 * scenario, not a fix for a spoofing hole that exists on this plan today.
 */
import type { NextRequest } from 'next/server';

function firstHop(headerValue: string): string {
  return headerValue.split(',')[0].trim();
}

export function getRequestIp(request: NextRequest): string {
  const vercelForwarded = request.headers.get('x-vercel-forwarded-for');
  if (vercelForwarded) return firstHop(vercelForwarded);

  const realIp = request.headers.get('x-real-ip');
  if (realIp) return firstHop(realIp);

  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return firstHop(forwarded);

  return 'unknown';
}
