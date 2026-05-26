'use client';

import React, { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { useMyGroups } from '@/features/arena/hooks/useMyGroups';
import { useChatInbox } from '@/features/social/hooks/useChatInbox';
import { useUserStore } from '@/features/user';
import type { CommunityGroup } from '@/types/community.types';

// ── Category → visual identity ────────────────────────────────────────────────

const CATEGORY_META: Record<string, { emoji: string; from: string; to: string }> = {
  walking:      { emoji: '🚶', from: 'from-green-400',  to: 'to-emerald-500' },
  running:      { emoji: '🏃', from: 'from-orange-400', to: 'to-red-500'     },
  yoga:         { emoji: '🧘', from: 'from-violet-400', to: 'to-purple-500'  },
  calisthenics: { emoji: '💪', from: 'from-cyan-400',   to: 'to-blue-500'   },
  cycling:      { emoji: '🚲', from: 'from-sky-400',    to: 'to-indigo-500'  },
  other:        { emoji: '⚡', from: 'from-gray-400',   to: 'to-slate-500'   },
};

// ── Reusable single-circle wrapper ────────────────────────────────────────────

interface CircleItemProps {
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
  /**
   * Ring style:
   *  - 'none'   → no ring (default)
   *  - 'cyan'   → quiet cyan ring (joined group with no unread chat)
   *  - 'unread' → loud red ring (joined group with at least one unread chat
   *               message) — same red-500 used by the AppHeader notification
   *               dot, so the visual language stays consistent.
   */
  ring?: 'none' | 'cyan' | 'unread';
}

function CircleItem({ label, children, onClick, ring = 'none' }: CircleItemProps) {
  const ringClass =
    ring === 'unread'
      ? 'ring-[2.5px] ring-red-500 ring-offset-2'
      : ring === 'cyan'
        ? 'ring-[2.5px] ring-cyan-400 ring-offset-2'
        : '';

  const avatar = (
    <div
      className={['w-14 h-14 rounded-full flex-shrink-0', ringClass]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );

  const inner = (
    <div className="flex flex-col items-center gap-1.5 w-[62px]">
      {avatar}
      <span className="text-[10px] font-semibold text-gray-600 text-center leading-tight line-clamp-2 w-full">
        {label}
      </span>
    </div>
  );

  return (
    <button
      type="button"
      onClick={onClick}
      className="active:scale-90 transition-transform"
      aria-label={label}
    >
      {inner}
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface CommunityCirclesProps {
  /** Called when the user taps one of their joined group circles */
  onGroupClick: (group: CommunityGroup) => void;
  /** Called when the user taps the trailing "+" circle (create/join a new
   *  community). When omitted, the trailing circle is hidden. */
  onCreatePress?: () => void;
}

export default function CommunityCircles({
  onGroupClick,
  onCreatePress,
}: CommunityCirclesProps) {
  const { groups, isLoading } = useMyGroups();
  const myUid = useUserStore((s) => s.profile?.id ?? null);

  // Real-time chat inbox — used ONLY to derive "this group has unread
  // messages" so we can paint the matching circle with the loud red ring.
  // ChatThread.groupId links a group chat back to its CommunityGroup.
  const { threads } = useChatInbox(myUid);

  const unreadGroupIds = useMemo(() => {
    const set = new Set<string>();
    if (!myUid) return set;
    for (const t of threads) {
      if (t.groupId && (t.unreadCount?.[myUid] ?? 0) > 0) {
        set.add(t.groupId);
      }
    }
    return set;
  }, [threads, myUid]);

  return (
    <div className="w-full" dir="rtl">
      <div
        className="flex gap-4 overflow-x-auto scrollbar-hide px-4 py-2 snap-x"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {/* ── Dynamic: loading skeletons ──── */}
        {isLoading &&
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5 w-[62px] flex-shrink-0">
              <div className="w-14 h-14 rounded-full bg-gray-100 animate-pulse" />
              <div className="h-2.5 w-10 bg-gray-100 rounded animate-pulse" />
            </div>
          ))}

        {/* ── Dynamic: one circle per joined group ──── */}
        {!isLoading &&
          groups.map((group) => {
            const meta = CATEGORY_META[group.category] ?? CATEGORY_META.other;
            const hasUnread = unreadGroupIds.has(group.id);
            return (
              <div key={group.id} className="snap-start flex-shrink-0">
                <CircleItem
                  label={group.name}
                  onClick={() => onGroupClick(group)}
                  ring={hasUnread ? 'unread' : 'cyan'}
                >
                  {group.images?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={group.images[0]}
                      alt={group.name}
                      className="w-full h-full rounded-full object-cover ring-2 ring-white shadow-md"
                    />
                  ) : (
                    <div
                      className={`w-full h-full rounded-full bg-gradient-to-br ${meta.from} ${meta.to} flex items-center justify-center shadow-md`}
                    >
                      <span className="text-xl leading-none">{meta.emoji}</span>
                    </div>
                  )}
                </CircleItem>
              </div>
            );
          })}

        {/* ── Trailing "+" — create / join a new community ──── */}
        {onCreatePress && (
          <div className="snap-start flex-shrink-0">
            <CircleItem label="צור / הצטרף" onClick={onCreatePress}>
              <div className="w-full h-full rounded-full border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center">
                <Plus className="w-5 h-5 text-gray-400" />
              </div>
            </CircleItem>
          </div>
        )}
      </div>

      {/* Thin separator */}
      <div className="mx-4 border-b border-gray-100" />
    </div>
  );
}
