'use client';

import type { GroupMember } from '@/types/community.types';
import NavigationSheet from '../../NavigationSheet';
import ReportContentSheet from '../../ReportContentSheet';
import RemoveMemberModal from './RemoveMemberModal';

interface GroupDrawerOverlaysProps {
  groupId: string;
  groupName: string;
  userId: string;
  confirmRemove: GroupMember | null;
  removing: boolean;
  onCancelRemove: () => void;
  onConfirmRemove: () => void;
  navOpen: boolean;
  onCloseNav: () => void;
  destLat: number;
  destLng: number;
  destAddress: string | undefined;
  reportOpen: boolean;
  onCloseReport: () => void;
}

/** What the group drawer opens above itself: remove-member confirm, navigation picker, report sheet. */
export default function GroupDrawerOverlays(p: GroupDrawerOverlaysProps) {
  return (
    <>
      <RemoveMemberModal member={p.confirmRemove} removing={p.removing} onCancel={p.onCancelRemove} onConfirm={p.onConfirmRemove} />

      {/* Navigation selector sheet */}
      <NavigationSheet
        isOpen={p.navOpen}
        onClose={p.onCloseNav}
        lat={p.destLat}
        lng={p.destLng}
        label={p.destAddress}
      />

      {/* Report content sheet */}
      <ReportContentSheet
        isOpen={p.reportOpen}
        onClose={p.onCloseReport}
        targetId={p.groupId}
        targetType="group"
        targetName={p.groupName}
        reporterId={p.userId}
      />
    </>
  );
}
