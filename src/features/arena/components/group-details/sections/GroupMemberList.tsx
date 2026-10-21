'use client';

import { Users } from 'lucide-react';
import type { GroupMember } from '@/types/community.types';
import { memberPermissions } from '../utils/group-details-logic';
import GroupMemberRow from './GroupMemberRow';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';

interface GroupMemberListProps {
  v2: boolean;
  members: GroupMember[];
  loading: boolean;
  createdBy: string;
  userId: string;
  isCreator: boolean;
  isCurrentUserAdmin: boolean;
  activeActionUid: string | null;
  onToggleActions: (uid: string | null) => void;
  actionPending: string | null;
  onToggleAdmin: (member: GroupMember) => void;
  onRemove: (member: GroupMember) => void;
}

/** "חברי הקהילה" — the roster, with inline owner/admin actions per member. */
export default function GroupMemberList({
  v2,
  members,
  loading,
  createdBy,
  userId,
  isCreator,
  isCurrentUserAdmin,
  activeActionUid,
  onToggleActions,
  actionPending,
  onToggleAdmin,
  onRemove,
}: GroupMemberListProps) {
  const t = useT(community);
  return (
    <div>
      <h4 className={v2 ? 'flex items-center gap-1.5 text-[17px] font-black text-v2-ink mb-2.5' : 'text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5 mb-2.5'}>
        <Users className="w-3.5 h-3.5" />
        {t('group.members.title')}
        {!loading && members.length > 0 && (
          <span className="text-gray-400 normal-case tracking-normal font-semibold">({members.length})</span>
        )}
      </h4>
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {members.map((member) => {
            const isExpanded = activeActionUid === member.uid;
            return (
              <GroupMemberRow
                key={member.uid}
                member={member}
                permissions={memberPermissions(member, { createdBy, userId, isCreator, isCurrentUserAdmin })}
                isExpanded={isExpanded}
                onToggle={() => onToggleActions(isExpanded ? null : member.uid)}
                pending={actionPending === member.uid}
                onToggleAdmin={onToggleAdmin}
                onRemove={onRemove}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
