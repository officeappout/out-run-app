import { useEffect } from 'react';

/** ── Social connections bootstrap ─────────────────────────────────────── */
export function useSocialBootstrap(
  hasHydrated: boolean,
  userId: string | undefined,
  socialLoaded: boolean,
  loadConnections: (uid: string) => unknown,
) {
  useEffect(() => {
    if (hasHydrated && userId && !socialLoaded) {
      loadConnections(userId);
    }
  }, [hasHydrated, userId, socialLoaded, loadConnections]);
}

/** ── Sync joinedGroupIds with profile-level groupIds ──────────────────── */
export function useSyncJoinedGroupIds(
  savedGroupIds: string[] | undefined,
  setJoinedGroupIds: (update: (prev: Set<string>) => Set<string>) => void,
) {
  useEffect(() => {
    const savedIds = savedGroupIds;
    if (savedIds?.length) {
      setJoinedGroupIds((prev) => {
        const merged = new Set(prev);
        for (const id of savedIds) merged.add(id);
        return merged.size !== prev.size ? merged : prev;
      });
    }
  }, [savedGroupIds]); // eslint-disable-line react-hooks/exhaustive-deps -- setJoinedGroupIds is a stable state setter
}
