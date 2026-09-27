'use client';

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { collection, getDocs, doc, updateDoc, query, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Shield, CheckCircle, XCircle, Search, User, Mail, Calendar } from 'lucide-react';
import { logAction } from '@/features/admin/services/audit.service';
import { usePagination } from '@/features/admin/hooks/usePagination';
import Pagination from '@/features/admin/components/shared/Pagination';

interface UserData {
  id: string;
  name: string;
  email: string;
  isSuperAdmin: boolean;
  isApproved: boolean;
  createdAt?: Date;
  lastLoginAt?: Date;
}

export default function UsersManagementPage() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUserId(user.uid);
        try {
          const roleInfo = await checkUserRole(user.uid);
          if (roleInfo.isSuperAdmin) {
            setIsAuthorized(true);
            loadUsers();
          } else {
            setIsAuthorized(false);
          }
        } catch (error) {
          console.error('Error checking authorization:', error);
          setIsAuthorized(false);
        }
      } else {
        setIsAuthorized(false);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredUsers(users);
    } else {
      const term = searchTerm.toLowerCase();
      setFilteredUsers(
        users.filter(
          (user) =>
            user.name.toLowerCase().includes(term) ||
            user.email.toLowerCase().includes(term)
        )
      );
    }
  }, [searchTerm, users]);

  // Pagination for filtered users
  const { currentPage, totalPages, paginatedItems, goToPage, resetPagination } = usePagination(filteredUsers, 10);
  
  // Reset pagination when filters change
  useEffect(() => {
    resetPagination();
  }, [searchTerm]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, 'users'), orderBy('core.name', 'asc'), limit(1000));
      const snapshot = await getDocs(q);
      
      const usersData: UserData[] = [];
      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        const core = data?.core || {};
        usersData.push({
          id: doc.id,
          name: core.name || 'Unknown',
          email: core.email || '',
          isSuperAdmin: core.isSuperAdmin === true,
          isApproved: core.isApproved === true,
          createdAt: core.createdAt?.toDate?.() || data?.createdAt?.toDate?.() || undefined,
          lastLoginAt: core.lastLoginAt?.toDate?.() || undefined,
        });
      });
      
      setUsers(usersData);
      setFilteredUsers(usersData);
    } catch (error) {
      console.error('Error loading users:', error);
      alert('שגיאה בטעינת המשתמשים');
    } finally {
      setLoading(false);
    }
  };

  const getCurrentAdminInfo = async () => {
    if (!currentUserId) return null;
    try {
      const { getUserFromFirestore } = await import('@/lib/firestore.service');
      const profile = await getUserFromFirestore(currentUserId, { allowSelfHeal: false });
      return {
        adminId: currentUserId,
        adminName: profile?.core?.name || 'System Admin',
      };
    } catch (error) {
      return {
        adminId: currentUserId,
        adminName: 'System Admin',
      };
    }
  };

  const toggleSuperAdmin = async (userId: string, currentValue: boolean) => {
    if (!confirm(`האם אתה בטוח שברצונך ${currentValue ? 'להסיר' : 'להוסיף'} הרשאות מנהל מערכת למשתמש זה?`)) {
      return;
    }

    setUpdating(userId);
    try {
      const adminInfo = await getCurrentAdminInfo();
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        'core.isSuperAdmin': !currentValue,
      });

      // Log audit action
      if (adminInfo) {
        await logAction({
          adminId: adminInfo.adminId,
          adminName: adminInfo.adminName,
          actionType: currentValue ? 'UPDATE' : 'CREATE',
          targetEntity: 'Admin',
          targetId: userId,
          details: `${currentValue ? 'Removed' : 'Granted'} Super Admin privileges`,
        });
      }

      // Reload users
      await loadUsers();
    } catch (error) {
      console.error('Error toggling super admin:', error);
      alert('שגיאה בעדכון הרשאות מנהל מערכת');
    } finally {
      setUpdating(null);
    }
  };

  const toggleApproval = async (userId: string, currentValue: boolean) => {
    if (!confirm(`האם אתה בטוח שברצונך ${currentValue ? 'לבטל' : 'לאשר'} את המשתמש הזה?`)) {
      return;
    }

    setUpdating(userId);
    try {
      const adminInfo = await getCurrentAdminInfo();
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        'core.isApproved': !currentValue,
      });

      // Log audit action
      if (adminInfo) {
        await logAction({
          adminId: adminInfo.adminId,
          adminName: adminInfo.adminName,
          actionType: 'UPDATE',
          targetEntity: 'User',
          targetId: userId,
          details: `${currentValue ? 'Unapproved' : 'Approved'} user`,
        });
      }

      // Reload users
      await loadUsers();
    } catch (error) {
      console.error('Error toggling approval:', error);
      alert('שגיאה בעדכון אישור המשתמש');
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">טוען...</div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Shield size={48} className="text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">אין הרשאות</h3>
          <p className="text-gray-500">רק מנהלי מערכת יכולים לגשת לדף זה</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-gray-900">ניהול משתמשים</h1>
        <p className="text-gray-500 mt-2">ניהול הרשאות ואישורים למשתמשי המערכת</p>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="relative">
          <Search size={20} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="חפש לפי שם או אימייל..."
            className="w-full pr-10 pl-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
            dir="rtl"
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden min-h-[600px]">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-right py-4 px-6 text-sm font-bold text-gray-700">משתמש</th>
                <th className="text-right py-4 px-6 text-sm font-bold text-gray-700">אימייל</th>
                <th className="text-right py-4 px-6 text-sm font-bold text-gray-700">מנהל מערכת</th>
                <th className="text-right py-4 px-6 text-sm font-bold text-gray-700">מאושר</th>
                <th className="text-right py-4 px-6 text-sm font-bold text-gray-700">תאריך יצירה</th>
                <th className="text-right py-4 px-6 text-sm font-bold text-gray-700">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-500">
                    {searchTerm ? 'לא נמצאו משתמשים התואמים לחיפוש' : 'אין משתמשים'}
                  </td>
                </tr>
              ) : (
                paginatedItems.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-cyan-500 text-white flex items-center justify-center font-bold">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-gray-900">{user.name}</div>
                          {user.id === currentUserId && (
                            <div className="text-xs text-cyan-600 font-medium">(אתה)</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2 text-gray-600">
                        <Mail size={16} />
                        <span>{user.email || 'ללא אימייל'}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      {user.isSuperAdmin ? (
                        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-700">
                          <Shield size={14} />
                          מנהל מערכת
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      {user.isApproved ? (
                        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">
                          <CheckCircle size={14} />
                          מאושר
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700">
                          <XCircle size={14} />
                          ממתין לאישור
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-600">
                      {user.createdAt
                        ? new Date(user.createdAt).toLocaleDateString('he-IL')
                        : '-'}
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleSuperAdmin(user.id, user.isSuperAdmin)}
                          disabled={updating === user.id}
                          className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                            user.isSuperAdmin
                              ? 'bg-red-100 text-red-700 hover:bg-red-200'
                              : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          {updating === user.id
                            ? 'מעדכן...'
                            : user.isSuperAdmin
                            ? 'הסר הרשאות'
                            : 'הפוך למנהל'}
                        </button>
                        <button
                          onClick={() => toggleApproval(user.id, user.isApproved)}
                          disabled={updating === user.id}
                          className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                            user.isApproved
                              ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                              : 'bg-green-100 text-green-700 hover:bg-green-200'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          {updating === user.id
                            ? 'מעדכן...'
                            : user.isApproved
                            ? 'בטל אישור'
                            : 'אשר'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={goToPage}
          totalItems={filteredUsers.length}
          itemsPerPage={10}
        />
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-sm text-blue-800">
          <strong>💡 טיפ:</strong> כדי לקדם את עצמך למנהל מערכת, חפש את האימייל שלך ולחץ על "הפוך למנהל".
          לאחר מכן, לחץ על "אשר" כדי לאשר את עצמך.
        </p>
      </div>
    </div>
  );
}
