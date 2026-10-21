'use client';

import { Pencil, Settings } from 'lucide-react';
import type { CommunityGroup } from '@/types/community.types';
import ScheduleManagerPanel from './ScheduleManagerPanel';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';

interface GroupOrganizerActionsProps {
  group: CommunityGroup;
  /** Creator-only "ערוך קהילה" (the caller passes it only to the creator). */
  onEdit: (() => void) | null;
  /** Owner/admin "ניהול מפגשים". */
  canManageSchedule: boolean;
  scheduleMgrOpen: boolean;
  editingSlotIndex: number | null;
  onOpenScheduleMgr: () => void;
  onEditSlot: (index: number | null) => void;
  onCloseScheduleMgr: () => void;
  showToast: (type: 'success' | 'error', text: string) => void;
}

/** Creator / admin tools: edit the community, manage the meetup schedule (inline panel). */
export default function GroupOrganizerActions({
  group,
  onEdit,
  canManageSchedule,
  scheduleMgrOpen,
  editingSlotIndex,
  onOpenScheduleMgr,
  onEditSlot,
  onCloseScheduleMgr,
  showToast,
}: GroupOrganizerActionsProps) {
  const t = useT(community);
  return (
    <>
      {onEdit && (
        <button
          onClick={onEdit}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-black bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 transition-all active:scale-[0.97]"
        >
          <Pencil className="w-4 h-4" />
          {t('group.organizer.edit')}
        </button>
      )}

      {canManageSchedule && (
        <button
          onClick={onOpenScheduleMgr}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-black bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 transition-all active:scale-[0.97]"
        >
          <Settings className="w-4 h-4" />
          {t('group.organizer.manageSchedule')}
        </button>
      )}

      {/* Schedule manager panel — inline overlay inside the drawer */}
      {scheduleMgrOpen && group.scheduleSlots && (
        <ScheduleManagerPanel
          group={group}
          editingSlotIndex={editingSlotIndex}
          onEdit={(i) => onEditSlot(i as number | null)}
          onClose={onCloseScheduleMgr}
          onSaved={onCloseScheduleMgr}
          showToast={showToast}
        />
      )}
    </>
  );
}
