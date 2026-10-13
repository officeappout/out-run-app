/**
 * Calendar feed tokens — `{uid}.{mac}`, mac = base64url(HMAC-SHA256(secret, "feed:v1:" + uid)).
 *
 * Pure logic (node:crypto only, no Firestore, no Next). Replaces the old
 * "the uid in the URL is the credential" model: a uid leaks through public
 * surfaces (e.g. challenge leaderboard), the MAC does not.
 *
 * Fails closed: a missing or short (<32 bytes) CALENDAR_FEED_SECRET makes
 * mint return null and verify return null — callers map that to 503 / 404.
 * The secret is read at call time (never cached at import) so tests and
 * rotations behave predictably.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

const MIN_SECRET_BYTES = 32;
const UID_PATTERN = /^[A-Za-z0-9_-]{6,128}$/;
const MAC_LENGTH = 43; // base64url(32-byte SHA-256), no padding
const VERSION_PREFIX = 'feed:v1:';

function readSecret(): string | null {
  const secret = process.env.CALENDAR_FEED_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < MIN_SECRET_BYTES) return null;
  return secret;
}

function computeMac(secret: string, uid: string): string {
  return createHmac('sha256', secret).update(VERSION_PREFIX + uid).digest('base64url');
}

/** True when the secret is configured and long enough. */
export function isFeedTokenConfigured(): boolean {
  return readSecret() !== null;
}

/** Returns `{uid}.{mac}`, or null if the secret is missing/short or the uid is malformed. */
export function mintFeedToken(uid: string): string | null {
  const secret = readSecret();
  if (!secret || !UID_PATTERN.test(uid)) return null;
  return `${uid}.${computeMac(secret, uid)}`;
}

/** Returns the uid if the token's MAC is valid, otherwise null. Never throws. */
export function verifyFeedToken(token: string): string | null {
  const secret = readSecret();
  if (!secret || typeof token !== 'string') return null;

  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;

  const uid = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  if (!UID_PATTERN.test(uid) || mac.length !== MAC_LENGTH) return null;

  const given = Buffer.from(mac, 'utf8');
  const expected = Buffer.from(computeMac(secret, uid), 'utf8');
  if (given.length !== expected.length) return null;

  return timingSafeEqual(given, expected) ? uid : null;
}
