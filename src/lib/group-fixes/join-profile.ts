/**
 * /join (enable_group_fixes_v1): is the signed-in user's profile complete
 * (core.ageGroup, set server-side by /api/user/complete-profile)? The old
 * check read the store synchronously — before hydration / the first fetch it
 * was empty, so a complete user was sent back through the identity screen.
 * Waits for hydration (≤ 3 s), then, if still incomplete, refreshes from
 * Firestore once before answering.
 */
interface ProfileStoreLike {
  getState: () => {
    _hasHydrated: boolean;
    profile: { core?: { ageGroup?: unknown } } | null;
    refreshProfile: () => Promise<void>;
  };
}

const HYDRATION_WAIT_MS = 3000;
const POLL_MS = 100;

const complete = (store: ProfileStoreLike) => Boolean(store.getState().profile?.core?.ageGroup);

export async function profileReadyForJoin(
  store: ProfileStoreLike,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<boolean> {
  for (let waited = 0; !store.getState()._hasHydrated && waited < HYDRATION_WAIT_MS; waited += POLL_MS) {
    await sleep(POLL_MS);
  }
  if (complete(store)) return true;
  await store.getState().refreshProfile().catch(() => {});
  return complete(store);
}
