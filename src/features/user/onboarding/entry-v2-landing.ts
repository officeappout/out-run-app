/**
 * Entry flow v2 — the landing contract between the location step (C1) and
 * the map's "step 2" (C2).
 *
 * When `enable_entry_globe_v1` is on and the user confirms their home on
 * /explorer (quick-signup path, not the profile "edit city" path), the
 * explorer page:
 *   1. writes sessionStorage `entry_v2_landing = "1"`, then
 *   2. navigates to `/map?fromExplorer=true&entry=v2`.
 *
 * MapShell's existing fromExplorer effect replaces the URL with a bare `/map`
 * on its first effect pass, so the `entry=v2` param is only reliable during
 * the very first render. The sessionStorage key is the durable signal: C2
 * should call `consumeEntryV2Landing(sessionStorage, searchParams)` once on
 * mount — it returns true for either signal and removes the key so a reload
 * or a later visit to /map never re-opens step 2.
 *
 * Pure: no React / Next imports, storage is passed in (testable).
 */

export const ENTRY_V2_LANDING_KEY = 'entry_v2_landing';
export const ENTRY_V2_PARAM = 'entry';
export const ENTRY_V2_PARAM_VALUE = 'v2';

/** The map URL the location step lands on when the entry flow v2 is on. */
export const ENTRY_V2_MAP_URL = `/map?fromExplorer=true&${ENTRY_V2_PARAM}=${ENTRY_V2_PARAM_VALUE}`;

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type ParamReader = { get(key: string): string | null };

/** Called by /explorer right before navigating to ENTRY_V2_MAP_URL. */
export function markEntryV2Landing(storage: KeyValueStorage | null | undefined): void {
  try {
    storage?.setItem(ENTRY_V2_LANDING_KEY, '1');
  } catch {
    /* private mode / quota — the URL param is the fallback */
  }
}

/** True when this /map visit is the entry flow's landing (URL param or the hint). */
export function isEntryV2Landing(
  storage: KeyValueStorage | null | undefined,
  params?: ParamReader | null,
): boolean {
  if (params?.get(ENTRY_V2_PARAM) === ENTRY_V2_PARAM_VALUE) return true;
  try {
    return storage?.getItem(ENTRY_V2_LANDING_KEY) === '1';
  } catch {
    return false;
  }
}

/** isEntryV2Landing + clears the hint, so it fires exactly once. */
export function consumeEntryV2Landing(
  storage: KeyValueStorage | null | undefined,
  params?: ParamReader | null,
): boolean {
  const landing = isEntryV2Landing(storage, params);
  try {
    storage?.removeItem(ENTRY_V2_LANDING_KEY);
  } catch {
    /* ignore */
  }
  return landing;
}
