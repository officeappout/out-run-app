'use client';

import React from 'react';
import { Bell } from 'lucide-react';
import { mostCommonOpenHourIsrael } from '../../shared.utils';
import type { UserTabData } from '../tabs/types';

/** Per-user push summary strip + reverse-chronological push log. */
export default function PushHistory({ pushHistory }: Pick<UserTabData, 'pushHistory'>) {
  return (
      <div>
    {(() => {
      const totalSent = pushHistory.length;
      const openedCount = pushHistory.filter((e) => e.openedAt).length;
      const openRate = totalSent > 0 ? Math.round((openedCount / totalSent) * 100) : null;
      const lastSent = pushHistory[0]?.sentAt; // already sorted newest-first
      const bestHour = mostCommonOpenHourIsrael(pushHistory);

      return (
        <div className="space-y-6">
          {/* Per-user summary strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <div className="text-[11px] text-slate-500 font-bold mb-1">סה״כ נשלחו</div>
              <div className="text-sm font-black text-slate-800">{totalSent}</div>
            </div>
            <div
              className={`border rounded-xl p-3 ${
                openRate !== null && openRate > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className="text-[11px] text-gray-500 font-bold mb-1">אחוז פתיחה</div>
              <div className="text-sm font-black text-gray-800">
                {openRate !== null ? `${openRate}% (${openedCount}/${totalSent})` : 'ללא נתון'}
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <div className="text-[11px] text-blue-600 font-bold mb-1">פוש אחרון שנשלח</div>
              <div className="text-sm font-black text-blue-800">
                {lastSent ? lastSent.toLocaleString('he-IL') : 'ללא נתון'}
              </div>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
              <div className="text-[11px] text-purple-600 font-bold mb-1">שעת פתיחה שכיחה</div>
              <div className="text-sm font-black text-purple-800">
                {bestHour !== null ? `${String(bestHour).padStart(2, '0')}:00` : 'אין מספיק נתונים'}
              </div>
            </div>
          </div>

          <div className="text-[11px] text-gray-400 font-simpler" dir="rtl">
            מכיל רק פושים שנשלחו ע״י הסנדרים ששולבו במדידה (step-goal, planned-activity) — לא כל סוגי הפוש.
            ראו .claude/knowledge/push-notifications-audit-2026-10-04.md.
          </div>

          {/* Reverse-chronological push list */}
          <div>
            <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
              <Bell size={20} className="text-[#5BC2F2]" />
              היסטוריית פוש (חדש → ישן)
            </h3>

            {pushHistory.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <Bell size={32} className="mx-auto text-gray-300 mb-2" />
                <div className="text-gray-500 text-sm font-simpler">
                  אין פושים מתועדים למשתמש זה
                </div>
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto pe-2">
                {pushHistory.map((entry) => (
                  <div key={entry.pushId} className="bg-white border border-gray-200 rounded-xl p-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="font-bold text-sm font-simpler text-gray-900">
                        {entry.category ?? 'ללא קטגוריה'}
                        {entry.channel && <span className="text-gray-400"> · {entry.channel}</span>}
                      </div>
                      <div className="text-xs text-gray-400 whitespace-nowrap">
                        {entry.sentAt ? entry.sentAt.toLocaleString('he-IL') : '—'}
                      </div>
                    </div>

                    {entry.copyText && (
                      <div className="text-xs text-gray-600 font-simpler mb-2 bg-gray-50 rounded-lg p-2" dir="rtl">
                        {entry.copyText}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span
                        className={`px-2 py-0.5 rounded-full font-bold ${
                          entry.delivered ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {entry.delivered ? 'נמסר' : 'לא נמסר'}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full font-bold ${
                          entry.openedAt ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {entry.openedAt ? `נפתח ${entry.openedAt.toLocaleString('he-IL')}` : 'לא נפתח'}
                      </span>
                      {entry.landingPath && (
                        <span className="px-2 py-0.5 rounded-full font-bold bg-cyan-100 text-cyan-700">
                          נחת: {entry.landingPath}
                        </span>
                      )}
                      {entry.outcomeChecked && (
                        <span
                          className={`px-2 py-0.5 rounded-full font-bold ${
                            entry.outcomeAchieved ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {entry.outcomeAchieved ? '✓' : '✗'} תוצאה ({entry.outcomeType ?? '—'})
                        </span>
                      )}
                      {!entry.outcomeChecked && entry.openedAt && (
                        <span className="px-2 py-0.5 rounded-full font-bold bg-gray-100 text-gray-500">
                          תוצאה: ממתין לבדיקה
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    })()}
      </div>
  );
}
