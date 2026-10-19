import { useEffect, useState } from 'react';
import { getMyGroups } from '@/features/arena/services/group.service';
import type { CommunityGroup } from '@/types/community.types';
import { INSTITUTIONAL_GROUP_TYPES } from '../_lib/community-constants';

/**
 * ── Social groups (family/friends) for the league carousel ───────────────
 * Loaded once from profile.social.groupIds — only non-institutional groups
 * become league cards (work/campus/school/military/youth have scope cards).
 */
export function useSocialLeagueGroups(groupIds: string[] | undefined) {
  const [socialGroups, setSocialGroups] = useState<CommunityGroup[]>([]);
  useEffect(() => {
    const gids = groupIds;
    if (!gids?.length) { setSocialGroups([]); return; }
    getMyGroups(gids).then((all) => {
      setSocialGroups(all.filter((g) => !g.groupType || !INSTITUTIONAL_GROUP_TYPES.has(g.groupType)));
    }).catch(() => {});
  }, [groupIds]); // eslint-disable-line react-hooks/exhaustive-deps
  return socialGroups;
}
