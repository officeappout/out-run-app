'use client';

import { AuthorityPerformance } from '@/features/admin/services/cpo-analytics.service';

interface AuthorityPerformanceTableProps {
  data: AuthorityPerformance[];
  loading?: boolean;
}

export default function AuthorityPerformanceTable({ data, loading }: AuthorityPerformanceTableProps) {
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
      <div className="mb-4 md:mb-6">
        <h3 className="text-lg md:text-xl font-black text-gray-900">ביצועי רשויות</h3>
        <p className="text-xs md:text-sm text-gray-500 mt-1">השוואת ביצועים בין רשויות</p>
      </div>
      <div className="overflow-x-auto -mx-4 md:mx-0">
        <div className="inline-block min-w-full align-middle">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-right py-3 px-3 md:px-4 text-xs md:text-sm font-bold text-gray-700">רשות</th>
                <th className="text-right py-3 px-3 md:px-4 text-xs md:text-sm font-bold text-gray-700">מספר משתמשים</th>
                <th className="text-right py-3 px-3 md:px-4 text-xs md:text-sm font-bold text-gray-700">פארקים פעילים</th>
                <th className="text-right py-3 px-3 md:px-4 text-xs md:text-sm font-bold text-gray-700">ציון מעורבות</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-sm md:text-base text-gray-500">
                    אין נתונים להצגה
                  </td>
                </tr>
              ) : (
                data.map((authority) => (
                  <tr key={authority.authorityId} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-3 md:px-4 text-xs md:text-sm font-bold text-gray-900">{authority.authorityName}</td>
                    <td className="py-3 px-3 md:px-4 text-xs md:text-sm text-gray-700">{authority.userCount.toLocaleString('he-IL')}</td>
                    <td className="py-3 px-3 md:px-4 text-xs md:text-sm text-gray-700">{authority.activeParks}</td>
                    <td className="py-3 px-3 md:px-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs md:text-sm font-bold text-gray-900">{authority.engagementScore.toFixed(1)}</span>
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden max-w-[100px]">
                          <div
                            className="h-full bg-cyan-500 rounded-full transition-all"
                            style={{ width: `${Math.min((authority.engagementScore / 10) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>
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
