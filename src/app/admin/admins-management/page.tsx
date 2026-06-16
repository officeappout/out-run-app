'use client';

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import {
  getAllSuperAdmins,
  getPendingUsers,
  getUserByEmail,
  approveUser,
  rejectAdminRequest,
  promoteToSuperAdmin,
  revokeSuperAdmin,
  updateAdminProfile,
  AdminUser,
} from '@/features/admin/services/admin-management.service';
import {
  getAllInvitations,
  deleteInvitationById,
} from '@/features/admin/services/invitation.service';
import type { AdminInvitation } from '@/types/invitation.type';
import { isRootAdmin } from '@/config/feature-flags';
import { getAllAuthorities, getAuthoritiesGrouped } from '@/features/admin/services/authority.service';
import InviteMemberModal from '@/features/admin/components/InviteMemberModal';
import { Shield, Search, UserPlus, X, Mail, AlertCircle, Trash2, Ban, Pencil, Copy, Check, Clock, ExternalLink } from 'lucide-react';
import { Authority } from '@/types/admin-types';
import { deleteUser } from '@/features/admin/services/users.service';
import { logAction } from '@/features/admin/services/audit.service';
import { usePagination } from '@/features/admin/hooks/usePagination';
import Pagination from '@/features/admin/components/shared/Pagination';

export default function AdminsManagementPage() {
  const router = useRouter();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [pendingUsers, setPendingUsers] = useState<AdminUser[]>([]);
  const [activeTab, setActiveTab] = useState<'admins' | 'pending' | 'invitations'>('pending');
  const [pendingInvitations, setPendingInvitations] = useState<AdminInvitation[]>([]);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [deletingInviteId, setDeletingInviteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchEmail, setSearchEmail] = useState('');
  const [searchResult, setSearchResult] = useState<AdminUser | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  
  // Invitation / edit state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<AdminUser | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [authorities, setAuthorities] = useState<Authority[]>([]);
  const [groupedAuthorities, setGroupedAuthorities] = useState<{
    regionalCouncils: (Authority & { settlements: Authority[] })[];
    standaloneAuthorities: Authority[];
  } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [deletingAdminId, setDeletingAdminId] = useState<string | null>(null);

  // Pagination for pending users
  const pendingPagination = usePagination(pendingUsers, 10);
  // Pagination for admins
  const adminsPagination = usePagination(admins, 10);

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
        setCurrentUserId(user.uid);
        setCurrentUserEmail(user.email || '');
        setIsAuthorized(true);
        loadAdmins();
        loadAuthorities();
        loadInvitations();
      } catch (error) {
        console.error('Error checking authorization:', error);
        router.push('/admin');
      } finally {
        setCheckingAuth(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  const loadAuthorities = async () => {
    try {
      const data = await getAllAuthorities();
      setAuthorities(data);
      
      // Also load grouped data for hierarchical dropdown
      const grouped = await getAuthoritiesGrouped();
      setGroupedAuthorities(grouped);
    } catch (error) {
      console.error('Error loading authorities:', error);
    }
  };

  const loadAdmins = async () => {
    try {
      setLoading(true);
      const [adminsData, pendingData] = await Promise.all([
        getAllSuperAdmins(),
        getPendingUsers(),
      ]);
      setAdmins(adminsData);
      setPendingUsers(pendingData);
    } catch (error) {
      console.error('Error loading admins:', error);
      setError('שגיאה בטעינת רשימת המנהלים');
    } finally {
      setLoading(false);
    }
  };

  const loadInvitations = async () => {
    try {
      const all = await getAllInvitations();
      const now = new Date();
      setPendingInvitations(all.filter(inv => !inv.isUsed && inv.expiresAt > now));
    } catch (error) {
      console.error('Error loading invitations:', error);
    }
  };

  const inviteLink = (token: string) =>
    `${typeof window !== 'undefined' ? window.location.origin : ''}/admin/authority-login?token=${token}`;

  const handleCopyInviteLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(inviteLink(token));
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch { /* clipboard blocked */ }
  };

  const handleDeleteInvitation = async (inv: AdminInvitation) => {
    if (!confirm(`האם לבטל את ההזמנה ל-${inv.email}?`)) return;
    try {
      setDeletingInviteId(inv.id);
      const adminInfo = await getCurrentAdminInfo();
      await deleteInvitationById(inv.id, {
        adminId: adminInfo?.adminId || '',
        adminName: adminInfo?.adminName || '',
        adminEmail: currentUserEmail,
      });
      await loadInvitations();
      setSuccess('ההזמנה בוטלה');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Error deleting invitation:', err);
      setError('שגיאה בביטול ההזמנה');
    } finally {
      setDeletingInviteId(null);
    }
  };

  const handleSearch = async () => {
    if (!searchEmail.trim()) {
      setError('אנא הזן כתובת אימייל');
      return;
    }

    setSearching(true);
    setError('');
    setSearchResult(null);

    try {
      const user = await getUserByEmail(searchEmail.trim());
      if (user) {
        setSearchResult(user);
      } else {
        setError('משתמש לא נמצא');
      }
    } catch (error) {
      console.error('Error searching user:', error);
      setError('שגיאה בחיפוש משתמש');
    } finally {
      setSearching(false);
    }
  };

  const getCurrentAdminInfo = async () => {
    const user = auth.currentUser;
    if (!user) return undefined;
    
    try {
      const { getUserFromFirestore } = await import('@/lib/firestore.service');
      const profile = await getUserFromFirestore(user.uid);
      return {
        adminId: user.uid,
        adminName: profile?.core?.name || user.displayName || 'Unknown Admin',
        adminEmail: user.email || profile?.core?.email || '',
      };
    } catch (error) {
      return {
        adminId: user.uid,
        adminName: user.displayName || 'Unknown Admin',
        adminEmail: user.email || '',
      };
    }
  };

  const handleApprove = async (userId: string) => {
    try {
      const adminInfo = await getCurrentAdminInfo();
      await approveUser(userId, adminInfo);
      setSuccess('המשתמש אושר בהצלחה');
      await loadAdmins();
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Error approving user:', error);
      setError('שגיאה באישור המשתמש');
    }
  };

  const handleReject = async (userId: string, userName: string) => {
    if (!confirm(`האם אתה בטוח שברצונך לדחות את בקשת המנהל של "${userName}"?\n\nהמשתמש יוסר מרשימת הממתינים ויועבר למשתמש רגיל.`)) {
      return;
    }

    try {
      const adminInfo = await getCurrentAdminInfo();
      await rejectAdminRequest(userId, adminInfo);
      setSuccess(`בקשת המנהל של "${userName}" נדחתה בהצלחה`);
      await loadAdmins(); // Refresh the list to remove the rejected user
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Error rejecting admin request:', error);
      setError('שגיאה בדחיית הבקשה');
    }
  };

  const handlePromote = async (userId: string) => {
    try {
      const adminInfo = await getCurrentAdminInfo();
      await promoteToSuperAdmin(userId, adminInfo);
      setSuccess('המשתמש קודם למנהל מערכת בהצלחה');
      setSearchResult(null);
      setSearchEmail('');
      await loadAdmins();
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Error promoting user:', error);
      setError('שגיאה בקידום המשתמש');
    }
  };

  const handleRevoke = async (userId: string) => {
    if (!confirm('האם אתה בטוח שברצונך להסיר הרשאות מנהל מערכת מהמשתמש?')) {
      return;
    }

    try {
      const adminInfo = await getCurrentAdminInfo();
      await revokeSuperAdmin(userId, adminInfo);
      setSuccess('הרשאות מנהל מערכת הוסרו בהצלחה');
      await loadAdmins();
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Error revoking admin:', error);
      setError('שגיאה בהסרת הרשאות');
    }
  };

  const handleDelete = async (adminId: string, adminName: string) => {
    // Safety check: Prevent deleting yourself
    if (adminId === currentUserId) {
      setError('לא ניתן למחוק את עצמך');
      setTimeout(() => setError(''), 3000);
      return;
    }

    if (!confirm(`האם אתה בטוח שברצונך למחוק את המנהל "${adminName}"? פעולה זו אינה ניתנת לביטול.`)) {
      return;
    }

    try {
      setDeletingAdminId(adminId);
      setError('');
      
      const adminInfo = await getCurrentAdminInfo();
      if (!adminInfo) {
        setError('שגיאה: לא ניתן לזהות את המנהל');
        return;
      }

      // Delete admin user
      await deleteUser(adminId);

      // Log audit action
      await logAction({
        adminId: adminInfo.adminId,
        adminName: adminInfo.adminName,
        actionType: 'DELETE',
        targetEntity: 'Admin',
        targetId: adminId,
        details: `Deleted admin: ${adminName}`,
      });

      // Reload admins
      await loadAdmins();
      setSuccess(`המנהל "${adminName}" נמחק בהצלחה`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Error deleting admin:', error);
      setError('שגיאה במחיקת המנהל');
    } finally {
      setDeletingAdminId(null);
    }
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
        <h1 className="text-3xl font-black text-gray-900">ניהול מנהלי מערכת</h1>
        <p className="text-gray-500 mt-2">ניהול הרשאות מנהלי מערכת ואישור משתמשים חדשים</p>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
          <Shield size={20} className="text-green-600" />
          <p className="text-sm text-green-800">{success}</p>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle size={20} className="text-red-600" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Invite New Admin Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">הזמן מנהל חדש</h2>
        <button
          onClick={() => setShowInviteModal(true)}
          className="w-full px-6 py-3 bg-cyan-600 text-white rounded-xl font-bold hover:bg-cyan-700 transition-colors flex items-center justify-center gap-2"
        >
          <UserPlus size={18} />
          פתח טופס הזמנה
        </button>
      </div>

      <InviteMemberModal
        isOpen={showInviteModal}
        onClose={() => {
          setShowInviteModal(false);
          setEditingAdmin(null);
        }}
        context={{}}
        callerInfo={{
          adminId: currentUserId || '',
          adminName: 'Admin',
          adminEmail: currentUserEmail,
        }}
        editTarget={editingAdmin ?? undefined}
        onEdit={editingAdmin ? async (updates) => {
          const adminInfo = await getCurrentAdminInfo();
          await updateAdminProfile(editingAdmin.id, updates, adminInfo ?? undefined);
        } : undefined}
        onSuccess={() => {
          const isEdit = editingAdmin !== null;
          if (isEdit) {
            // Edit: close immediately, no link to display
            setSuccess('הפרטים עודכנו בהצלחה');
            setShowInviteModal(false);
            setEditingAdmin(null);
            loadAdmins();
          } else {
            // Create: keep modal open so admin sees the link; switch to invitations tab
            setSuccess('קישור הזמנה נוצר — שלח אותו למוזמן ידנית');
            setActiveTab('invitations');
            loadInvitations();
          }
          setTimeout(() => setSuccess(''), 5000);
        }}
      />

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 p-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('invitations')}
            className={`flex-1 px-4 py-2 rounded-lg font-bold text-sm transition-all relative ${
              activeTab === 'invitations'
                ? 'bg-cyan-500 text-white shadow-md'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            הזמנות ממתינות
            {pendingInvitations.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 text-white rounded-full text-xs flex items-center justify-center">
                {pendingInvitations.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`flex-1 px-4 py-2 rounded-lg font-bold text-sm transition-all relative ${
              activeTab === 'pending'
                ? 'bg-cyan-500 text-white shadow-md'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            ממתינים לאישור
            {pendingUsers.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">
                {pendingUsers.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('admins')}
            className={`flex-1 px-4 py-2 rounded-lg font-bold text-sm transition-all ${
              activeTab === 'admins'
                ? 'bg-cyan-500 text-white shadow-md'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            מנהלים פעילים
          </button>
        </div>
      </div>

      {/* Invitations Tab */}
      {activeTab === 'invitations' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 min-h-[600px]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">הזמנות ממתינות</h2>
            <p className="text-sm text-gray-500">הזמנות שנוצרו אך טרם נוצלו (תוקף 7 ימים)</p>
          </div>
          {pendingInvitations.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Mail size={48} className="mx-auto mb-4 text-gray-400" />
              <p>אין הזמנות ממתינות</p>
              <p className="text-xs mt-2 text-gray-400">לחץ "פתח טופס הזמנה" כדי ליצור הזמנה חדשה</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-right py-3 px-3 text-sm font-bold text-gray-700">אימייל</th>
                    <th className="text-right py-3 px-3 text-sm font-bold text-gray-700">תפקיד</th>
                    <th className="text-right py-3 px-3 text-sm font-bold text-gray-700">נוצר</th>
                    <th className="text-right py-3 px-3 text-sm font-bold text-gray-700">פג תוקף</th>
                    <th className="text-right py-3 px-3 text-sm font-bold text-gray-700">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingInvitations.map((inv) => {
                    const daysLeft = Math.ceil((inv.expiresAt.getTime() - Date.now()) / 86400000);
                    const roleLabelMap: Record<string, string> = {
                      super_admin: 'מנהל-על',
                      vertical_admin: `מנהל ורטיקל (${inv.managedVertical === 'military' ? 'צבאי' : inv.managedVertical === 'educational' ? 'חינוכי' : 'עירוני'})`,
                      authority_manager: 'מנהל רשות',
                      unit_admin: 'מנהל יחידה',
                      tenant_owner: 'בעל ארגון',
                    };
                    return (
                      <tr key={inv.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-3 text-sm text-gray-900 font-medium" dir="ltr">{inv.email}</td>
                        <td className="py-3 px-3">
                          <span className={[
                            'px-2 py-0.5 rounded-full text-xs font-bold',
                            inv.role === 'super_admin' ? 'bg-cyan-100 text-cyan-700' :
                            inv.role === 'vertical_admin' ? 'bg-amber-100 text-amber-700' :
                            'bg-gray-100 text-gray-600',
                          ].join(' ')}>
                            {roleLabelMap[inv.role] ?? inv.role}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-xs text-gray-500">
                          {inv.createdAt.toLocaleDateString('he-IL')}
                        </td>
                        <td className="py-3 px-3">
                          <span className={`flex items-center gap-1 text-xs font-medium ${daysLeft <= 1 ? 'text-red-600' : daysLeft <= 3 ? 'text-amber-600' : 'text-gray-500'}`}>
                            <Clock size={12} />
                            {daysLeft <= 0 ? 'פג תוקף' : `${daysLeft} ימים`}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleCopyInviteLink(inv.token)}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-cyan-50 text-cyan-700 rounded-lg text-xs font-bold hover:bg-cyan-100 transition-colors"
                              title="העתק קישור הזמנה"
                            >
                              {copiedToken === inv.token ? <Check size={13} /> : <Copy size={13} />}
                              {copiedToken === inv.token ? 'הועתק!' : 'העתק'}
                            </button>
                            <a
                              href={`mailto:${inv.email}?subject=${encodeURIComponent('הזמנה לניהול OUT')}&body=${encodeURIComponent(`שלום,\n\nהוזמנת לניהול מערכת OUT.\nלחץ על הקישור להתחברות:\n${inviteLink(inv.token)}\n\nהקישור תקף ל-${daysLeft} ימים.`)}`}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors"
                              title="שלח במייל"
                            >
                              <ExternalLink size={13} />
                              שלח
                            </a>
                            <button
                              onClick={() => handleDeleteInvitation(inv)}
                              disabled={deletingInviteId === inv.id}
                              className="p-1.5 hover:bg-red-100 rounded-lg transition-colors text-red-500 disabled:opacity-50"
                              title="בטל הזמנה"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Pending Users Tab */}
      {activeTab === 'pending' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 min-h-[600px]">
          <h2 className="text-xl font-bold text-gray-900 mb-4">משתמשים ממתינים לאישור</h2>
          {loading ? (
            <div className="text-center py-8 text-gray-500">טוען...</div>
          ) : pendingUsers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Shield size={48} className="mx-auto mb-4 text-gray-400" />
              <p>אין משתמשים ממתינים לאישור</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-right py-3 px-4 text-sm font-bold text-gray-700">משתמש</th>
                    <th className="text-right py-3 px-4 text-sm font-bold text-gray-700">אימייל</th>
                    <th className="text-right py-3 px-4 text-sm font-bold text-gray-700">תאריך הרשמה</th>
                    <th className="text-right py-3 px-4 text-sm font-bold text-gray-700">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingPagination.paginatedItems.map((user) => (
                    <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {user.photoURL ? (
                            <img
                              src={user.photoURL}
                              alt={user.name}
                              className="w-10 h-10 rounded-full"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                              <Shield size={20} className="text-gray-400" />
                            </div>
                          )}
                          <span className="font-bold text-gray-900">{user.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-700">{user.email || '-'}</td>
                      <td className="py-3 px-4 text-sm text-gray-700">
                        {user.createdAt
                          ? new Date(user.createdAt).toLocaleDateString('he-IL')
                          : '-'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleApprove(user.id)}
                            className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-sm font-bold hover:bg-green-600 transition-colors flex items-center gap-1.5"
                          >
                            אשר
                          </button>
                          <button
                            onClick={() => handleReject(user.id, user.name)}
                            className="px-3 py-1.5 bg-rose-50 text-rose-600 rounded-lg text-sm font-bold hover:bg-rose-100 transition-colors flex items-center gap-1.5"
                          >
                            <Ban size={16} />
                            דחה
                          </button>
                          {!user.isSuperAdmin && (
                            <button
                              onClick={() => handlePromote(user.id)}
                              className="px-3 py-1.5 bg-cyan-500 text-white rounded-lg text-sm font-bold hover:bg-cyan-600 transition-colors"
                            >
                              קדם למנהל מערכת
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
            {pendingUsers.length > 0 && (
              <Pagination
                currentPage={pendingPagination.currentPage}
                totalPages={pendingPagination.totalPages}
                onPageChange={pendingPagination.goToPage}
                totalItems={pendingUsers.length}
                itemsPerPage={10}
              />
            )}
        </div>
      )}

      {/* Admins Tab */}
      {activeTab === 'admins' && (
        <>
          {/* Search Section */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">קידום משתמש למנהל מערכת</h2>
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Mail size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={searchEmail}
                  onChange={(e) => setSearchEmail(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="הזן כתובת אימייל..."
                  className="w-full pr-10 pl-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none text-black"
                  dir="ltr"
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={searching}
                className="px-6 py-3 bg-cyan-600 text-white rounded-xl font-bold hover:bg-cyan-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Search size={18} />
                {searching ? 'מחפש...' : 'חפש'}
              </button>
            </div>

            {/* Search Result */}
            {searchResult && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {searchResult.photoURL ? (
                      <img
                        src={searchResult.photoURL}
                        alt={searchResult.name}
                        className="w-10 h-10 rounded-full"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-cyan-100 flex items-center justify-center">
                        <Shield size={20} className="text-cyan-600" />
                      </div>
                    )}
                    <div>
                      <p className="font-bold text-gray-900">{searchResult.name}</p>
                      <p className="text-sm text-gray-500">{searchResult.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {searchResult.isSuperAdmin ? (
                      <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-bold">
                        מנהל מערכת
                      </span>
                    ) : (
                      <button
                        onClick={() => handlePromote(searchResult.id)}
                        className="px-4 py-2 bg-cyan-600 text-white rounded-lg font-bold hover:bg-cyan-700 transition-colors flex items-center gap-2"
                      >
                        <UserPlus size={16} />
                        קדם למנהל מערכת
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setSearchResult(null);
                        setSearchEmail('');
                      }}
                      className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Admins Table */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 min-h-[600px]">
            <h2 className="text-xl font-bold text-gray-900 mb-4">מנהלי מערכת פעילים</h2>
            {loading ? (
              <div className="text-center py-8 text-gray-500">טוען...</div>
            ) : admins.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Shield size={48} className="mx-auto mb-4 text-gray-400" />
                <p>אין מנהלי מערכת רשומים</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-right py-3 px-4 text-sm font-bold text-gray-700">משתמש</th>
                      <th className="text-right py-3 px-4 text-sm font-bold text-gray-700">אימייל</th>
                      <th className="text-right py-3 px-4 text-sm font-bold text-gray-700">תפקיד</th>
                      <th className="text-right py-3 px-4 text-sm font-bold text-gray-700">תאריך יצירה</th>
                      <th className="text-right py-3 px-4 text-sm font-bold text-gray-700">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminsPagination.paginatedItems.map((admin) => {
                      const isCurrentUser = admin.id === currentUserId;
                      return (
                        <tr key={admin.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              {admin.photoURL ? (
                                <img
                                  src={admin.photoURL}
                                  alt={admin.name}
                                  className="w-10 h-10 rounded-full"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-cyan-100 flex items-center justify-center">
                                  <Shield size={20} className="text-cyan-600" />
                                </div>
                              )}
                              <div>
                                <span className="font-bold text-gray-900">{admin.name}</span>
                                {isCurrentUser && (
                                  <span className="block text-xs text-gray-500 mt-0.5">(אתה)</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-700">{admin.email || '-'}</td>
                          <td className="py-3 px-4">
                            {isRootAdmin(admin.email) ? (
                              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-bold">Root Admin</span>
                            ) : admin.isSuperAdmin ? (
                              <span className="px-2 py-0.5 bg-cyan-100 text-cyan-700 rounded-full text-xs font-bold">Super Admin</span>
                            ) : admin.isVerticalAdmin ? (
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">
                                מנהל {admin.managedVertical === 'military' ? 'צבאי' : admin.managedVertical === 'educational' ? 'חינוכי' : 'עירוני'}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-bold">מאושר</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-700">
                            {admin.createdAt
                              ? new Date(admin.createdAt).toLocaleDateString('he-IL')
                              : '-'}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              {!isCurrentUser && (
                                <button
                                  onClick={() => {
                                    setEditingAdmin(admin);
                                    setShowInviteModal(true);
                                  }}
                                  className="p-2 hover:bg-cyan-50 rounded-lg transition-colors text-cyan-600"
                                  title="ערוך מנהל"
                                >
                                  <Pencil size={16} />
                                </button>
                              )}
                              <button
                                onClick={() => handleRevoke(admin.id)}
                                disabled={isCurrentUser}
                                className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm font-bold hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title={isCurrentUser ? 'לא ניתן להסיר הרשאות מעצמך' : 'הסר הרשאות'}
                              >
                                הסר הרשאות
                              </button>
                              {!isCurrentUser && (
                                <button
                                  onClick={() => handleDelete(admin.id, admin.name)}
                                  disabled={deletingAdminId === admin.id}
                                  className="p-2 hover:bg-red-100 rounded-lg transition-colors text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="מחק מנהל"
                                >
                                  <Trash2 size={18} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {admins.length > 0 && (
              <Pagination
                currentPage={adminsPagination.currentPage}
                totalPages={adminsPagination.totalPages}
                onPageChange={adminsPagination.goToPage}
                totalItems={admins.length}
                itemsPerPage={10}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
