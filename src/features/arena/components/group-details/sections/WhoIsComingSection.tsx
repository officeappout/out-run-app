'use client';

import { Users } from 'lucide-react';
import type { SessionAttendance } from '@/types/community.types';
import type { WeekSession, WhoTab } from '../hooks/useWeekSessions';
import WhoNextTab from './WhoNextTab';
import WhoWeekTab from './WhoWeekTab';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';

interface WhoIsComingSectionProps {
  v2: boolean;
  whoTab: WhoTab;
  onSelectNext: () => void;
  onSelectWeek: () => void;
  nextSessionData: { date: string; time: string } | null;
  attendance: SessionAttendance | null;
  weekLoading: boolean;
  weekSessions: WeekSession[];
}

const tabClass = (v2: boolean, active: boolean) =>
  v2
    ? `h-8 whitespace-nowrap rounded-full px-3 text-[13px] font-extrabold transition-colors ${active ? 'bg-white text-v2-ink shadow-v2-ring' : 'text-v2-muted'}`
    : `px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
        active
          ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
          : 'text-gray-500 dark:text-gray-400'
      }`;

/** "מי מגיע" — who's coming (tabs: המפגש הבא / השבוע). */
export default function WhoIsComingSection({ v2, whoTab, onSelectNext, onSelectWeek, nextSessionData, attendance, weekLoading, weekSessions }: WhoIsComingSectionProps) {
  const t = useT(community);
  return (
    <div>
      {/* Header + tab pills */}
      <div className="flex items-center justify-between mb-3">
        <h4 className={v2 ? 'flex items-center gap-1.5 text-[17px] font-black text-v2-ink' : 'text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5'}>
          <Users className={v2 ? 'h-[18px] w-[18px] text-v2-deep' : 'w-3.5 h-3.5'} />
          {t('group.who.title')}
        </h4>
        <div className={v2 ? 'flex gap-0.5 rounded-full bg-v2-surface p-1 ring-1 ring-inset ring-v2-hairline' : 'flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1'}>
          <button onClick={onSelectNext} className={tabClass(v2, whoTab === 'next')}>
            {t('group.who.tab.next')}
          </button>
          <button onClick={onSelectWeek} className={tabClass(v2, whoTab === 'week')}>
            {t('group.who.tab.week')}
          </button>
        </div>
      </div>

      {whoTab === 'next' && <WhoNextTab v2={v2} nextSessionData={nextSessionData} attendance={attendance} />}
      {whoTab === 'week' && <WhoWeekTab v2={v2} loading={weekLoading} sessions={weekSessions} />}
    </div>
  );
}
