'use client';

import React from 'react';
import { Footprints } from 'lucide-react';
import type { UserTabData } from '../tabs/types';

/** "תוכנית ריצה פעילה": running plan meta + week/day schedule table. */
export default function RunningProgram({ fullProfile }: Pick<UserTabData, 'fullProfile'>) {
  return (
    <div>
      <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
        <Footprints size={20} className="text-[#5BC2F2]" />
        תוכנית ריצה פעילה
      </h3>
      {fullProfile.running?.activeProgram ? (() => {
        const prog = fullProfile.running.activeProgram;
        const schedule = Array.isArray((prog as any).schedule) ? (prog as any).schedule as Array<{
          week: number;
          day: number;
          workoutId: string;
          status: string;
          category?: string;
          workoutName?: string;
        }> : [];
        const STATUS_LABELS: Record<string, { label: string; color: string }> = {
          pending: { label: 'ממתין', color: 'bg-gray-100 text-gray-700' },
          completed: { label: 'הושלם', color: 'bg-green-100 text-green-700' },
          skipped: { label: 'דולג', color: 'bg-yellow-100 text-yellow-700' },
          swapped: { label: 'הוחלף', color: 'bg-blue-100 text-blue-700' },
        };
        const weekGroups = schedule.reduce<Record<number, typeof schedule>>((acc, item) => {
          (acc[item.week] ??= []).push(item);
          return acc;
        }, {});

        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="text-xs text-gray-500 mb-1">מזהה תוכנית</div>
                <div className="font-bold text-sm text-gray-900 break-all">{(prog as any).programId ?? '—'}</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="text-xs text-gray-500 mb-1">שבוע נוכחי</div>
                <div className="font-black text-2xl text-[#5BC2F2]">{(prog as any).currentWeek ?? '—'}</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="text-xs text-gray-500 mb-1">תאריך התחלה</div>
                <div className="font-bold text-sm text-gray-900">
                  {(prog as any).startDate
                    ? new Date((prog as any).startDate).toLocaleDateString('he-IL')
                    : '—'}
                </div>
              </div>
            </div>

            {schedule.length > 0 ? (
              <div className="border rounded-xl overflow-hidden">
                <div className="max-h-[400px] overflow-y-auto">
                  <table className="w-full text-sm" dir="rtl">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-right font-bold text-gray-700">שבוע</th>
                        <th className="px-3 py-2 text-right font-bold text-gray-700">יום</th>
                        <th className="px-3 py-2 text-right font-bold text-gray-700">אימון</th>
                        <th className="px-3 py-2 text-right font-bold text-gray-700">סטטוס</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(weekGroups)
                        .sort(([a], [b]) => Number(a) - Number(b))
                        .map(([week, items]) =>
                          items
                            .sort((a, b) => a.day - b.day)
                            .map((entry, idx) => {
                              const st = STATUS_LABELS[entry.status] ?? { label: entry.status, color: 'bg-gray-100 text-gray-600' };
                              const isCurrent = Number(week) === (prog as any).currentWeek;
                              return (
                                <tr
                                  key={`${week}-${entry.day}-${idx}`}
                                  className={`border-t ${isCurrent ? 'bg-blue-50/40' : ''}`}
                                >
                                  {idx === 0 ? (
                                    <td
                                      rowSpan={items.length}
                                      className={`px-3 py-2 font-bold text-gray-900 align-top ${isCurrent ? 'text-[#5BC2F2]' : ''}`}
                                    >
                                      {week}{isCurrent ? ' ←' : ''}
                                    </td>
                                  ) : null}
                                  <td className="px-3 py-2 text-gray-700">{entry.day}</td>
                                  <td className="px-3 py-2 text-gray-700">
                                    <div className="font-medium">{entry.workoutName || entry.workoutId}</div>
                                    {entry.category && (
                                      <div className="text-xs text-gray-400 mt-0.5">{entry.category}</div>
                                    )}
                                  </td>
                                  <td className="px-3 py-2">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${st.color}`}>
                                      {st.label}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })
                        )}
                    </tbody>
                  </table>
                </div>
                <div className="bg-gray-50 px-3 py-2 text-xs text-gray-500 border-t">
                  סה״כ {schedule.length} אימונים ב-{Object.keys(weekGroups).length} שבועות
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500 bg-gray-50 rounded-xl p-4">
                לוח אימונים ריק — לא נוצרו אימונים בתוכנית.
              </div>
            )}
          </div>
        );
      })() : (
        <div className="bg-gray-50 rounded-xl p-6 text-center">
          <Footprints size={32} className="mx-auto text-gray-300 mb-2" />
          <div className="text-sm text-gray-500 font-medium">
            לא נוצרה תוכנית ריצה פעילה
          </div>
          <div className="text-xs text-gray-400 mt-1">
            No active running program generated
          </div>
        </div>
      )}
    </div>
  );
}
