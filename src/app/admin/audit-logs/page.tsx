'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { getAuditLogs, AuditLog } from '@/features/admin/services/audit.service';
import { Search, Calendar, Filter, User, FileText, AlertCircle } from 'lucide-react';

export default function AuditLogsPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  
  // Filters
  const [adminNameFilter, setAdminNameFilter] = useState('');
  const [actionTypeFilter, setActionTypeFilter] = useState<string>('');
  const [targetEntityFilter, setTargetEntityFilter] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Check if user is super admin
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/admin/authority-login');
        return;
      }

      try {
        const roleInfo = await checkUserRole(user.uid);
        if (!roleInfo.isSuperAdmin) {
          // Not a super admin, redirect to dashboard
          router.push('/admin');
          return;
        }
        setIsAuthorized(true);
        loadLogs();
      } catch (error) {
        console.error('Error checking authorization:', error);
        router.push('/admin');
      } finally {
        setCheckingAuth(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const options: any = {};
      
      if (adminNameFilter.trim()) {
        options.adminName = adminNameFilter.trim();
      }
      if (actionTypeFilter) {
        options.actionType = actionTypeFilter;
      }
      if (targetEntityFilter) {
        options.targetEntity = targetEntityFilter;
      }
      if (startDate) {
        options.startDate = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999); // End of day
        options.endDate = end;
      }
      
      const data = await getAuditLogs(options);
      setLogs(data);
    } catch (error) {
      console.error('Error loading audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      loadLogs();
    }
  }, [adminNameFilter, actionTypeFilter, targetEntityFilter, startDate, endDate, isAuthorized]);

  const getActionTypeColor = (actionType: string) => {
    switch (actionType) {
      case 'CREATE':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'UPDATE':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'DELETE':
        return 'bg-red-100 text-red-700 border-red-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getEntityColor = (entity: string) => {
    const colors: Record<string, string> = {
      Exercise: 'text-purple-600',
      Park: 'text-green-600',
      Authority: 'text-blue-600',
      Admin: 'text-orange-600',
      User: 'text-cyan-600',
      Program: 'text-pink-600',
      Level: 'text-indigo-600',
      Questionnaire: 'text-yellow-600',
    };
    return colors[entity] || 'text-gray-600';
  };

  if (checkingAuth) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">בודק הרשאות...</div>
      </div>
    );
  }

  if (!isAuthorized) {
    return null; // Will redirect
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black text-gray-900">יומן ביקורת</h1>
        <p className="text-gray-500 mt-2">תיעוד כל הפעולות שבוצעו על ידי מנהלי המערכת</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={20} className="text-gray-600" />
          <h2 className="text-lg font-bold text-gray-900">סינון</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Admin Name Filter */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">שם מנהל</label>
            <div className="relative">
              <User size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={adminNameFilter}
                onChange={(e) => setAdminNameFilter(e.target.value)}
                placeholder="חפש לפי שם..."
                className="w-full pr-10 pl-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
              />
            </div>
          </div>

          {/* Action Type Filter */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">סוג פעולה</label>
            <select
              value={actionTypeFilter}
              onChange={(e) => setActionTypeFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
            >
              <option value="">הכל</option>
              <option value="CREATE">יצירה</option>
              <option value="UPDATE">עדכון</option>
              <option value="DELETE">מחיקה</option>
            </select>
          </div>

          {/* Target Entity Filter */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">סוג ישות</label>
            <select
              value={targetEntityFilter}
              onChange={(e) => setTargetEntityFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
            >
              <option value="">הכל</option>
              <option value="Exercise">תרגיל</option>
              <option value="Park">פארק</option>
              <option value="Authority">רשות</option>
              <option value="Admin">מנהל</option>
              <option value="User">משתמש</option>
              <option value="Program">תוכנית</option>
              <option value="Level">רמה</option>
              <option value="Questionnaire">שאלון</option>
            </select>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">מתאריך</label>
            <div className="relative">
              <Calendar size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full pr-10 pl-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
                dir="ltr"
              />
            </div>
          </div>

          {/* End Date */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">עד תאריך</label>
            <div className="relative">
              <Calendar size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full pr-10 pl-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
                dir="ltr"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Audit Logs Table */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">יומן פעולות</h2>
          <span className="text-sm text-gray-500">{logs.length} רשומות</span>
        </div>
        {loading ? (
          <div className="text-center py-8 text-gray-500">טוען...</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <AlertCircle size={48} className="mx-auto mb-4 text-gray-400" />
            <p>לא נמצאו רשומות</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-right py-3 px-4 text-sm font-bold text-gray-700">תאריך ושעה</th>
                  <th className="text-right py-3 px-4 text-sm font-bold text-gray-700">מנהל</th>
                  <th className="text-right py-3 px-4 text-sm font-bold text-gray-700">סוג פעולה</th>
                  <th className="text-right py-3 px-4 text-sm font-bold text-gray-700">ישות</th>
                  <th className="text-right py-3 px-4 text-sm font-bold text-gray-700">פרטים</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4 text-sm text-gray-700">
                      {new Date(log.timestamp).toLocaleString('he-IL', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <User size={16} className="text-gray-400" />
                        <span className="font-bold text-gray-900">{log.adminName}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold border ${getActionTypeColor(log.actionType)}`}
                      >
                        {log.actionType === 'CREATE' ? 'יצירה' : log.actionType === 'UPDATE' ? 'עדכון' : 'מחיקה'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-sm font-bold ${getEntityColor(log.targetEntity)}`}>
                        {log.targetEntity}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-start gap-2 max-w-md">
                        <FileText size={16} className="text-gray-400 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-gray-700">{log.details}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
