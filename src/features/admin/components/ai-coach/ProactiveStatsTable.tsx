'use client';

/** Proactive Kelly sends per day, by trigger (ai_coach_proactive_stats, last 14 days). */
import React from 'react';
import { TRIGGER_LABEL_HE } from './proactive-api';

export interface ProactiveStatsRow {
  day: string;
  total: number;
  sent: Record<string, number>;
  silent: number;
  llm: number;
  tests: number;
}

const TRIGGERS = Object.keys(TRIGGER_LABEL_HE);

export default function ProactiveStatsTable({ rows }: { rows: ProactiveStatsRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-gray-500">עוד לא נשלחו הודעות יזומות.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-right text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500">
          <tr>
            <th className="px-3 py-2">יום</th>
            <th className="px-3 py-2">סה״כ</th>
            {TRIGGERS.map((t) => (
              <th key={t} className="px-3 py-2">{TRIGGER_LABEL_HE[t]}</th>
            ))}
            <th className="px-3 py-2">בלי התראה</th>
            <th className="px-3 py-2">משפט AI</th>
            <th className="px-3 py-2">בדיקות</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.day} className="border-t border-gray-100">
              <td className="px-3 py-2 font-mono text-xs">{r.day}</td>
              <td className="px-3 py-2 font-bold">{r.total}</td>
              {TRIGGERS.map((t) => (
                <td key={t} className="px-3 py-2">{r.sent?.[t] ?? 0}</td>
              ))}
              <td className="px-3 py-2">{r.silent}</td>
              <td className="px-3 py-2">{r.llm}</td>
              <td className="px-3 py-2">{r.tests}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
