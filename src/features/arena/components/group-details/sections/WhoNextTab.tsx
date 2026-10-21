'use client';

import type { SessionAttendance } from '@/types/community.types';
import { formatSessionDate } from '../utils/group-details-logic';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';

interface WhoNextTabProps {
  v2: boolean;
  nextSessionData: { date: string; time: string } | null;
  attendance: SessionAttendance | null;
}

/** "המפגש הבא" tab — avatars + count (+ waitlist) for the next session. */
export default function WhoNextTab({ v2, nextSessionData, attendance }: WhoNextTabProps) {
  const t = useT(community);
  return (
    <div>
      {nextSessionData && v2 ? (
        <div className="flex items-center justify-between gap-3 rounded-[20px] bg-v2-surface px-4 py-3 ring-1 ring-inset ring-v2-hairline">
          <div className="flex -space-x-2 rtl:space-x-reverse">
            {Object.entries(attendance?.attendeeProfiles ?? {}).slice(0, 5).map(([uid, p]) =>
              p.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={uid} src={p.photoURL} alt={p.name} className="h-8 w-8 rounded-full object-cover ring-2 ring-white" loading="lazy" decoding="async" />
              ) : (
                <span key={uid} className="grid h-8 w-8 place-items-center rounded-full bg-v2-tint text-[12px] font-black text-v2-deep ring-2 ring-white">
                  {p.name?.charAt(0)}
                </span>
              ),
            )}
          </div>
          <div className="text-end">
            <p className="text-[16px] font-black text-v2-ink" aria-live="polite">
              {(attendance?.currentCount ?? 0) > 0 ? t('group.who.next.coming', { count: String(attendance!.currentCount) }) : t('group.who.next.none')}
            </p>
            <p className="text-[12.5px] font-bold text-v2-muted">
              {formatSessionDate(nextSessionData.date, nextSessionData.time, t)}
              {(attendance?.waitlist?.length ?? 0) > 0 ? t('group.who.next.waiting', { count: String(attendance!.waitlist!.length) }) : ''}
            </p>
          </div>
        </div>
      ) : nextSessionData ? (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 font-semibold">
            {formatSessionDate(nextSessionData.date, nextSessionData.time, t)}
          </p>
          {attendance && attendance.currentCount > 0 ? (
            <div className="flex items-center gap-2.5">
              <div className="flex -space-x-2 rtl:space-x-reverse">
                {Object.entries(attendance.attendeeProfiles ?? {}).slice(0, 7).map(([uid, p]) => (
                  p.photoURL ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={uid} src={p.photoURL} alt={p.name} className="w-8 h-8 rounded-full border-2 border-white object-cover" loading="lazy" decoding="async" />
                  ) : (
                    <div key={uid} className="w-8 h-8 rounded-full border-2 border-white bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                      <span className="text-xs text-white font-black">{p.name?.charAt(0)}</span>
                    </div>
                  )
                ))}
              </div>
              <div>
                <p className="text-sm font-black text-gray-800 dark:text-gray-200" aria-live="polite">
                  {t('group.who.next.registered', { n: attendance.currentCount, count: String(attendance.currentCount) })}
                </p>
                {(attendance?.waitlist?.length ?? 0) > 0 && (
                  <p className="text-xs text-amber-600 font-semibold" aria-live="polite">
                    {t('group.who.next.waitlist', { count: String(attendance.waitlist!.length) })}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400 font-medium">
              {t('group.who.next.beFirst')}
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-gray-400">{t('group.who.next.noSession')}</p>
      )}
    </div>
  );
}
