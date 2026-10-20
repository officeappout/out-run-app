/**
 * AI testers — the pure rules behind mintDemoTesterToken (B2 of
 * agent-briefs/ai-testers-design.md §2.3, owner-approved 20.10.2026).
 * Zero imports on purpose: unit-tested from the root vitest (functions/ is not installed).
 *
 * The security of the whole tester sign-in lives HERE, on the issuing side: Firebase accepts
 * any custom token signed by the project, for any uid, so the only real limit is what this
 * function agrees to sign. It signs ONLY when every one of these holds:
 *   1. the caller is the qa-runner service account (Cloud Run IAM invoker + a second check
 *      of its Google OIDC ID token: issuer, audience, email, expiry — verifyCallerIdentity);
 *   2. enable_demo_users AND enable_ai_testers are both true (raw stored values);
 *   3. the uid matches ^demo_qa_[a-z0-9_]{3,40}$ (never a real or seeded demo persona);
 *   4. the uid is registered in demo_registry (testers roster, or the personas list);
 *   5. today's mint quota (Israel day) is not used up.
 * The token carries { demo: true, qa: true, run } — firestore.rules' isDemoActor() keys off
 * `demo`, the client flag resolver keys off `qa` (qaTesterValue). Never an admin claim.
 */

export const QA_TESTER_UID_PREFIX = 'demo_qa_';
export const QA_TESTER_UID_RE = /^demo_qa_[a-z0-9_]{3,40}$/;
export const QA_RUN_ID_RE = /^[A-Za-z0-9._-]{1,64}$/;

/** Hard ceiling on tokens per Israel day, whatever the panel's caps say. */
export const MINT_DAILY_HARD_MAX = 30;

export const DEFAULT_QA_RUNNER_SA_EMAIL = 'qa-runner@appout-1.iam.gserviceaccount.com';
export const DEFAULT_QA_MINT_AUDIENCE = 'https://us-central1-appout-1.cloudfunctions.net/mintDemoTesterToken';

const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

export type MintErrorCode =
  | 'bad_request'
  | 'caller_not_allowed'
  | 'switch_off'
  | 'uid_not_allowed'
  | 'uid_not_registered'
  | 'quota_exhausted';

export type MintDecision<T> = { ok: true; value: T } | { ok: false; code: MintErrorCode; status: number };

const err = (code: MintErrorCode, status: number): { ok: false; code: MintErrorCode; status: number } => ({ ok: false, code, status });

// ── Request ───────────────────────────────────────────────────────────────────

export interface MintRequest {
  uid: string;
  runId: string;
}

export function parseMintRequest(body: unknown): MintDecision<MintRequest> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return err('bad_request', 400);
  const b = body as Record<string, unknown>;
  if (typeof b.uid !== 'string' || typeof b.runId !== 'string') return err('bad_request', 400);
  if (!QA_TESTER_UID_RE.test(b.uid)) return err('uid_not_allowed', 403);
  if (!QA_RUN_ID_RE.test(b.runId)) return err('bad_request', 400);
  return { ok: true, value: { uid: b.uid, runId: b.runId } };
}

export function isQaTesterUid(uid: unknown): uid is string {
  return typeof uid === 'string' && QA_TESTER_UID_RE.test(uid);
}

// ── Caller identity (Google OIDC ID token of the qa-runner service account) ─────

/** The ID token from `X-Qa-Id-Token` (preferred — survives any proxy rewriting) or `Authorization: Bearer`. */
export function extractIdToken(headers: Record<string, unknown>): string | null {
  const pick = (v: unknown) => (Array.isArray(v) ? v[0] : v);
  const direct = pick(headers['x-qa-id-token']);
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const auth = pick(headers.authorization);
  if (typeof auth === 'string' && /^Bearer\s+\S+$/i.test(auth.trim())) return auth.trim().split(/\s+/)[1];
  return null;
}

/**
 * Checks the claims Google returned for the caller's ID token (tokeninfo, which also
 * verified the signature). Every field must match — fail closed.
 */
export function verifyCallerIdentity(
  info: Record<string, unknown> | null | undefined,
  expected: { email: string; audiences: readonly string[] },
  nowSec: number,
): boolean {
  if (!info) return false;
  if (typeof info.iss !== 'string' || !GOOGLE_ISSUERS.has(info.iss)) return false;
  if (typeof info.aud !== 'string' || !expected.audiences.includes(info.aud)) return false;
  if (typeof info.email !== 'string' || info.email.toLowerCase() !== expected.email.toLowerCase()) return false;
  if (!(info.email_verified === true || info.email_verified === 'true')) return false;
  const exp = Number(info.exp);
  if (!Number.isFinite(exp) || exp <= nowSec) return false;
  return true;
}

// ── Flags / registry / quota ──────────────────────────────────────────────────

export function testerSwitchesOn(flagsRaw: Record<string, unknown> | undefined | null): boolean {
  return flagsRaw?.enable_demo_users === true && flagsRaw?.enable_ai_testers === true;
}

/** uids from demo_registry/testers.uids and demo_registry/personas.uids. */
export function registeredUids(...docs: Array<Record<string, unknown> | undefined | null>): Set<string> {
  const out = new Set<string>();
  for (const d of docs) {
    const uids = d?.uids;
    if (Array.isArray(uids)) for (const u of uids) if (typeof u === 'string') out.add(u);
  }
  return out;
}

/** YYYY-MM-DD in Israel time. */
export function israelDayKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** min(hard max, the panel's maxTesterSessionsPerDay when set) — one token per session. */
export function dailyMintLimit(configRaw: Record<string, unknown> | undefined | null): number {
  const caps = (configRaw?.caps && typeof configRaw.caps === 'object' ? configRaw.caps : {}) as Record<string, unknown>;
  const cap = caps.maxTesterSessionsPerDay;
  if (typeof cap === 'number' && Number.isFinite(cap) && cap >= 0) return Math.min(MINT_DAILY_HARD_MAX, Math.floor(cap));
  return MINT_DAILY_HARD_MAX;
}

export interface QuotaState {
  day: string;
  count: number;
}

export function nextQuota(stored: Record<string, unknown> | undefined | null, today: string, limit: number): MintDecision<QuotaState> {
  const sameDay = stored?.day === today;
  const used = sameDay && typeof stored?.count === 'number' && stored.count >= 0 ? stored.count : 0;
  if (used >= limit) return err('quota_exhausted', 429);
  return { ok: true, value: { day: today, count: used + 1 } };
}

export interface MintContext {
  flagsRaw: Record<string, unknown> | undefined | null;
  registered: ReadonlySet<string>;
}

/** Steps 2–4 (identity and quota are checked around it). */
export function decideMint(req: MintRequest, ctx: MintContext): MintDecision<{ claims: Record<string, unknown> }> {
  if (!testerSwitchesOn(ctx.flagsRaw)) return err('switch_off', 409);
  if (!isQaTesterUid(req.uid)) return err('uid_not_allowed', 403);
  if (!ctx.registered.has(req.uid)) return err('uid_not_registered', 403);
  return { ok: true, value: { claims: testerClaims(req.runId) } };
}

export function testerClaims(runId: string): Record<string, unknown> {
  return { demo: true, qa: true, run: runId };
}
