'use client';

import { X, Loader2, ChevronDown, Crown, Shield } from 'lucide-react';
import type { GroupMember } from '@/types/community.types';
import { memberInitials, type memberPermissions } from '../utils/group-details-logic';

interface GroupMemberRowProps {
  member: GroupMember;
  permissions: ReturnType<typeof memberPermissions>;
  isExpanded: boolean;
  onToggle: () => void;
  /** An admin action on this member is in flight. */
  pending: boolean;
  onToggleAdmin: (member: GroupMember) => void;
  onRemove: (member: GroupMember) => void;
}

/** One roster row; tapping it (when the viewer has actions) opens the inline action panel. */
export default function GroupMemberRow({ member, permissions, isExpanded, onToggle, pending, onToggleAdmin, onRemove }: GroupMemberRowProps) {
  const { isGroupCreator, isGroupAdminMember, canPromote, canDemote, canRemove, hasActions } = permissions;
  const initials = memberInitials(member.name);
  return (
    <div className="rounded-xl overflow-hidden">
      {/* Member row */}
      <button
        type="button"
        disabled={!hasActions}
        onClick={() => hasActions && onToggle()}
        className={`w-full flex items-center gap-3 py-2 px-3 bg-gray-50 dark:bg-gray-800/50 transition-colors ${hasActions ? 'active:bg-gray-100 dark:active:bg-gray-700/60 cursor-pointer' : 'cursor-default'}`}
      >
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${isGroupCreator ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'bg-gradient-to-br from-cyan-400 to-blue-500'}`}>
          {initials.toUpperCase() || '?'}
        </div>
        <div className="flex-1 min-w-0 text-right">
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
            {member.name}
          </p>
          {isGroupCreator && (
            <p className="text-xs text-amber-600 dark:text-amber-400 font-bold flex items-center gap-0.5">
              <Crown className="w-3 h-3" />
              בעלים
            </p>
          )}
          {isGroupAdminMember && (
            <p className="text-xs text-blue-500 dark:text-blue-400 font-bold flex items-center gap-0.5">
              <Shield className="w-3 h-3" />
              מנהל/ת
            </p>
          )}
        </div>
        {hasActions && (
          <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
        )}
      </button>

      {/* Inline action panel */}
      {isExpanded && (
        <div className="bg-gray-100 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-3 py-2 space-y-1" dir="rtl">
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1.5">
            {member.name} · פעולות מנהל
          </p>
          {canPromote && (
            <button
              disabled={pending}
              onClick={() => onToggleAdmin(member)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4 text-blue-500" />}
              הפוך למנהל
              <span className="text-xs text-gray-400 font-normal mr-auto">אותן סמכויות כמו שלך</span>
            </button>
          )}
          {canDemote && (
            <button
              disabled={pending}
              onClick={() => onToggleAdmin(member)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4 text-gray-400" />}
              הסר ניהול
            </button>
          )}
          {canRemove && (
            <button
              onClick={() => onRemove(member)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <X className="w-4 h-4" />
              הסר מהקבוצה
            </button>
          )}
        </div>
      )}
    </div>
  );
}
