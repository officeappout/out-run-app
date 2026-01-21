'use client';

import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { MaintenanceReport } from '@/types/maintenance.types';
import { getAllAuthorities } from '@/features/admin/services/authority.service';
import { useState, useEffect } from 'react';

interface MaintenanceOverviewProps {
  reports: MaintenanceReport[];
  loading?: boolean;
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  low: 'bg-blue-100 text-blue-700 border-blue-200',
};

const PRIORITY_LABELS: Record<string, string> = {
  high: 'גבוה',
  medium: 'בינוני',
  low: 'נמוך',
};

const STATUS_LABELS: Record<string, string> = {
  reported: 'דווח',
  in_progress: 'בטיפול',
  resolved: 'נפתר',
  dismissed: 'נדחה',
};

export default function MaintenanceOverview({ reports, loading }: MaintenanceOverviewProps) {
  const [authorities, setAuthorities] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    getAllAuthorities().then((auths) => {
      const map = new Map<string, string>();
      auths.forEach((auth) => {
        map.set(auth.id, auth.name);
      });
      setAuthorities(map);
    });
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="h-6 bg-gray-200 rounded w-48 mb-4 animate-pulse"></div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-100 rounded animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle size={20} className="text-red-500" />
          <h3 className="text-xl font-black text-gray-900">סקירת תחזוקה גלובלית</h3>
        </div>
        <p className="text-sm text-gray-500">
          {reports.length} דיווחים לא פתורים ב-{new Set(reports.map((r) => r.authorityId)).size} רשויות
        </p>
      </div>
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {reports.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Info size={48} className="mx-auto mb-4 text-gray-400" />
            <p>אין דיווחי תחזוקה לא פתורים</p>
          </div>
        ) : (
          reports.map((report) => (
            <div
              key={report.id}
              className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold text-gray-900">
                      {authorities.get(report.authorityId) || report.authorityId}
                    </span>
                    {report.equipmentName && (
                      <span className="text-sm text-gray-500">• {report.equipmentName}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 mb-2">{report.description || 'ללא תיאור'}</p>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{new Date(report.reportedAt).toLocaleDateString('he-IL')}</span>
                    <span>•</span>
                    <span>{STATUS_LABELS[report.status] || report.status}</span>
                  </div>
                </div>
                <div
                  className={`px-3 py-1 rounded-full text-xs font-bold border ${PRIORITY_COLORS[report.priority] || PRIORITY_COLORS.medium}`}
                >
                  {PRIORITY_LABELS[report.priority] || report.priority}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
