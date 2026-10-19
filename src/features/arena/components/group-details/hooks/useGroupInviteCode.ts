'use client';

import { useState, useEffect } from 'react';
import { getGroupInviteCode } from '@/features/arena/services/group.service';
import type { CommunityGroup } from '@/types/community.types';

/**
 * SPEC-01 task 2: the invite code lives in a locked-down private/invite doc
 * (see firestore.rules), fetched on demand when the drawer opens for a
 * private group the viewer has joined or created — not bundled into the
 * list-level group fetch (useArenaData), which would read every visible
 * group's code just to render a list. A failed read (not a member, or an
 * isLocked/reserve-league group and the viewer isn't owner/admin) is treated
 * as "no code yet": the share panel just doesn't render.
 */
export function useGroupInviteCode(
  isOpen: boolean,
  group: CommunityGroup | null,
  isJoined: boolean | undefined,
  userId: string,
): string | null {
  const [fetchedInviteCode, setFetchedInviteCode] = useState<string | null>(null);
  useEffect(() => {
    if (!isOpen || !group || group.isPublic !== false) {
      setFetchedInviteCode(null);
      return;
    }
    const viewerIsMemberOrCreator = Boolean(isJoined) || group.createdBy === userId;
    if (!viewerIsMemberOrCreator) {
      setFetchedInviteCode(null);
      return;
    }
    let cancelled = false;
    getGroupInviteCode(group.id)
      .then((code) => { if (!cancelled) setFetchedInviteCode(code); })
      .catch(() => { if (!cancelled) setFetchedInviteCode(null); });
    return () => { cancelled = true; };
  }, [isOpen, group, isJoined, userId]);
  return fetchedInviteCode;
}
