/**
 * Admin session cookie — Edge-safe HMAC JWT.
 *
 * Why HMAC instead of Firebase session cookies?
 * ─────────────────────────────────────────────
 * Next.js middleware runs on the Edge runtime, where the firebase-admin
 * SDK does not work (it relies on Node-only APIs). To gate `/admin/*`
 * routes server-side BEFORE any HTML/JS is shipped, the middleware
 * must verify a credential using only Edge-compatible primitives.
 *
 * The flow:
 *   1. Browser signs in (Firebase Auth) → gets an ID token.
 *   2. Browser POSTs the ID token to /api/auth/session (Node runtime).
 *   3. The route verifies the ID token via firebase-admin and resolves
 *      whether the user is an admin (custom claim / email allowlist /
 *      Firestore role).
 *   4. The route mints an HS256-signed JWT containing
 *      `{ uid, email, admin, exp }` and sets it as an HttpOnly cookie.
 *   5. On every navigation, middleware (Edge) verifies the JWT
 *      signature using `jose` — which IS Edge-compatible — and gates
 *      `/admin/*` based on the `admin` claim.
 *
 * The HMAC secret never leaves the server.
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

export const SESSION_COOKIE_NAME = 'out_admin_session';
export const SESSION_TTL_SECONDS = 60 * 60; // 1 hour — matches Firebase ID-token lifetime

export interface AdminSessionPayload extends JWTPayload {
  uid: string;
  email: string | null;
  admin: boolean;
}

/**
 * Resolve the HMAC secret as a Uint8Array for `jose`.
 *
 * In production the env var MUST be set — we throw otherwise. In
 * development we fall back to a deterministic dev-only key so local
 * workflows don't break, but log a loud warning.
 */
function getSessionSecret(): Uint8Array {
  const raw = process.env.SESSION_COOKIE_SECRET;
  if (raw && raw.length >= 32) {
    return new TextEncoder().encode(raw);
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SESSION_COOKIE_SECRET is missing or too short (need ≥32 chars) in production.',
    );
  }
  // Dev-only fallback. NEVER ship this string to a real environment.
  const devSecret = 'out-run-dev-only-session-secret-do-not-use-in-prod-32+chars';
  if (typeof console !== 'undefined') {
    console.warn(
      '[admin-session] Using dev-only SESSION_COOKIE_SECRET. Set the env var before deploying.',
    );
  }
  return new TextEncoder().encode(devSecret);
}

export async function signAdminSession(
  payload: Omit<AdminSessionPayload, 'iat' | 'exp'>,
): Promise<string> {
  const secret = getSessionSecret();
  return await new SignJWT(payload as JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .setIssuer('out-run')
    .setAudience('out-run-admin')
    .sign(secret);
}

export async function verifyAdminSession(token: string): Promise<AdminSessionPayload | null> {
  try {
    const secret = getSessionSecret();
    const { payload } = await jwtVerify(token, secret, {
      issuer: 'out-run',
      audience: 'out-run-admin',
    });
    return payload as AdminSessionPayload;
  } catch {
    return null;
  }
}
