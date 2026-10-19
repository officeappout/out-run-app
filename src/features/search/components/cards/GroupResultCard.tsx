'use client';

import { Clock } from 'lucide-react';
import { BrandCard, BRAND_GRADIENT } from '@/components/ui/v2';
import Highlight from '../Highlight';
import { formatKm } from './PlaceRow';
import { GROUP_CATEGORY_LABEL, groupScheduleLabel } from '../../providers/community';
import type { CommunityGroup } from '@/types/community.types';

interface Props {
  group: CommunityGroup;
  distanceKm: number | null;
  query?: string;
  joined: boolean;
  joining: boolean;
  /** 'feature' = the big card with the gradient header; 'compact' = the row card. */
  variant?: 'feature' | 'compact';
  onOpen: () => void;
  onJoin: () => void;
}

const initialsOf = (name: string) => name.replace(/[^A-Za-z\u0590-\u05FF\s]/g, '').trim().split(/\s+/).map((w) => w.slice(0, 1)).slice(0, 2).join('') || 'קב';

/** Group card (Social board) — opens the existing details drawer; "הצטרפות" uses the same join flow. */
export default function GroupResultCard({ group, distanceKm, query, joined, joining, variant = 'compact', onOpen, onJoin }: Props) {
  const schedule = groupScheduleLabel(group);
  const km = formatKm(distanceKm);
  const members = typeof group.memberCount === 'number' ? `${group.memberCount} חברים` : null;
  const cat = GROUP_CATEGORY_LABEL[group.category] ?? 'אימון';
  const joinBtn = (cls: string, style?: React.CSSProperties) => (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); if (!joined) onJoin(); else onOpen(); }}
      disabled={joining}
      aria-label={joined ? `${group.name}: כבר בקבוצה` : `הצטרפות ל${group.name}`}
      className={`${cls} shrink-0 rounded-full text-[13px] font-bold disabled:opacity-60 active:scale-[0.97]`}
      style={style}
    >
      {joining ? '…' : joined ? 'בקבוצה ✓' : 'הצטרפות'}
    </button>
  );

  if (variant === 'feature') {
    return (
      <BrandCard as="article" radius={20} raised className="overflow-hidden">
        <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }} aria-label={`פרטי הקבוצה ${group.name}`}>
          <div className="relative h-[92px]" style={{ background: BRAND_GRADIENT }}>
            {km && <span className="absolute start-2.5 top-2.5 flex h-6 items-center rounded-full bg-[rgba(4,34,43,0.75)] px-2.5 text-[11px] font-bold text-white">{km} ממך</span>}
            <span className="absolute -bottom-[22px] start-3.5 grid h-[52px] w-[52px] place-items-center rounded-2xl bg-white text-[17px] font-bold text-[#007399] shadow-[0_4px_14px_rgba(0,0,0,0.12)]" aria-hidden>{initialsOf(group.name)}</span>
          </div>
          <div className="flex flex-col gap-2 px-3.5 pb-3.5 pt-[30px]">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-[17px] font-bold text-[#171717]"><Highlight text={group.name} query={query} /></div>
                <div className="truncate text-[13px] text-[#6b7280]">{[cat, group.meetingLocation?.address].filter(Boolean).join(' · ')}</div>
              </div>
              {joinBtn('h-9 px-4', { background: BRAND_GRADIENT, color: '#04222b' })}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {schedule && (
                <span className="flex h-7 items-center gap-1.5 rounded-full bg-[#f0faff] px-2.5 text-[12px] font-bold text-[#007399]">
                  <Clock size={12} strokeWidth={2.2} aria-hidden />{schedule}
                </span>
              )}
              {members && <span className="flex h-7 items-center rounded-full bg-[#f1f5f9] px-2.5 text-[12px] font-bold text-[#334155]">{members}</span>}
            </div>
          </div>
        </div>
      </BrandCard>
    );
  }

  return (
    <BrandCard as="article" className="flex items-center gap-3 p-3">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-start" aria-label={`פרטי הקבוצה ${group.name}`}>
        <span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-2xl bg-[#ccfbf1] text-[16px] font-bold text-[#04222b]" aria-hidden>{initialsOf(group.name)}</span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[15px] font-bold text-[#171717]"><Highlight text={group.name} query={query} /></span>
          <span className="truncate text-[12px] text-[#6b7280]">{[cat, schedule].filter(Boolean).join(' · ')}</span>
          {(members || km) && <span className="truncate text-[12px] font-bold text-[#007399]">{[members, km].filter(Boolean).join(' · ')}</span>}
        </span>
      </button>
      {joinBtn('h-[34px] px-3', { background: '#ffffff', color: '#007399', border: '1.5px solid #5bc2f2' })}
    </BrandCard>
  );
}
