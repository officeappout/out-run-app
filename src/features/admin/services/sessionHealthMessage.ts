/**
 * Maps a mintAdminSessionCookie failure reason (src/lib/auth.service.ts)
 * to the message SessionHealthBanner shows. Pure, no React/Firebase
 * imports — kept in its own file specifically so it's vitest-testable
 * (this repo's vitest config is .test.ts-only, no .tsx — see
 * 00-MASTER-PLAN.md §13.46).
 *
 * David caught (28.09.2026) that the first version of the banner showed
 * ONE fixed message regardless of reason — a 429 and a network drop read
 * identically, exactly the "different failure modes collapsed into the
 * same report" pattern §13.47/§13.48's standing rule is about.
 */
const GENERIC_MESSAGE = 'לא הצלחנו לרענן את החיבור שלך למערכת. אם זה חוזר, ייתכן שתידרש להתחבר מחדש בקרוב.';
const RATE_LIMITED_MESSAGE = 'יותר מדי ניסיונות לרענן את החיבור בזמן קצר. נסה שוב בעוד כמה דקות.';
const NETWORK_MESSAGE = 'בעיית רשת מנעה מאיתנו לרענן את החיבור שלך. בדוק את החיבור לאינטרנט ונסה שוב.';

export function messageForSessionFailure(reason: string | null): string {
  if (reason === 'rate_limited') return RATE_LIMITED_MESSAGE;
  if (reason === 'network') return NETWORK_MESSAGE;
  return GENERIC_MESSAGE;
}
