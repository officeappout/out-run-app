'use client';

/**
 * "לא לבד" (enable_home_v2) — one nearby walking group, read-only: the line and a
 * link to the group's drawer ("להצטרף?"). Renders nothing without a suggestion.
 *
 *   <NotAloneCard suggestion={s} onOpenGroup={(id) => router.push(walkingGroupHref(id))} />
 */
import { ChevronLeft, Users } from 'lucide-react';
import { IconTile } from '@/components/ui/v2';
import { suggestionLineHe, type WalkingGroupSuggestion } from '../nearbyWalkingGroup';

export interface NotAloneCardProps {
  suggestion: WalkingGroupSuggestion | null;
  /** Opens the group's drawer (home: in place; elsewhere: walkingGroupHref). */
  onOpenGroup: (groupId: string) => void;
  className?: string;
}

export default function NotAloneCard({ suggestion, onOpenGroup, className = '' }: NotAloneCardProps) {
  if (!suggestion) return null;
  return (
    <button
      type="button"
      onClick={() => onOpenGroup(suggestion.groupId)}
      className={`flex w-full items-center gap-3 rounded-[20px] bg-white p-3 text-right shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97] ${className}`}
      dir="rtl"
    >
      <IconTile icon={Users} tone="steps" />
      <span className="min-w-0 flex-1">
        <span className="block truncate whitespace-nowrap text-[12.5px] font-extrabold text-v2-deep">לא לבד</span>
        <span className="block truncate whitespace-nowrap text-[14.5px] font-black text-v2-ink">{suggestionLineHe(suggestion)}</span>
        <span className="block truncate whitespace-nowrap text-[12px] font-bold text-v2-muted">{suggestion.name} · להצטרף?</span>
      </span>
      <ChevronLeft size={18} strokeWidth={2.4} className="shrink-0 text-v2-muted" aria-hidden />
    </button>
  );
}
