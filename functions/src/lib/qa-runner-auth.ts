/**
 * The qa-runner identity check shared by every AI-tester endpoint (mintDemoTesterToken,
 * qaRunnerReport). Cloud Run IAM (`invoker: 'private'` + roles/run.invoker granted ONLY to the
 * qa-runner service account) already lets nobody else in; this is the second, in-code check:
 * the caller's Google ID token is verified by Google's tokeninfo (signature) and its claims must
 * be iss=Google, aud=this function, email=qa-runner, verified, unexpired (verifyCallerIdentity).
 * No Firebase import — fetch is injectable for tests.
 */
import { DEFAULT_QA_RUNNER_SA_EMAIL, extractIdToken, verifyCallerIdentity } from './demo-tester-token';

const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';

export async function fetchTokenInfo(idToken: string, fetchImpl: typeof fetch = fetch): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetchImpl(TOKENINFO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken }).toString(),
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Comma list from an env var, else the default (the function's cloudfunctions.net URL). */
export function audiencesFrom(raw: string | undefined, fallback: string): string[] {
  const v = raw?.trim();
  return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [fallback];
}

export function expectedRunnerEmail(): string {
  return process.env.QA_RUNNER_SA_EMAIL?.trim() || DEFAULT_QA_RUNNER_SA_EMAIL;
}

/** true only for the qa-runner service account with a token minted for one of `audiences`. */
export async function isQaRunnerRequest(
  headers: Record<string, unknown>,
  audiences: readonly string[],
  opts: { fetchImpl?: typeof fetch; nowSec?: number; email?: string } = {},
): Promise<boolean> {
  const idToken = extractIdToken(headers);
  if (!idToken) return false;
  const info = await fetchTokenInfo(idToken, opts.fetchImpl);
  return verifyCallerIdentity(info, { email: opts.email ?? expectedRunnerEmail(), audiences }, opts.nowSec ?? Math.floor(Date.now() / 1000));
}

/**
 * Cloud Run invoker list for the AI-tester endpoints. Declared in code (not `'private'` +
 * a manual `add-invoker-policy-binding`) because every `firebase deploy` re-applies the
 * declared invoker — with `'private'` a redeploy silently wiped qa-runner's roles/run.invoker
 * and the runner got http_403 (21.10.2026).
 */
export const QA_RUNNER_INVOKERS: string[] = [process.env.QA_RUNNER_SA_EMAIL?.trim() || DEFAULT_QA_RUNNER_SA_EMAIL];
