'use client';

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
  AdminUser,
} from '@/features/admin/services/admin-management.service';
import { createInvitation } from '@/features/admin/services/invitation.service';
import { getAllAuthorities, getAuthoritiesGrouped } from '@/features/admin/services/authority.service';
import { Shield, Search, UserPlus, X, Mail, AlertCircle, Link as LinkIcon, Copy, Check, Trash2, Ban, ChevronDown, Building2 } from 'lucide-react';
import { Authority } from '@/types/admin-types';
import { deleteUser } from '@/features/admin/services/users.service';
import { logAction } from '@/features/admin/services/audit.service';
import { usePagination } from '@/features/admin/hooks/usePagination';
import Pagination from '@/features/admin/components/shared/Pagination';

export default function AdminsManagementPage() {
  const router = useRouter();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [pendingUsers, setPendingUsers] = useState<AdminUser[]>([]);
  const [activeTab, setActiveTab] = useState<'admins' | 'pending'>('pending');
  const [loading, setLoading] = useState(true);
  const [searchEmail, setSearchEmail] = useState('');
  const [searchResult, setSearchResult] = useState<AdminUser | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  
  // Invitation state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'super_admin' | 'authority_manager'>('super_admin');
  const [inviteAuthorityId, setInviteAuthorityId] = useState<string>('');
  const [authoritySearchQuery, setAuthoritySearchQuery] = useState<string>('');
  const [isAuthorityDropdownOpen, setIsAuthorityDropdownOpen] = useState<boolean>(false);
  const [authorities, setAuthorities] = useState<Authority[]>([]);
  const [groupedAuthorities, setGroupedAuthorities] = useState<{
    regionalCouncils: (Authority & { settlements: Authority[] })[];
    standaloneAuthorities: Authority[];
  } | null>(null);
  const [inviteLink, setInviteLink] = useState<string>('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
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
        setCurrentUserId(user.uid); // Store current user ID for safety check
        setIsAuthorized(true);
        loadAdmins();
        loadAuthorities();
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
      };
    } catch (error) {
      return {
        adminId: user.uid,
        adminName: user.displayName || 'Unknown Admin',
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

  const handleCreateInvitation = async () => {
    if (!inviteEmail.trim()) {
      setError('אנא הזן כתובת אימייל');
      return;
    }

    if (inviteRole === 'authority_manager' && !inviteAuthorityId) {
      setError('אנא בחר רשות עבור מנהל רשות');
      return;
    }

    setCreatingInvite(true);
    setError('');
    setInviteLink('');

    try {
      const adminInfo = await getCurrentAdminInfo();
      if (!adminInfo) {
        setError('שגיאה: לא ניתן לזהות את המנהל');
        setCreatingInvite(false);
        return;
      }

      const result = await createInvitation(
        {
          email: inviteEmail.trim(),
          role: inviteRole,
          authorityId: inviteRole === 'authority_manager' ? inviteAuthorityId : undefined,
        },
        adminInfo
      );

      setInviteLink(result.inviteLink);
      setSuccess('קישור הזמנה נוצר בהצלחה');
      setInviteEmail('');
      setInviteAuthorityId('');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error: any) {
      console.error('Error creating invitation:', error);
      setError(error.message || 'שגיאה ביצירת קישור הזמנה');
    } finally {
      setCreatingInvite(false);
    }
  };

  const handleCopyLink = async () => {
    if (inviteLink) {
      try {
        await navigator.clipboard.writeText(inviteLink);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      } catch (error) {
        console.error('Error copying link:', error);
        setError('שגיאה בהעתקת הקישור');
      }
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
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">כתובת אימייל</label>
            <div className="relative">
              <Mail size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="email@example.com"
                className="w-full pr-10 pl-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none text-black placeholder:text-gray-600"
                dir="ltr"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">תפקיד</label>
            <select
              value={inviteRole}
              onChange={(e) => {
                setInviteRole(e.target.value as 'super_admin' | 'authority_manager');
                if (e.target.value === 'super_admin') {
                  setInviteAuthorityId('');
                }
              }}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none text-black"
            >
              <option value="super_admin">מנהל מערכת (Super Admin)</option>
              <option value="authority_manager">מנהל רשות (Authority Manager)</option>
            </select>
          </div>

          {inviteRole === 'authority_manager' && (
            <div className="relative">
              <label className="block text-sm font-bold text-gray-700 mb-2">רשות</label>
              
              {/* Searchable Combobox */}
              <div className="relative">
                {/* Trigger Button */}
                <button
                  type="button"
                  onClick={() => setIsAuthorityDropdownOpen(!isAuthorityDropdownOpen)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none text-black bg-white text-right flex items-center justify-between hover:bg-gray-50 transition-colors"
                  dir="rtl"
              >
                  <span className={inviteAuthorityId ? 'text-black' : 'text-gray-500'}>
                    {(() => {
                      if (!inviteAuthorityId) return 'בחר רשות...';
                      const selected = authorities.find(a => a.id === inviteAuthorityId);
                      if (selected) {
                        const city = (groupedAuthorities?.standaloneAuthorities || []).find(a => a.id === inviteAuthorityId && a.type === 'city');
                        const council = groupedAuthorities?.regionalCouncils?.find(c => c.id === inviteAuthorityId);
                        if (city) return `${selected.name} - כל העיר`;
                        if (council) return `${selected.name} - כל המועצה`;
                        return selected.name;
                      }
                      return 'בחר רשות...';
                    })()}
                  </span>
                  <ChevronDown size={20} className={`text-gray-400 transition-transform ${isAuthorityDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {/* Dropdown Panel - Opens Below */}
                {isAuthorityDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-xl shadow-xl z-50 max-h-96 overflow-hidden flex flex-col">
                    {/* Sticky Search Input */}
                    <div className="sticky top-0 bg-white border-b border-gray-200 p-3 z-10">
                      <div className="relative">
                        <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          value={authoritySearchQuery}
                          onChange={(e) => setAuthoritySearchQuery(e.target.value)}
                          onFocus={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="חפש רשות..."
                          className="w-full pr-10 pl-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none text-black placeholder:text-gray-600"
                          dir="rtl"
                          autoFocus
                        />
                      </div>
                    </div>

                    {/* Filtered Options List */}
                    <div className="overflow-y-auto flex-1 p-2">
                {(() => {
                  // Get all authorities with parent links (neighborhoods/settlements from Firestore)
                  const subAuthorities = authorities.filter(auth => auth.parentAuthorityId);
                  
                        // Get all top-level cities directly from authorities (not just from grouped)
                        // This ensures we get ALL cities, not just those in standaloneAuthorities
                        const allTopLevelCities = authorities.filter(
                          auth => auth.type === 'city' && !auth.parentAuthorityId
                        );
                        
                        // Also get cities from groupedAuthorities for completeness
                        const groupedCities = (groupedAuthorities?.standaloneAuthorities || []).filter(
                    auth => auth.type === 'city'
                  );
                        
                        // Merge and deduplicate cities (prefer authorities from getAllAuthorities)
                        const citiesMap = new Map<string, Authority>();
                        allTopLevelCities.forEach(city => citiesMap.set(city.id, city));
                        groupedCities.forEach(city => {
                          if (!citiesMap.has(city.id)) {
                            citiesMap.set(city.id, city);
                          }
                        });
                        const cities = Array.from(citiesMap.values());
                        
                        // Separate other standalone authorities
                  const otherStandalone = (groupedAuthorities?.standaloneAuthorities || []).filter(
                    auth => auth.type !== 'city'
                  );

                  // Group neighborhoods by parent city ID
                  const neighborhoodsByCity = new Map<string, Authority[]>();
                  subAuthorities.forEach(subAuth => {
                    if (!subAuth.parentAuthorityId) return;
                    const parentCity = cities.find(c => c.id === subAuth.parentAuthorityId);
                    if (parentCity) {
                      if (!neighborhoodsByCity.has(subAuth.parentAuthorityId)) {
                        neighborhoodsByCity.set(subAuth.parentAuthorityId, []);
                      }
                      neighborhoodsByCity.get(subAuth.parentAuthorityId)!.push(subAuth);
                    }
                  });

                        // Flatten all options for filtering
                        const allOptions: Array<{ id: string; label: string; group: string; type: 'city' | 'council' | 'neighborhood' | 'settlement' | 'other' }> = [];
                        
                        // Add cities
                        cities.forEach(city => {
                          allOptions.push({ id: city.id, label: `${city.name} - כל העיר`, group: 'ערים (Cities)', type: 'city' });
                            const neighborhoods = neighborhoodsByCity.get(city.id) || [];
                          neighborhoods.forEach(n => {
                            allOptions.push({ id: n.id, label: `${city.name} - ${n.name}`, group: 'ערים (Cities)', type: 'neighborhood' });
                          });
                        });

                        // Add regional councils
                        if (groupedAuthorities?.regionalCouncils) {
                          groupedAuthorities.regionalCouncils.forEach(council => {
                            allOptions.push({ id: council.id, label: `${council.name} - כל המועצה`, group: 'מועצות אזוריות (Regional Councils)', type: 'council' });
                            council.settlements.forEach(settlement => {
                              allOptions.push({ id: settlement.id, label: `${council.name} - ${settlement.name}`, group: 'מועצות אזוריות (Regional Councils)', type: 'settlement' });
                            });
                          });
                        }

                        // Add other standalone
                        otherStandalone.forEach(auth => {
                          allOptions.push({ id: auth.id, label: auth.name, group: 'רשויות אחרות (Other Authorities)', type: 'other' });
                        });

                        // Filter by search query
                        const filtered = authoritySearchQuery.trim()
                          ? allOptions.filter(opt => opt.label.toLowerCase().includes(authoritySearchQuery.toLowerCase()))
                          : allOptions;

                        // Group filtered results
                        const groupedFiltered = new Map<string, typeof filtered>();
                        filtered.forEach(opt => {
                          if (!groupedFiltered.has(opt.group)) {
                            groupedFiltered.set(opt.group, []);
                          }
                          groupedFiltered.get(opt.group)!.push(opt);
                        });

                        if (filtered.length === 0) {
                            return (
                            <div className="py-8 text-center text-gray-500 text-sm">
                              לא נמצאו רשויות תואמות
                            </div>
                          );
                        }

                        return Array.from(groupedFiltered.entries()).map(([group, opts]) => (
                          <div key={group} className="mb-2">
                            <div className="text-xs font-bold text-gray-500 px-2 py-1 mb-1">{group}</div>
                            {opts.map(opt => (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => {
                                  setInviteAuthorityId(opt.id);
                                  setIsAuthorityDropdownOpen(false);
                                  setAuthoritySearchQuery('');
                                }}
                                className={`w-full text-right px-4 py-2 rounded-lg text-sm transition-colors ${
                                  opt.type === 'neighborhood' || opt.type === 'settlement' ? 'pr-8' : ''
                                } ${
                                  inviteAuthorityId === opt.id
                                    ? 'bg-cyan-100 text-cyan-900 font-bold'
                                    : 'text-black hover:bg-gray-100'
                                }`}
                                >
                                {opt.label}
                              </button>
                              ))}
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                      )}
              </div>

              {/* Click outside to close */}
              {isAuthorityDropdownOpen && (
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => {
                    setIsAuthorityDropdownOpen(false);
                    setAuthoritySearchQuery('');
                  }}
                />
              )}
            </div>
          )}

          <button
            onClick={handleCreateInvitation}
            disabled={creatingInvite}
            className="w-full px-6 py-3 bg-cyan-600 text-white rounded-xl font-bold hover:bg-cyan-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <LinkIcon size={18} />
            {creatingInvite ? 'יוצר קישור...' : 'צור קישור הזמנה'}
          </button>

          {inviteLink && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <label className="block text-sm font-bold text-gray-700 mb-2">קישור הזמנה</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={inviteLink}
                  readOnly
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm text-black"
                  dir="ltr"
                />
                <button
                  onClick={handleCopyLink}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition-colors flex items-center gap-2"
                >
                  {linkCopied ? (
                    <>
                      <Check size={16} />
                      הועתק
                    </>
                  ) : (
                    <>
                      <Copy size={16} />
                      העתק
                    </>
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                הקישור תקף ל-7 ימים. שלח את הקישור למשתמש כדי לאפשר לו להירשם עם ההרשאות המתאימות.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 p-2">
        <div className="flex items-center gap-2">
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
            מנהלי מערכת פעילים
          </button>
        </div>
      </div>

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
                          <td className="py-3 px-4 text-sm text-gray-700">
                            {admin.createdAt
                              ? new Date(admin.createdAt).toLocaleDateString('he-IL')
                              : '-'}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
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
