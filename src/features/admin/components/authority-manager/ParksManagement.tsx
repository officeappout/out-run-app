'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  getParksByAuthority,
  updatePark,
  deletePark,
} from '@/features/admin/services/parks.service';
import {
  getReportsByAuthority,
  updateReportStatus,
} from '@/features/admin/services/maintenance.service';
import { Park, ParkStatus } from '@/types/admin-types';
import { MaintenanceReport, MaintenanceStatus } from '@/types/maintenance.types';
import { Plus, Edit2, Trash2, MapPin, CheckCircle2, AlertCircle, XCircle, Wrench, AlertTriangle } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

interface ParksManagementProps {
  authorityId: string;
}

const STATUS_LABELS: Record<ParkStatus, string> = {
  open: 'פתוח',
  under_repair: 'בתיקון',
  closed: 'סגור',
};

const STATUS_COLORS: Record<ParkStatus, string> = {
  open: 'bg-green-100 text-green-700 border-green-300',
  under_repair: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  closed: 'bg-red-100 text-red-700 border-red-300',
};

const STATUS_ICONS: Record<ParkStatus, any> = {
  open: CheckCircle2,
  under_repair: AlertCircle,
  closed: XCircle,
};

type Tab = 'parks' | 'maintenance';

export default function ParksManagement({ authorityId }: ParksManagementProps) {
  const [parks, setParks] = useState<Park[]>([]);
  const [maintenanceReports, setMaintenanceReports] = useState<MaintenanceReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('parks');
  const [editingStatus, setEditingStatus] = useState<{ parkId: string; status: ParkStatus } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUserId(user?.uid || null);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    loadParks();
    loadMaintenanceReports();
  }, [authorityId]);

  const loadParks = async () => {
    try {
      setLoading(true);
      const data = await getParksByAuthority(authorityId);
      setParks(data);
    } catch (error) {
      console.error('Error loading parks:', error);
      alert('שגיאה בטעינת הפארקים');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (parkId: string, newStatus: ParkStatus) => {
    try {
      // Get current user info
      const user = auth.currentUser;
      if (!user) {
        alert('אין הרשאה לבצע פעולה זו');
        return;
      }

      // Get user profile for admin info
      const { getUserFromFirestore } = await import('@/lib/firestore.service');
      const userProfile = await getUserFromFirestore(user.uid);
      const adminName = userProfile?.core?.name || user.email || 'Unknown';

      await updatePark(
        parkId,
        { status: newStatus },
        { adminId: user.uid, adminName }
      );
      await loadParks();
      setEditingStatus(null);
      
      // Show success message - if it's an edit request, inform user
      const { checkUserRole } = await import('@/features/admin/services/auth.service');
      const roleInfo = await checkUserRole(user.uid);
      if (roleInfo.isAuthorityManager && !roleInfo.isSuperAdmin && !roleInfo.isSystemAdmin) {
        alert('בקשה לעדכון נשלחה לאישור מנהל המערכת');
      } else {
        alert('סטטוס הפארק עודכן בהצלחה');
      }
    } catch (error) {
      console.error('Error updating park status:', error);
      alert('שגיאה בעדכון סטטוס הפארק');
    }
  };

  const loadMaintenanceReports = async () => {
    try {
      const data = await getReportsByAuthority(authorityId);
      setMaintenanceReports(data);
    } catch (error) {
      console.error('Error loading maintenance reports:', error);
    }
  };

  const handleUpdateReportStatus = async (
    reportId: string,
    newStatus: MaintenanceStatus,
    notes?: string
  ) => {
    try {
      await updateReportStatus(reportId, newStatus, currentUserId || undefined, notes);
      await loadMaintenanceReports();
    } catch (error) {
      console.error('Error updating report status:', error);
      alert('שגיאה בעדכון סטטוס הדיווח');
    }
  };

  const handleDelete = async (parkId: string, parkName: string) => {
    if (!confirm(`האם אתה בטוח שברצונך למחוק את הפארק "${parkName}"?`)) return;

    try {
      await deletePark(parkId);
      await loadParks();
    } catch (error) {
      console.error('Error deleting park:', error);
      alert('שגיאה במחיקת הפארק');
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-500">טוען פארקים...</div>;
  }

  const STATUS_LABELS_MAINTENANCE: Record<MaintenanceStatus, string> = {
    reported: 'דווח',
    in_review: 'בבדיקה',
    in_progress: 'בטיפול',
    resolved: 'טופל',
    dismissed: 'נדחה',
  };

  const PRIORITY_COLORS: Record<string, string> = {
    low: 'bg-gray-100 text-gray-700',
    medium: 'bg-yellow-100 text-yellow-700',
    high: 'bg-orange-100 text-orange-700',
    urgent: 'bg-red-100 text-red-700',
  };

  const ISSUE_TYPE_LABELS: Record<string, string> = {
    broken: 'שבור',
    damaged: 'פגום',
    missing: 'חסר',
    unsafe: 'לא בטוח',
    other: 'אחר',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">ניהול פארקים</h2>
        <Link
          href={`/admin/parks/new?authorityId=${authorityId}`}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 transition-colors"
        >
          <Plus size={18} />
          הוסף פארק חדש
        </Link>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 p-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('parks')}
            className={`flex-1 px-4 py-2 rounded-lg font-bold text-sm transition-all ${
              activeTab === 'parks'
                ? 'bg-cyan-500 text-white shadow-md'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            פארקים
          </button>
          <button
            onClick={() => setActiveTab('maintenance')}
            className={`flex-1 px-4 py-2 rounded-lg font-bold text-sm transition-all relative ${
              activeTab === 'maintenance'
                ? 'bg-cyan-500 text-white shadow-md'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            דיווחי תחזוקה
            {maintenanceReports.filter((r) => r.status !== 'resolved' && r.status !== 'dismissed').length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">
                {maintenanceReports.filter((r) => r.status !== 'resolved' && r.status !== 'dismissed').length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Maintenance Reports Tab */}
      {activeTab === 'maintenance' && (
        <div className="space-y-4">
          {maintenanceReports.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
              <Wrench size={48} className="text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-gray-900 mb-2">אין דיווחי תחזוקה</h3>
              <p className="text-gray-500">כל הציוד במצב תקין</p>
            </div>
          ) : (
            <div className="space-y-4">
              {maintenanceReports.map((report) => {
                const park = parks.find((p) => p.id === report.parkId);
                return (
                  <div
                    key={report.id}
                    className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <AlertTriangle
                            size={20}
                            className={
                              report.priority === 'urgent'
                                ? 'text-red-500'
                                : report.priority === 'high'
                                ? 'text-orange-500'
                                : 'text-yellow-500'
                            }
                          />
                          <h3 className="text-lg font-bold text-gray-900">
                            {park?.name || 'פארק לא מזוהה'}
                          </h3>
                          {report.equipmentName && (
                            <span className="text-sm text-gray-600">- {report.equipmentName}</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{report.description}</p>
                        <div className="flex items-center gap-3 flex-wrap">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-bold ${PRIORITY_COLORS[report.priority]}`}
                          >
                            {report.priority === 'urgent'
                              ? 'דחוף'
                              : report.priority === 'high'
                              ? 'גבוה'
                              : report.priority === 'medium'
                              ? 'בינוני'
                              : 'נמוך'}
                          </span>
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700">
                            {ISSUE_TYPE_LABELS[report.issueType]}
                          </span>
                          <span className="text-xs text-gray-500">
                            דווח ב-{new Date(report.reportedAt).toLocaleDateString('he-IL')}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={report.status}
                          onChange={(e) =>
                            handleUpdateReportStatus(
                              report.id,
                              e.target.value as MaintenanceStatus
                            )
                          }
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-bold focus:ring-2 focus:ring-cyan-500"
                        >
                          {Object.entries(STATUS_LABELS_MAINTENANCE).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {report.notes && (
                      <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <p className="text-sm text-gray-700">
                          <strong>הערות:</strong> {report.notes}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Parks Tab */}
      {activeTab === 'parks' && (
        <div>
          {parks.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
          <MapPin size={48} className="text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">אין פארקים</h3>
          <p className="text-gray-500 mb-4">התחל על ידי הוספת הפארק הראשון</p>
          <Link
            href={`/admin/parks/new?authorityId=${authorityId}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 transition-colors"
          >
            <Plus size={18} />
            הוסף פארק חדש
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {parks.map((park) => {
            const StatusIcon = STATUS_ICONS[park.status || 'open'];
            const isEditing = editingStatus?.parkId === park.id;

            return (
              <div
                key={park.id}
                className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow"
              >
                {park.image && (
                  <img
                    src={park.image}
                    alt={park.name}
                    className="w-full h-40 object-cover rounded-lg mb-4"
                  />
                )}
                <div className="space-y-3">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 mb-1">{park.name}</h3>
                    <p className="text-sm text-gray-500">{park.city}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <MapPin size={16} className="text-gray-400" />
                    <span className="text-xs text-gray-600">
                      {park.location.lat.toFixed(4)}, {park.location.lng.toFixed(4)}
                    </span>
                  </div>

                  {/* Status */}
                  {isEditing ? (
                    <div className="space-y-2">
                      <select
                        value={editingStatus?.status || park.status || 'open'}
                        onChange={(e) => {
                          if (editingStatus) {
                            setEditingStatus({ ...editingStatus, status: e.target.value as ParkStatus });
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      >
                        {Object.entries(STATUS_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleStatusChange(park.id, editingStatus.status)}
                          className="flex-1 px-3 py-1.5 bg-cyan-500 text-white rounded-lg text-sm font-bold hover:bg-cyan-600"
                        >
                          שמור
                        </button>
                        <button
                          onClick={() => setEditingStatus(null)}
                          className="flex-1 px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-300"
                        >
                          ביטול
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border ${STATUS_COLORS[park.status || 'open']}`}
                      >
                        <StatusIcon size={14} />
                        {STATUS_LABELS[park.status || 'open']}
                      </div>
                      <button
                        onClick={() => setEditingStatus({ parkId: park.id, status: park.status || 'open' })}
                        className="text-cyan-600 hover:text-cyan-700 text-sm font-bold"
                      >
                        שנה סטטוס
                      </button>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                    <Link
                      href={`/admin/parks/${park.id}`}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-200 transition-colors"
                    >
                      <Edit2 size={16} />
                      ערוך
                    </Link>
                    <button
                      onClick={() => handleDelete(park.id, park.name)}
                      className="flex items-center justify-center gap-2 px-3 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-bold hover:bg-red-100 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
          )}
        </div>
      )}
    </div>
  );
}
