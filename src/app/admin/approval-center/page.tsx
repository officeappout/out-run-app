'use client';

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { checkUserRole } from '@/features/admin/services/auth.service';
import {
  getAllEditRequests,
  approveEditRequest,
  rejectEditRequest,
  type EditRequest,
  type EditRequestStatus,
} from '@/features/admin/services/edit-requests.service';
import { getUserFromFirestore } from '@/lib/firestore.service';
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Loader2,
  Eye,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export default function ApprovalCenterPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<EditRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<EditRequestStatus | 'all'>('pending');
  const [expandedRequest, setExpandedRequest] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [adminName, setAdminName] = useState<string>('');
  const [reviewNote, setReviewNote] = useState<string>('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/admin/login');
        return;
      }

      try {
        const roleInfo = await checkUserRole(user.uid);
        
        // Only super_admin and system_admin can access
        if (!roleInfo.isSuperAdmin && !roleInfo.isSystemAdmin) {
          router.push('/admin');
          return;
        }

        // Get admin name
        const userProfile = await getUserFromFirestore(user.uid);
        setAdminName(userProfile?.core?.name || user.email || 'Unknown');

        loadRequests();
      } catch (error) {
        console.error('Error checking authorization:', error);
        router.push('/admin');
      }
    });

    return () => unsubscribe();
  }, [router]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const data = statusFilter === 'all'
        ? await getAllEditRequests()
        : await getAllEditRequests(statusFilter as EditRequestStatus);
      setRequests(data);
    } catch (error) {
      console.error('Error loading edit requests:', error);
      alert('שגיאה בטעינת הבקשות');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (adminName) {
      loadRequests();
    }
  }, [statusFilter, adminName]);

  const handleApprove = async (requestId: string) => {
    if (!confirm('האם אתה בטוח שברצונך לאשר את הבקשה?')) return;

    try {
      setProcessingId(requestId);
      await approveEditRequest(
        requestId,
        {
          adminId: auth.currentUser?.uid || '',
          adminName,
        },
        reviewNote || undefined
      );
      setReviewNote('');
      await loadRequests();
      alert('הבקשה אושרה בהצלחה');
    } catch (error) {
      console.error('Error approving request:', error);
      alert('שגיאה באישור הבקשה');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    const note = prompt('הזן הערה לדחייה (אופציונלי):');
    if (note === null) return; // User cancelled

    try {
      setProcessingId(requestId);
      await rejectEditRequest(
        requestId,
        {
          adminId: auth.currentUser?.uid || '',
          adminName,
        },
        note || undefined
      );
      setReviewNote('');
      await loadRequests();
      alert('הבקשה נדחתה');
    } catch (error) {
      console.error('Error rejecting request:', error);
      alert('שגיאה בדחיית הבקשה');
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusIcon = (status: EditRequestStatus) => {
    switch (status) {
      case 'approved':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'rejected':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-600" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-600" />;
    }
  };

  const getStatusLabel = (status: EditRequestStatus) => {
    switch (status) {
      case 'approved':
        return 'אושר';
      case 'rejected':
        return 'נדחה';
      case 'pending':
        return 'ממתין';
      default:
        return 'לא ידוע';
    }
  };

  const getStatusColor = (status: EditRequestStatus) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-700 border-green-300';
      case 'rejected':
        return 'bg-red-100 text-red-700 border-red-300';
      case 'pending':
        return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('he-IL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getFieldLabel = (key: string): string => {
    const labels: Record<string, string> = {
      name: 'שם',
      city: 'עיר',
      description: 'תיאור',
      location: 'מיקום',
      image: 'תמונה',
      facilities: 'מתקנים',
      gymEquipment: 'ציוד כושר',
      amenities: 'שירותים',
      authorityId: 'רשות',
      status: 'סטטוס',
      distance: 'מרחק',
      duration: 'משך',
      path: 'מסלול',
      type: 'סוג',
      activityType: 'סוג פעילות',
      difficulty: 'קושי',
    };
    return labels[key] || key;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-cyan-600 animate-spin" />
        <span className="ml-3 text-gray-600">טוען בקשות...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-gray-900">מרכז אישורים</h1>
          <p className="text-xs md:text-sm text-gray-500 mt-1">ניהול בקשות עריכה מנציגי רשויות</p>
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <label className="text-xs md:text-sm font-bold text-gray-700 whitespace-nowrap">סטטוס:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as EditRequestStatus | 'all')}
            className="flex-1 sm:flex-none px-3 md:px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none font-bold text-xs md:text-sm"
          >
            <option value="all">הכל</option>
            <option value="pending">ממתין</option>
            <option value="approved">אושר</option>
            <option value="rejected">נדחה</option>
          </select>
        </div>
      </div>

      {/* Requests List */}
      {requests.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-12 text-center">
          <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">אין בקשות</h3>
          <p className="text-gray-500">אין בקשות עריכה ממתינות לאישור</p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => {
            const isExpanded = expandedRequest === request.id;
            const isProcessing = processingId === request.id;

            return (
              <div
                key={request.id}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
              >
                {/* Request Header */}
                <div className="p-4 md:p-6">
                  <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                    <div className="flex-1 w-full">
                      <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-2">
                        <div className={`px-2 md:px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-2 ${getStatusColor(request.status)}`}>
                          {getStatusIcon(request.status)}
                          {getStatusLabel(request.status)}
                        </div>
                        <span className="px-2 md:px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200">
                          {request.entityType === 'park' ? 'פארק' : 'מסלול'}
                        </span>
                        <h3 className="text-base md:text-lg font-bold text-gray-900 break-words">{request.entityName}</h3>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs md:text-sm text-gray-600 mt-3">
                        <span>
                          <strong>נשלח על ידי:</strong> {request.requestedByName || request.requestedByEmail || 'לא ידוע'}
                        </span>
                        {request.authorityId && (
                          <span>
                            <strong>רשות:</strong> {request.authorityId}
                          </span>
                        )}
                        <span>
                          <strong>תאריך:</strong> {formatDate(request.createdAt)}
                        </span>
                      </div>

                      {request.reviewedBy && (
                        <div className="mt-3 text-sm text-gray-600">
                          <strong>נבדק על ידי:</strong> {request.reviewedByName || request.reviewedBy}
                          {request.reviewedAt && ` ב-${formatDate(request.reviewedAt)}`}
                          {request.reviewNote && (
                            <div className="mt-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
                              <strong>הערה:</strong> {request.reviewNote}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      {request.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleApprove(request.id)}
                            disabled={isProcessing}
                            className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-xl font-bold hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isProcessing ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4" />
                            )}
                            אישור
                          </button>
                          <button
                            onClick={() => handleReject(request.id)}
                            disabled={isProcessing}
                            className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isProcessing ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <XCircle className="w-4 h-4" />
                            )}
                            דחייה
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => setExpandedRequest(isExpanded ? null : request.id)}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5" />
                        ) : (
                          <ChevronDown className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded View - Before/After Comparison */}
                {isExpanded && (
                  <div className="border-t border-gray-200 p-6 bg-gray-50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Before */}
                      <div className="bg-white rounded-xl p-4 border-2 border-gray-200">
                        <h4 className="text-sm font-bold text-gray-700 mb-4 pb-2 border-b border-gray-200">
                          לפני
                        </h4>
                        <div className="space-y-3 text-sm max-h-96 overflow-y-auto">
                          {Object.entries(request.originalData).map(([key, value]) => {
                            const hasChange = JSON.stringify(value) !== JSON.stringify(request.newData[key]);
                            if (key === 'id' || key === 'createdAt' || key === 'updatedAt') return null;
                            
                            // Only show changed fields for cleaner view
                            if (!hasChange && request.status === 'pending') return null;
                            
                            return (
                              <div key={key} className={hasChange ? 'bg-yellow-50 p-2 rounded border border-yellow-200' : 'p-2'}>
                                <strong className="text-gray-700">{getFieldLabel(key)}:</strong>
                                <div className="text-gray-600 mt-1">
                                  {typeof value === 'object' && value !== null ? (
                                    <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto max-h-32 border border-gray-200">
                                      {JSON.stringify(value, null, 2)}
                                    </pre>
                                  ) : (
                                    <span className={hasChange ? 'font-bold text-yellow-700' : ''}>
                                      {String(value || 'לא מוגדר')}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* After */}
                      <div className="bg-white rounded-xl p-4 border-2 border-green-300">
                        <h4 className="text-sm font-bold text-gray-700 mb-4 pb-2 border-b border-gray-200">
                          אחרי (הצעה)
                        </h4>
                        <div className="space-y-3 text-sm max-h-96 overflow-y-auto">
                          {Object.entries(request.newData).map(([key, value]) => {
                            const hasChange = JSON.stringify(request.originalData[key]) !== JSON.stringify(value);
                            if (key === 'id' || key === 'createdAt' || key === 'updatedAt') return null;
                            
                            // Only show changed fields for cleaner view
                            if (!hasChange && request.status === 'pending') return null;
                            
                            return (
                              <div key={key} className={hasChange ? 'bg-green-50 p-2 rounded border border-green-300' : 'p-2'}>
                                <strong className="text-gray-700">{getFieldLabel(key)}:</strong>
                                <div className="text-gray-600 mt-1">
                                  {typeof value === 'object' && value !== null ? (
                                    <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto max-h-32 border border-gray-200">
                                      {JSON.stringify(value, null, 2)}
                                    </pre>
                                  ) : (
                                    <span className={hasChange ? 'font-bold text-green-700' : ''}>
                                      {String(value || 'לא מוגדר')}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    
                    {request.status === 'pending' && (
                      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm text-blue-800">
                          <strong>הערה:</strong> רק השדות המסומנים בשינוי מוצגים. שאר השדות נשארים ללא שינוי.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
