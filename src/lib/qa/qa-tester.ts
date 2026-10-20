/**
 * AI testers — client-side identity helpers (B2 of agent-briefs/ai-testers-design.md §2.4/§2.6,
 * owner-approved 20.10.2026). Pure, no Firebase import.
 *
 * An AI tester signs in with a custom token minted by functions/src/mintDemoTesterToken.ts
 * (uid `demo_qa_*`, claims { demo: true, qa: true, run }). The real security is on the minting
 * side; everything here is defence in depth:
 *   - /qa/signin refuses a token whose uid is not `demo_qa_*`, whose claims lack qa/demo, or
 *     while enable_demo_users / enable_ai_testers are off (checkQaSigninToken);
 *   - the flag resolver gives testers their own flag set (qaTesterValue) only for a signed-in
 *     `demo_qa_*` uid with the qa claim (isQaTesterIdentity) — never super-admin flags.
 */

/** Mirror of functions/src/lib/demo-tester-token.ts QA_TESTER_UID_RE (functions/ can't share code). */
export const QA_TESTER_UID_RE = /^demo_qa_[a-z0-9_]{3,40}$/;

export function isQaTesterUid(uid: unknown): uid is string {
  return typeof uid === 'string' && QA_TESTER_UID_RE.test(uid);
}

/** A signed-in tester: `demo_qa_*` uid AND the qa claim from the minting function. */
export function isQaTesterIdentity(uid: unknown, claims: Record<string, unknown> | null | undefined): boolean {
  return isQaTesterUid(uid) && claims?.qa === true && claims?.demo === true;
}

/** Both switches, read raw (no super-admin override). */
export function qaSwitchesOn(flagsRaw: Record<string, unknown> | null | undefined): boolean {
  return flagsRaw?.enable_demo_users === true && flagsRaw?.enable_ai_testers === true;
}

function base64UrlDecode(s: string): string | null {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
    if (typeof atob === 'function') {
      const bin = atob(b64);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    return Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

/** Payload of a JWT WITHOUT verifying it (Firebase verifies on sign-in). null when malformed. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  const json = base64UrlDecode(parts[1]);
  if (!json) return null;
  try {
    const v = JSON.parse(json) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** `#t=<token>` → token (null when absent). */
export function tokenFromHash(hash: string): string | null {
  const h = hash.startsWith('#') ? hash.slice(1) : hash;
  const t = new URLSearchParams(h).get('t');
  return t && /^[A-Za-z0-9._-]+$/.test(t) ? t : null;
}

export type QaSigninRefusal = 'no_token' | 'malformed' | 'not_tester' | 'switch_off' | 'expired';

export type QaSigninCheck = { ok: true; uid: string } | { ok: false; reason: QaSigninRefusal };

/**
 * Decides whether /qa/signin may use this custom token. A Firebase custom token's payload is
 * { uid, claims, exp, … } (claims = the developer claims the function set).
 */
export function checkQaSigninToken(
  token: string | null,
  flagsRaw: Record<string, unknown> | null | undefined,
  nowSec: number,
): QaSigninCheck {
  if (!token) return { ok: false, reason: 'no_token' };
  const p = decodeJwtPayload(token);
  if (!p) return { ok: false, reason: 'malformed' };
  const claims = (p.claims && typeof p.claims === 'object' ? p.claims : null) as Record<string, unknown> | null;
  if (!isQaTesterIdentity(p.uid, claims)) return { ok: false, reason: 'not_tester' };
  if (!qaSwitchesOn(flagsRaw)) return { ok: false, reason: 'switch_off' };
  if (typeof p.exp === 'number' && p.exp <= nowSec) return { ok: false, reason: 'expired' };
  return { ok: true, uid: p.uid as string };
}
