'use client';

/**
 * "לא לבד" (enable_home_v2) — one nearby walking group, read-only: the line and a
 * link to the group's drawer ("להצטרף?"). Renders nothing without a suggestion.
 *
 *   <NotAloneCard suggestion={s} onOpenGroup={(id) => router.push(walkingGroupHref(id))} />
 */
import { useState } from 'react';
import { Check, ChevronLeft, Users } from 'lucide-react';
import { IconTile } from '@/components/ui/v2';
import { suggestionLineHe, type WalkingGroupSuggestion } from '../nearbyWalkingGroup';
import { useUiDir } from '@/lib/i18n/useUiDir';
import { useT } from '@/hooks/useT';
import { schedule } from '@/messages/ns/schedule';

export interface NotAloneCardProps {
  suggestion: WalkingGroupSuggestion | null;
  /** Opens the group's drawer (home: in place; elsewhere: walkingGroupHref). */
  onOpenGroup: (groupId: string) => void;
  /**
   * enable_schedule_pilot_v1 (pilot P10): a tap asks "want me to add you?" and joins in place
   * (joinGroup adds the sessions to the schedule); the user stays in the flow. A failed join
   * offers the group's drawer instead. Omitted → the tap opens the group, as today.
   */
  onJoin?: (groupId: string) => Promise<void>;
  className?: string;
}

type JoinState = 'idle' | 'asking' | 'joining' | 'joined' | 'failed';

export default function NotAloneCard({ suggestion, onOpenGroup, onJoin, className = '' }: NotAloneCardProps) {
  const { direction, isRtl } = useUiDir();
  const t = useT(schedule);
  const [join, setJoin] = useState<JoinState>('idle');
  if (!suggestion) return null;
  if (onJoin && join !== 'idle') {
    const groupId = suggestion.groupId;
    const doJoin = async () => {
      setJoin('joining');
      try {
        await onJoin(groupId);
        setJoin('joined');
      } catch {
        setJoin('failed');
      }
    };
    return (
      <div className={`flex w-full flex-col gap-2.5 rounded-[20px] bg-white p-3 shadow-v2-ring ${className}`} dir={direction}>
        <span className="flex items-center gap-3">
          <IconTile icon={join === 'joined' ? Check : Users} tone="steps" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-bold text-v2-muted">{suggestion.name}</span>
            <span className="block text-[14.5px] font-black text-v2-ink">
              {join === 'joined' ? t('notAlone.joined') : join === 'failed' ? t('notAlone.failed') : t('notAlone.ask')}
            </span>
          </span>
        </span>
        {(join === 'asking' || join === 'joining') && (
          <span className="flex gap-2">
            <button
              type="button"
              disabled={join === 'joining'}
              onClick={() => void doJoin()}
              className="h-10 flex-1 rounded-full bg-v2-cta text-[14px] font-black text-v2-on-cta shadow-v2-cta disabled:opacity-60"
            >
              {join === 'joining' ? t('notAlone.joining') : t('notAlone.yes')}
            </button>
            <button
              type="button"
              disabled={join === 'joining'}
              onClick={() => setJoin('idle')}
              className="h-10 rounded-full bg-white px-4 text-[14px] font-extrabold text-v2-ink-2 shadow-v2-ring"
            >
              {t('notAlone.no')}
            </button>
          </span>
        )}
        {join === 'failed' && (
          <button type="button" onClick={() => onOpenGroup(groupId)} className="h-10 rounded-full bg-white text-[14px] font-extrabold text-v2-deep shadow-v2-ring">
            {t('notAlone.openGroup')}
          </button>
        )}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => (onJoin ? setJoin('asking') : onOpenGroup(suggestion.groupId))}
      className={`flex w-full items-center gap-3 rounded-[20px] bg-white p-3 text-start shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97] ${className}`}
      dir={direction}
    >
      <IconTile icon={Users} tone="steps" />
      <span className="min-w-0 flex-1">
        <span className="block truncate whitespace-nowrap text-[12.5px] font-extrabold text-v2-deep">לא לבד</span>
        <span className="block truncate whitespace-nowrap text-[14.5px] font-black text-v2-ink">{suggestionLineHe(suggestion)}</span>
        <span className="block truncate whitespace-nowrap text-[12px] font-bold text-v2-muted">{suggestion.name} · להצטרף?</span>
      </span>
      <ChevronLeft size={18} strokeWidth={2.4} className={`shrink-0 text-v2-muted ${isRtl ? 'ltr:-scale-x-100' : '-scale-x-100'}`} aria-hidden />
    </button>
  );
}
