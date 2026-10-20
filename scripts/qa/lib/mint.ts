/**
 * Asks mintDemoTesterToken for a custom token (one per session). The caller identity is the
 * qa-runner service account's Google ID token (QA_ID_TOKEN — on GitHub Actions the output of
 * google-github-actions/auth with token_format: id_token; no key file anywhere). It lives one
 * hour, so the runner checks it before each mint and stops cleanly when it is about to expire.
 * The custom token is returned to the caller only — never logged.
 */
import { decodeJwtPayload } from '@/lib/qa/qa-tester';

export const DEFAULT_MINT_URL = 'https://us-central1-appout-1.cloudfunctions.net/mintDemoTesterToken';
/** Don't start a session on an ID token with less than this left. */
export const ID_TOKEN_MIN_LEFT_SEC = 5 * 60;

export function idTokenSecondsLeft(idToken: string, nowSec: number): number {
  const exp = decodeJwtPayload(idToken)?.exp;
  return typeof exp === 'number' ? exp - nowSec : -1;
}

export type MintResult = { ok: true; token: string } | { ok: false; error: string };

export async function mintTesterToken(opts: { url: string; idToken: string; uid: string; runId: string; fetchImpl?: typeof fetch }): Promise<MintResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(opts.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.idToken}`, 'X-Qa-Id-Token': opts.idToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: opts.uid, runId: opts.runId }),
    });
  } catch {
    return { ok: false, error: 'network_error' };
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    /* non-JSON (e.g. Cloud Run 403 page) */
  }
  if (res.ok && typeof body.token === 'string') return { ok: true, token: body.token };
  return { ok: false, error: typeof body.error === 'string' ? body.error : `http_${res.status}` };
}
