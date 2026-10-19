import type { useRouter } from 'next/navigation';
import type { FeatureFlags } from '@/hooks/useFeatureFlags';
import type { useArenaAccess } from '@/features/arena/hooks/useArenaAccess';
import type { ArenaData } from '@/features/arena/hooks/useArenaData';
import type { useMyMilitaryDeclaration } from '@/features/arena/hooks/useHasDeclaredReserveStatus';
import type { CommunityGroup } from '@/types/community.types';
import type { LeaderboardState } from '../../_hooks/useLeaderboardState';
import type { LeaguesViewState } from '../../_hooks/useLeaguesViewState';
import type { useLeagueSelection } from '../../_hooks/useLeagueSelection';
import type { useMyScopeKm } from '../../_hooks/useMyScopeKm';

/**
 * Everything the leagues tab's components read: the page's shared data
 * (flags, access, the city's arena data) plus the leagues state hooks,
 * flattened so each component destructures exactly what it uses.
 */
export type LeaguesVM = {
  featureFlags: FeatureFlags;
  access: ReturnType<typeof useArenaAccess>;
  authority: ArenaData['authority'];
  isLeagueActive: boolean;
  arenaLoading: boolean;
  groups: CommunityGroup[];
  myDeclaration: ReturnType<typeof useMyMilitaryDeclaration>;
  router: ReturnType<typeof useRouter>;
  socialGroups: CommunityGroup[];
} & ReturnType<typeof useLeagueSelection> &
  LeaderboardState &
  ReturnType<typeof useMyScopeKm> &
  LeaguesViewState;
