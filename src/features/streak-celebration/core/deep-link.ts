/**
 * `?celebrate=streak` — the entry a future server push ("עמדת ביעד הצעדים") opens:
 * the streak celebration first, then the steps screen. Client side only.
 */
export const CELEBRATE_PARAM = 'celebrate';
export const CELEBRATE_STREAK = 'streak';
/** Where the overlay hands off after the deep link. */
export const CELEBRATE_NEXT_ROUTE = '/activity/steps';

/** True when the query string asks for the streak celebration. Accepts "?a=b" or "a=b". */
export function parseCelebrateParam(search: string | null | undefined): boolean {
  if (!search) return false;
  try {
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    return params.getAll(CELEBRATE_PARAM).some((v) => v.trim().toLowerCase() === CELEBRATE_STREAK);
  } catch {
    return false;
  }
}

/** The same path + query + hash without the celebrate param (so a reload doesn't re-open it). */
export function stripCelebrateParam(pathname: string, search: string, hash = ''): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  params.delete(CELEBRATE_PARAM);
  const q = params.toString();
  return `${pathname}${q ? `?${q}` : ''}${hash}`;
}
