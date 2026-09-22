/**
 * rateLimitLog.ts — one greppable log line per rate-limit block, shared by
 * every route wired up in the 22.09.2026 rate-limiting rollout (see
 * .claude/plans/rate-limiting-sensitive-endpoints.md part ג).
 *
 * Fixed `[rate-limit-block]` prefix so `vercel logs | grep rate-limit-block`
 * (or a saved Vercel log-drain query) finds every hit across every route.
 * `identifier` (an email, uid, or link id) is never logged raw — only a
 * truncated SHA-256 hash, matching the salted-IP-hash convention already
 * established in link-click-handler.ts's hashIp(). IP itself IS logged raw:
 * it's already the rate-limit KEY's own dimension in check-email/verify-token
 * (unhashed), and knowing which IP tripped a limit is the whole point of the
 * log line — unlike email, an IP alone doesn't identify a specific person.
 */
import { createHash } from 'crypto';

function hashIdentifier(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

export function logRateLimitBlock(input: {
  route: string;
  dimension: string;
  ip: string;
  identifier?: string;
}): void {
  const identifierPart = input.identifier ? ` identifierHash=${hashIdentifier(input.identifier)}` : '';
  console.warn(
    `[rate-limit-block] route=${input.route} dimension=${input.dimension} ip=${input.ip}${identifierPart} ts=${new Date().toISOString()}`,
  );
}
