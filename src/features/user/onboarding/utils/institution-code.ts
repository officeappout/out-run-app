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

/** Maps a validateAccessCode CF error to the Hebrew line the other entry points use. */
export function accessCodeErrorMessage(err: unknown): string {
  const e = err as { message?: string; code?: string } | null;
  const msg = `${e?.message ?? ''} ${e?.code ?? ''}`;
  if (msg.includes('not-found') || msg.includes('not found')) return 'קוד גישה לא נמצא. בדקו ונסו שוב.';
  if (msg.includes('expired')) return 'קוד הגישה פג תוקף.';
  if (msg.includes('resource-exhausted') || msg.includes('maximum')) return 'קוד הגישה הגיע למכסה המקסימלית.';
  if (msg.includes('precondition') || msg.includes('no longer active')) return 'קוד הגישה אינו פעיל יותר.';
  if (msg.includes('complete your profile')) return 'יש להשלים את הפרופיל (כולל תאריך לידה) לפני הזנת קוד גישה.';
  if (msg.includes('under-minimum-age')) return 'לא ניתן להשתמש בקוד גישה בשלב זה.';
  return 'שגיאה בבדיקת הקוד. נסו שוב.';
}
