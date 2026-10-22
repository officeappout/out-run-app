'use client';

import type { ReactNode } from 'react';
import { Calendar, Users } from 'lucide-react';
import type { DayFilter, SessionEnrichment } from '@/features/parks/core/hooks/useCommunityEnrichment';
import type { ProfileUser } from '../../UserProfileSheet';
import { DAY_FILTERS } from '../utils/park-detail-format';
import { useT } from '@/hooks/useT';
import { map as mapNs } from '@/messages/ns/map';
import { totalParkAttendees } from '../utils/park-detail-logic';
import ParkSessionRow from './ParkSessionRow';

interface ParkPulseSectionProps {
  v2: boolean;
  /** All live sessions (the title badge counts these, regardless of the day filter). */
  parkEvents: SessionEnrichment[];
  /** Sessions for the selected day (the list). */
  sessions: SessionEnrichment[];
  loading: boolean;
  dayFilter: DayFilter;
  onDayFilterChange: (f: DayFilter) => void;
  currentUid: string | undefined;
  joiningEventId: string | null;
  isUserRegistered: (ev: SessionEnrichment) => boolean | undefined;
  onJoin: (ev: SessionEnrichment) => void;
  onOpenProfile: (user: ProfileUser) => void;
  /** The "אני מגיע…" publish panel, rendered between the header and the list. */
  publishPanel: ReactNode;
}

/**
 * WHO'S COMING — Park Pulse / "מתאמנים". At the top of the body so the
 * community pulse + arrival CTA are the first thing after the hero/meta row.
 */
export default function ParkPulseSection({
  v2,
  parkEvents,
  sessions,
  loading,
  dayFilter,
  onDayFilterChange,
  currentUid,
  joiningEventId,
  isUserRegistered,
  onJoin,
  onOpenProfile,
  publishPanel,
}: ParkPulseSectionProps) {
  const t = useT(mapNs);
  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className={v2 ? 'flex items-center gap-1.5 text-[17px] font-black text-v2-ink' : 'text-[15px] font-bold text-gray-900 dark:text-white flex items-center gap-1.5'}>
          {v2 ? <Users size={18} strokeWidth={2.4} className="text-v2-deep" /> : <Calendar size={14} className="text-emerald-500" />}
          <span>{v2 ? t('parkDetail.pulse.titleHere') : 'מתאמנים' /* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}</span>
          {parkEvents.length > 0 && (
            <span className="bg-emerald-500 text-white text-[9px] font-black rounded-full w-[18px] h-[18px] flex items-center justify-center ms-0.5">
              {totalParkAttendees(parkEvents)}
            </span>
          )}
        </h3>
        <div className={v2 ? 'flex gap-0.5 rounded-full bg-v2-surface p-1 ring-1 ring-inset ring-v2-hairline' : 'flex gap-0.5 bg-gray-100 rounded-lg p-0.5'}>
          {DAY_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => onDayFilterChange(f)}
              className={
                v2
                  ? `h-8 whitespace-nowrap rounded-full px-3 text-[13px] font-extrabold transition-colors ${dayFilter === f ? 'bg-white text-v2-ink shadow-v2-ring' : 'text-v2-muted'}`
                  : `px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${
                      dayFilter === f ? 'bg-emerald-500 text-white shadow-sm' : 'text-gray-500'
                    }`
              }
            >
              {t('parkDetail.dayFilter', { filter: f })}
            </button>
          ))}
        </div>
      </div>

      {publishPanel}

      {loading ? (
        <div className="space-y-1.5">
          {[1, 2].map((i) => (
            <div key={i} className="animate-pulse flex items-center gap-2 py-2 px-2.5 bg-emerald-50/60 rounded-lg">
              <div className="w-6 h-6 bg-emerald-100 rounded-full" />
              <div className="flex-1 h-3 bg-emerald-100 rounded w-3/4" />
            </div>
          ))}
        </div>
      ) : sessions.length === 0 ? null : (
        <div className="space-y-1">
          {sessions.map((ev, idx) => (
            <ParkSessionRow
              key={`park_${ev.eventId}_${idx}`}
              ev={ev}
              v2={v2}
              isJoining={joiningEventId === ev.eventId}
              alreadyJoined={!!isUserRegistered(ev)}
              isOwnArrival={!!(ev.isPersonalArrival && ev.avatars?.[0]?.uid === currentUid)}
              onJoin={onJoin}
              onOpenProfile={onOpenProfile}
            />
          ))}
        </div>
      )}
    </section>
  );
}
