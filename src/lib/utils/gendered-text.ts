/**
 * Gendered Text Utility
 *
 * Tiny `g()` helper for resolving Hebrew morphology against the user's
 * stored gender (`profile.core.gender`).
 *
 * Why it lives here (not in `features/content/exercises/core/exercise.types`):
 *   The existing `getGenderedText` in the exercises domain operates on a
 *   `GenderedText` *object shape* (`{ male, female }`) used to model
 *   admin-edited cue copy. That helper is content-bound and treats `'other'`
 *   as `'male'` silently because its `UserGender` type is only `'male' | 'female'`.
 *
 *   The partner-finder UI (and most app-shell strings) already know both
 *   strings inline at the call site — wrapping them in an object is heavy.
 *   This `g()` helper takes the literals positionally and respects the
 *   full `'male' | 'female' | 'other'` triple that lives on
 *   `profile.core.gender`.
 *
 * Defaults:
 *   - `null` / `undefined` gender ⇒ male form (matches the codebase
 *     convention: `?? 'male'` is the established fallback in
 *     `DashboardTab`, `MunicipalPressureCard`, etc).
 *   - `'other'` ⇒ optional `other` arg if provided, else the male form.
 *     We intentionally do NOT pick female for `'other'` — male verbs are
 *     the closer match for grammatically-neutral Hebrew copy.
 *
 * Usage:
 *   const gender = useUserStore.getState().profile?.core?.gender ?? 'male';
 *   const cta = g(gender, 'הצטרף', 'הצטרפי');           // 2-arg
 *   const cta = g(gender, 'הצטרף', 'הצטרפי', 'הצטרפו'); // 3-arg
 *
 * Inside a render path, prefer the hook form so re-renders track:
 *   const gender = useUserStore((s) => s.profile?.core?.gender ?? 'male');
 */

export type AppGender = 'male' | 'female' | 'other';

export function g(
  gender: AppGender | null | undefined,
  male: string,
  female: string,
  other?: string,
): string {
  if (gender === 'female') return female;
  if (gender === 'other') return other ?? male;
  return male;
}
