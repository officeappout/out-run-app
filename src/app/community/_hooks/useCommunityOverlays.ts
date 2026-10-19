import { useEffect, useState } from 'react';
import type { useRouter, useSearchParams } from 'next/navigation';
import type { CommunityEvent, CommunityGroup } from '@/types/community.types';
import type { CommunityTopTab } from '../_lib/community-constants';
import { groupJoinSuccess, type JoinSuccessData } from '../_lib/community-logic';

/**
 * Which page-level overlay is open (group / event drawers, post-join success,
 * the create-group wizard), local membership state, and the deep links that
 * open them: ?groupId (± &joined=true), ?editGroup, ?openCreate.
 */
export function useCommunityOverlays({
  searchParams,
  router,
  groups,
  arenaLoading,
  applyTabParam,
  setLeagueSheetOpen,
}: {
  searchParams: ReturnType<typeof useSearchParams>;
  router: ReturnType<typeof useRouter>;
  groups: CommunityGroup[];
  arenaLoading: boolean;
  applyTabParam: (params: URLSearchParams, next: CommunityTopTab) => void;
  setLeagueSheetOpen: (open: boolean) => void;
}) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<CommunityGroup | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CommunityEvent | null>(null);
  const [joinedGroupIds, setJoinedGroupIds] = useState<Set<string>>(new Set());
  const [joinedEventIds, setJoinedEventIds] = useState<Set<string>>(new Set());
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<JoinSuccessData | null>(null);

  // ── Deep-link: ?groupId=xxx → open drawer, or ?groupId=xxx&joined=true →
  //    fire the post-join success drawer (gateway auto-join completed). ──────
  useEffect(() => {
    const targetId = searchParams.get('groupId');
    if (!targetId || !groups.length || arenaLoading) return;
    const target = groups.find((g) => g.id === targetId);
    if (target) {
      const justJoined = searchParams.get('joined') === 'true';
      if (justJoined) {
        // The membership write already happened at the gateway — mark joined
        // locally and celebrate with the success drawer.
        setJoinedGroupIds((prev) => new Set([...Array.from(prev), target.id]));
        setSuccessData(groupJoinSuccess(target));
      }
      // Strip query params without nuking ?tab= if it was set.
      const params = new URLSearchParams(searchParams.toString());
      params.delete('groupId');
      params.delete('joined');
      if (!justJoined) {
        // Force feed view so the drawer feels in-context. Written into the
        // same replace as the strip — a separate setTopTab('feed') replace was
        // overwritten by this one (stale searchParams), leaving the old tab.
        applyTabParam(params, 'feed');
        setSelectedGroup(target);
      }
      const qs = params.toString();
      router.replace(`/community${qs ? `?${qs}` : ''}`, { scroll: false });
    }
  }, [searchParams, groups, arenaLoading, router, applyTabParam]);

  // ── Deep-link: ?editGroup=xxx → open CreateGroupWizard in edit mode ──────
  useEffect(() => {
    const editId = searchParams.get('editGroup');
    if (!editId) return;
    setEditGroupId(editId);
    setWizardOpen(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('editGroup');
    const qs = params.toString();
    router.replace(`/community${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [searchParams, router]);

  // ── Deep-link: ?openCreate=true → reopen wizard after profile-only detour ─
  useEffect(() => {
    if (searchParams.get('openCreate') !== 'true') return;
    setLeagueSheetOpen(false); // close league sheet so wizard is not buried beneath it
    setEditGroupId(null);
    setWizardOpen(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('openCreate');
    const qs = params.toString();
    router.replace(`/community${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [searchParams, router]); // eslint-disable-line react-hooks/exhaustive-deps -- setLeagueSheetOpen is a stable state setter

  return {
    wizardOpen,
    setWizardOpen,
    editGroupId,
    setEditGroupId,
    selectedGroup,
    setSelectedGroup,
    selectedEvent,
    setSelectedEvent,
    joinedGroupIds,
    setJoinedGroupIds,
    joinedEventIds,
    setJoinedEventIds,
    joiningId,
    setJoiningId,
    successData,
    setSuccessData,
  };
}

export type CommunityOverlaysState = ReturnType<typeof useCommunityOverlays>;
