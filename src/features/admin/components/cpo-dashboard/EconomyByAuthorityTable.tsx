'use client';

import { Coins } from 'lucide-react';

export interface EconomyByAuthorityRow {
  authorityId: string;
  authorityName: string;
  coinsBalance: number;
  coinsEarned7d: number;
}

interface EconomyByAuthorityTableProps {
  data: EconomyByAuthorityRow[];
  loading?: boolean;
}

export default function EconomyByAuthorityTable({ data, loading }: EconomyByAuthorityTableProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="h-6 bg-gray-200 rounded w-48 mb-4 animate-pulse"></div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-gray-100 rounded animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
      <div className="mb-4 md:mb-6 flex items-center gap-2">
        <Coins size={20} className="text-yellow-500" />
        <div>
          <h3 className="text-lg md:text-xl font-black text-gray-900">כלכלה לפי רשות</h3>
          <p className="text-xs md:text-sm text-gray-500 mt-1">יתרת מטבעות ורווח ב-7 ימים אחרונים</p>
        </div>
      </div>
      <div className="overflow-x-auto -mx-4 md:mx-0">
        <div className="inline-block min-w-full align-middle">
          <table className="w-full min-w-[480px]">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-right py-3 px-3 md:px-4 text-xs md:text-sm font-bold text-gray-700">רשות</th>
                <th className="text-right py-3 px-3 md:px-4 text-xs md:text-sm font-bold text-gray-700">יתרת מטבעות</th>
                <th className="text-right py-3 px-3 md:px-4 text-xs md:text-sm font-bold text-gray-700">הורווחו ב-7 ימים</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-center py-8 text-sm md:text-base text-gray-500">
                    אין נתונים להצגה
                  </td>
                </tr>
              ) : (
                data.map((row) => (
                  <tr key={row.authorityId} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-3 md:px-4 text-xs md:text-sm font-bold text-gray-900">{row.authorityName}</td>
                    <td className="py-3 px-3 md:px-4 text-xs md:text-sm text-gray-700">{row.coinsBalance.toLocaleString('he-IL')}</td>
                    <td className="py-3 px-3 md:px-4 text-xs md:text-sm font-bold text-yellow-700">+{row.coinsEarned7d.toLocaleString('he-IL')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
