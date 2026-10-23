/**
 * Institution-code link helpers (/school/CODE -> /onboarding-new/access-code).
 *
 * native/init.ts stores the code in localStorage (`pending_institution_code`)
 * and IdentityProfileScreen forwards it as ?code=. The access-code page must
 * survive either source being absent (a refresh drops the query, a web visit
 * never sets storage), so both are read here and normalised the same way the
 * validateAccessCode client does (trim + upper-case).
 */

export const PENDING_INSTITUTION_CODE_KEY = 'pending_institution_code';

const CODE_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function normalizeInstitutionCode(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed || !CODE_RE.test(trimmed)) return null;
  return trimmed.toUpperCase();
}

/** Query wins over storage; an invalid query value falls through to storage. */
export function pickInstitutionCode(
  queryCode: string | null | undefined,
  storedCode: string | null | undefined,
): string | null {
  return normalizeInstitutionCode(queryCode) ?? normalizeInstitutionCode(storedCode);
}

export type AccessCodeErrorKey =
  | 'accessCodeLink.error.notFound'
  | 'accessCodeLink.error.expired'
  | 'accessCodeLink.error.exhausted'
  | 'accessCodeLink.error.inactive'
  | 'accessCodeLink.error.profile'
  | 'accessCodeLink.error.age'
  | 'accessCodeLink.error.generic';

/** Maps a validateAccessCode CF error to the catalog key of its message (same cases as AccessCodeGate). */
export function accessCodeErrorKey(err: unknown): AccessCodeErrorKey {
  const e = err as { message?: string; code?: string } | null;
  const msg = `${e?.message ?? ''} ${e?.code ?? ''}`;
  if (msg.includes('not-found') || msg.includes('not found')) return 'accessCodeLink.error.notFound';
  if (msg.includes('expired')) return 'accessCodeLink.error.expired';
  if (msg.includes('resource-exhausted') || msg.includes('maximum')) return 'accessCodeLink.error.exhausted';
  if (msg.includes('precondition') || msg.includes('no longer active')) return 'accessCodeLink.error.inactive';
  if (msg.includes('complete your profile')) return 'accessCodeLink.error.profile';
  if (msg.includes('under-minimum-age')) return 'accessCodeLink.error.age';
  return 'accessCodeLink.error.generic';
}
