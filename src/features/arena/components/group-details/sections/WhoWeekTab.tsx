'use client';

import type { WeekSession } from '../hooks/useWeekSessions';
import { formatSessionDate } from '../utils/group-details-logic';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';

/** "השבוע" tab — each of this week's sessions with its sign-ups. */
export default function WhoWeekTab({ v2, loading, sessions }: { v2: boolean; loading: boolean; sessions: WeekSession[] }) {
  const t = useT(community);
  return (
    <div>
      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-xs text-gray-400">{t('group.who.week.empty')}</p>
      ) : (
        <div className="space-y-2">
          {sessions.map((ws) => (
            <div
              key={`${ws.date}_${ws.time}`}
              className={v2 ? 'flex items-center gap-3 rounded-[18px] bg-white px-4 py-3 shadow-v2-ring' : 'flex items-center gap-3 px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-xl'}
            >
              <div className="flex-1 min-w-0">
                <p className={v2 ? 'text-[14px] font-black text-v2-ink' : 'text-xs font-bold text-gray-800 dark:text-gray-200'}>
                  {formatSessionDate(ws.date, ws.time, t)}
                </p>
                {ws.attendance && ws.attendance.currentCount > 0 ? (
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className="flex -space-x-1.5 rtl:space-x-reverse">
                      {Object.entries(ws.attendance.attendeeProfiles ?? {}).slice(0, 4).map(([uid, p]) => (
                        p.photoURL ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={uid} src={p.photoURL} alt={p.name} className="w-6 h-6 rounded-full border-2 border-white object-cover" loading="lazy" />
                        ) : (
                          <div key={uid} className="w-6 h-6 rounded-full border-2 border-white bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                            <span className="text-[10px] text-white font-black">{p.name?.charAt(0)}</span>
                          </div>
                        )
                      ))}
                    </div>
                    <span className="text-xs text-gray-500 font-semibold">
                      {t('group.who.week.registered', { count: String(ws.attendance.currentCount) })}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 mt-0.5">{t('group.who.week.none')}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
