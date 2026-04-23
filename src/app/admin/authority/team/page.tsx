'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { checkUserRole, isOnlyAuthorityManager } from '@/features/admin/services/auth.service';
import { getAuthority, getChildrenByParent, getAllAuthorities } from '@/features/admin/services/authority.service';
import { authorityTypeToTenantType, orgTypeDisplayName } from '@/features/admin/config/tenantLabels';
import SearchableSelect from '@/features/admin/components/SearchableSelect';
import {
  createInvitation,
  getInvitationsByAuthority,
  removeManagerFromAuthority,
} from '@/features/admin/services/invitation.service';
import { getUserFromFirestore } from '@/lib/firestore.service';
import { isRootAdmin } from '@/config/feature-flags';
import type { Authority } from '@/types/admin-types';
import type { AdminInvitation } from '@/types/invitation.type';
import InviteMemberModal from '@/features/admin/components/InviteMemberModal';
import AdminBreadcrumb from '@/features/admin/components/AdminBreadcrumb';
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import {
  Users,
  UserPlus,
  Trash2,
  Mail,
  Copy,
  CheckCircle,
  AlertCircle,
  Loader2,
  Building2,
  MapPin,
  X,
  Clock,
  Shield,
  Globe,
} from 'lucide-react';

interface TeamMember {
  uid: string;
  name: string;
  email: string;
  photoURL?: string;
}

export default function AuthorityTeamPage() {
  const searchParams = useSearchParams();
  const urlType = searchParams?.get('type') || '';

  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const [authority, setAuthority] = useState<Authority | null>(null);
  const [authorityId, setAuthorityId] = useState<string | null>(null);
  const [childAuthorities, setChildAuthorities] = useState<Authority[]>([]);

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<AdminInvitation[]>([]);

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteTargetAuthority, setInviteTargetAuthority] = useState('');
  const [inviting, setInviting] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [removingUid, setRemovingUid] = useState<string | null>(null);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Summary stats
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalSubUnits, setTotalSubUnits] = useState(0);
  const [activeUsersLast7d, setActiveUsersLast7d] = useState(0);

  // Org selector for Super Admins
  const [allOrgs, setAllOrgs] = useState<Authority[]>([]);

  const loadTeamData = useCallback(async (authId: string) => {
    try {
      const auth = await getAuthority(authId);
      if (!auth) return;
      setAuthority(auth);

      const children = await getChildrenByParent(authId);
      setChildAuthorities(children);

      // Collect all managerIds across authority + children
      const allManagerIds = new Set<string>(auth.managerIds || []);
      for (const child of children) {
        for (const mid of child.managerIds || []) {
          allManagerIds.add(mid);
        }
      }

      // Resolve user profiles
      const members: TeamMember[] = [];
      for (const uid of allManagerIds) {
        try {
          const profile = await getUserFromFirestore(uid);
          members.push({
            uid,
            name: profile?.core?.name || uid.slice(0, 8) + '…',
            email: profile?.core?.email || '',
            photoURL: profile?.core?.photoURL,
          });
        } catch {
          members.push({ uid, name: uid.slice(0, 8) + '…', email: '' });
        }
      }
      setTeamMembers(members);

      // Load invitations for this authority + children
      const invs = await getInvitationsByAuthority(authId);
      const childInvs: AdminInvitation[] = [];
      for (const child of children) {
        const ci = await getInvitationsByAuthority(child.id);
        childInvs.push(...ci);
      }
      setInvitations([...invs, ...childInvs]);

      // Summary stats
      setTotalSubUnits(children.length);
      try {
        const usersSnap = await getDocs(query(
          collection(db, 'users'),
          where('core.tenantId', '==', authId),
        ));
        setTotalUsers(usersSnap.size);

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        let activeCount = 0;
        usersSnap.forEach(d => {
          const lastLogin = d.data()?.core?.lastLoginAt?.toDate?.();
          if (lastLogin && lastLogin >= sevenDaysAgo) activeCount++;
        });
        setActiveUsersLast7d(activeCount);
      } catch {
        setTotalUsers(0);
        setActiveUsersLast7d(0);
      }
    } catch (err) {
      console.error('[TeamPage] Error loading team:', err);
      setError('שגיאה בטעינת נתוני הצוות');
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        return;
      }
      setCurrentUserId(user.uid);
      setCurrentUserEmail(user.email || null);

      try {
        const roleInfo = await checkUserRole(user.uid);
        setIsSuperAdmin(roleInfo.isSuperAdmin);

        if (roleInfo.isSuperAdmin) {
          try {
            const orgs = await getAllAuthorities();
            setAllOrgs(orgs);
          } catch { /* non-critical */ }
        }

        // Determine authority — only auto-load if there's explicit context
        if (roleInfo.isSuperAdmin) {
          const storedOrgId = typeof window !== 'undefined' ? window.localStorage.getItem('admin_selected_org_id') : null;
          if (storedOrgId && storedOrgId !== 'all') {
            setAuthorityId(storedOrgId);
            await loadTeamData(storedOrgId);
          }
          // Otherwise: leave authorityId null → show "select org" empty state
        } else {
          // Non-super-admin: resolve from their assigned authority
          const storedAuthId = typeof window !== 'undefined' ? window.localStorage.getItem('admin_selected_authority_id') : null;
          let resolvedAuthId = storedAuthId || roleInfo.authorityId || null;

          if (!resolvedAuthId) {
            const { getAuthoritiesByManager } = await import(
              '@/features/admin/services/authority.service'
            );
            const auths = await getAuthoritiesByManager(user.uid);
            if (auths.length > 0) {
              resolvedAuthId = auths[0].id;
            }
          }

          if (resolvedAuthId) {
            setAuthorityId(resolvedAuthId);
            await loadTeamData(resolvedAuthId);
          }
        }
      } catch (err) {
        console.error('[TeamPage] Init error:', err);
        setError('שגיאה בטעינת הדף');
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [loadTeamData]);

  const getAdminInfo = async () => {
    const user = auth.currentUser;
    if (!user) return undefined;
    try {
      const profile = await getUserFromFirestore(user.uid);
      return {
        adminId: user.uid,
        adminName: profile?.core?.name || user.displayName || 'Admin',
        adminEmail: user.email || profile?.core?.email || '',
      };
    } catch {
      return {
        adminId: user.uid,
        adminName: user.displayName || 'Admin',
        adminEmail: user.email || '',
      };
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !authorityId) return;
    setInviting(true);
    setError('');
    setSuccess('');

    try {
      console.log('[TeamPage] handleInvite START:', { inviteEmail, authorityId, inviteTargetAuthority });
      const adminInfo = await getAdminInfo();
      if (!adminInfo) {
        console.error('[TeamPage] handleInvite: No admin info — user not authenticated');
        throw new Error('Not authenticated');
      }
      console.log('[TeamPage] Admin info:', { adminId: adminInfo.adminId, adminName: adminInfo.adminName, adminEmail: adminInfo.adminEmail });

      const targetAuth = inviteTargetAuthority || authorityId;
      console.log('[TeamPage] Sending invitation to:', inviteEmail.trim().toLowerCase(), 'for authority:', targetAuth);

      const result = await createInvitation(
        {
          email: inviteEmail.trim().toLowerCase(),
          role: 'authority_manager',
          authorityId: targetAuth,
        },
        adminInfo,
        { callerAuthorityId: authorityId }
      );

      console.log('[TeamPage] Invitation created successfully:', result);
      setSuccess(`הזמנה נשלחה ל-${inviteEmail}`);
      setCopiedLink(result.inviteLink);
      setInviteEmail('');
      setInviteTargetAuthority('');
      setShowInviteModal(false);

      await loadTeamData(authorityId);
    } catch (err: any) {
      console.error('[TeamPage] Invite FAILED:', err, '| message:', err?.message, '| code:', err?.code, '| stack:', err?.stack);
      setError(err.message || 'שגיאה ביצירת הזמנה');
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (uid: string) => {
    if (!authorityId || !window.confirm('האם להסיר את המשתמש מהצוות?')) return;
    setRemovingUid(uid);
    setError('');

    try {
      const adminInfo = await getAdminInfo();
      if (!adminInfo) throw new Error('Not authenticated');

      // Remove from main authority
      await removeManagerFromAuthority(authorityId, uid, adminInfo);

      // Also remove from any child authorities
      for (const child of childAuthorities) {
        if (child.managerIds?.includes(uid)) {
          await removeManagerFromAuthority(child.id, uid, adminInfo);
        }
      }

      setSuccess('המשתמש הוסר מהצוות');
      await loadTeamData(authorityId);
    } catch (err: any) {
      console.error('[TeamPage] Remove error:', err);
      setError(err.message || 'שגיאה בהסרת המשתמש');
    } finally {
      setRemovingUid(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(text);
    setTimeout(() => setCopiedLink(null), 3000);
  };

  const getMemberAuthority = (uid: string): string => {
    if (authority?.managerIds?.includes(uid)) {
      const name = typeof authority.name === 'string' ? authority.name : (authority.name as any)?.he || '';
      return name;
    }
    for (const child of childAuthorities) {
      if (child.managerIds?.includes(uid)) {
        const name = typeof child.name === 'string' ? child.name : (child.name as any)?.he || '';
        return name;
      }
    }
    return '';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-10 h-10 text-cyan-600 animate-spin" />
      </div>
    );
  }

  if (!authority) {
    return (
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8" dir="rtl">
        {isSuperAdmin && allOrgs.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
            <Globe size={20} className="text-cyan-600 flex-shrink-0" />
            <div className="flex-1" style={{ position: 'relative', zIndex: 20 }}>
              <label className="text-xs font-bold text-slate-500 block mb-1">בחר ארגון</label>
              <SearchableSelect
                options={(() => {
                  const filteredOrgs = urlType
                    ? allOrgs.filter(o => authorityTypeToTenantType(o.type) === urlType)
                    : allOrgs;
                  return filteredOrgs.map(org => {
                    const name = typeof org.name === 'string' ? org.name : (org.name as any)?.he || org.id;
                    return { id: org.id, label: `${name} (${orgTypeDisplayName(authorityTypeToTenantType(org.type))})` };
                  });
                })()}
                value=""
                onChange={async (newId) => {
                  if (newId) {
                    setAuthorityId(newId);
                    setLoading(true);
                    await loadTeamData(newId);
                    setLoading(false);
                  }
                }}
                placeholder="בחר ארגון..."
              />
            </div>
          </div>
        )}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <Users size={48} className="mx-auto mb-4 text-slate-200" />
          <h2 className="text-lg font-black text-slate-700 mb-2">בחר ארגון להצגה</h2>
          <p className="text-sm text-slate-400">בחר ארגון מהרשימה למעלה כדי לצפות בצוות הניהולי שלו.</p>
        </div>
      </div>
    );
  }

  const authorityDisplayName =
    typeof authority.name === 'string' ? authority.name : (authority.name as any)?.he || '';

  const pendingInvitations = invitations.filter((inv) => !inv.isUsed);
  const usedInvitations = invitations.filter((inv) => inv.isUsed);

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8" dir="rtl">
      {/* Org Selector for Super Admins */}
      {isSuperAdmin && allOrgs.length > 1 && (() => {
        const filteredOrgs = urlType
          ? allOrgs.filter(o => authorityTypeToTenantType(o.type) === urlType)
          : allOrgs;
        if (filteredOrgs.length <= 1) return null;
        return (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
            <Globe size={20} className="text-cyan-600 flex-shrink-0" />
            <div className="flex-1" style={{ position: 'relative', zIndex: 20 }}>
              <label className="text-xs font-bold text-slate-500 block mb-1">בחר ארגון</label>
              <SearchableSelect
                options={filteredOrgs.map(org => {
                  const name = typeof org.name === 'string' ? org.name : (org.name as any)?.he || org.id;
                  return { id: org.id, label: `${name} (${orgTypeDisplayName(authorityTypeToTenantType(org.type))})` };
                })}
                value={authorityId || ''}
                onChange={async (newId) => {
                  if (newId) {
                    setAuthorityId(newId);
                    setLoading(true);
                    await loadTeamData(newId);
                    setLoading(false);
                  }
                }}
                placeholder="בחר ארגון..."
              />
            </div>
          </div>
        );
      })()}

      <AdminBreadcrumb items={[
        { label: 'ארגונים', href: '/admin/organizations' },
        { label: authorityDisplayName || 'ארגון' },
        { label: 'ניהול צוות' },
      ]} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 flex items-center gap-3">
            <Users className="text-cyan-600" size={28} />
            ניהול צוות
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            ניהול רכזים ומנהלים עבור <span className="font-bold text-gray-700">{authorityDisplayName}</span>
          </p>
        </div>
        <button
          onClick={() => {
            setInviteTargetAuthority(authorityId || '');
            setShowInviteModal(true);
          }}
          className="flex items-center gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:from-cyan-700 hover:to-blue-700 transition-all shadow-lg shadow-cyan-200/50"
        >
          <UserPlus size={18} />
          הזמן רכז חדש
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 border-r-4 border-r-cyan-500 p-5">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">משתמשים רשומים</p>
          <p className="text-3xl font-black text-slate-800">{totalUsers}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 border-r-4 border-r-cyan-500 p-5">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">יחידות / שכונות</p>
          <p className="text-3xl font-black text-slate-800">{totalSubUnits}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 border-r-4 border-r-cyan-500 p-5">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">פעילים ב-7 ימים</p>
          <p className="text-3xl font-black text-slate-800">{activeUsersLast7d}</p>
          {totalUsers > 0 && (
            <p className="text-[10px] text-slate-400 mt-0.5">{Math.round((activeUsersLast7d / totalUsers) * 100)}% מהרשומים</p>
          )}
        </div>
      </div>

      {/* Feedback */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3">
          <AlertCircle size={18} className="text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-800">{error}</p>
          <button onClick={() => setError('')} className="mr-auto"><X size={16} className="text-red-400" /></button>
        </div>
      )}
      {success && (
        <div className="p-4 rounded-xl bg-green-50 border border-green-200 flex items-start gap-3">
          <CheckCircle size={18} className="text-green-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-green-800">{success}</p>
            {copiedLink && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  readOnly
                  value={copiedLink}
                  className="flex-1 text-xs bg-green-100 border border-green-300 rounded-lg px-3 py-1.5 font-mono"
                  dir="ltr"
                />
                <button
                  onClick={() => copyToClipboard(copiedLink)}
                  className="text-green-700 hover:text-green-900"
                >
                  <Copy size={16} />
                </button>
              </div>
            )}
          </div>
          <button onClick={() => { setSuccess(''); setCopiedLink(null); }} className="mr-auto">
            <X size={16} className="text-green-400" />
          </button>
        </div>
      )}

      {/* Active Team Members */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <h2 className="font-bold text-gray-800 flex items-center gap-2">
            <Shield size={18} className="text-cyan-600" />
            חברי צוות פעילים ({teamMembers.length})
          </h2>
        </div>

        {teamMembers.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <Users size={40} className="mx-auto mb-3 text-gray-300" />
            <p>אין חברי צוות עדיין. הזמן רכזים כדי להתחיל.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {teamMembers.map((member) => {
              const memberAuth = getMemberAuthority(member.uid);
              const isCurrentUser = member.uid === currentUserId;
              return (
                <div
                  key={member.uid}
                  className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50/50 transition-colors"
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 overflow-hidden">
                    {member.photoURL ? (
                      <img src={member.photoURL} alt="" className="w-full h-full object-cover" />
                    ) : (
                      member.name.charAt(0).toUpperCase()
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 truncate">
                      {member.name}
                      {isCurrentUser && (
                        <span className="text-xs text-cyan-600 font-medium mr-2">(את/ה)</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 truncate" dir="ltr">{member.email}</p>
                  </div>

                  {/* Authority badge */}
                  {memberAuth && (
                    <span className="hidden sm:flex items-center gap-1 text-xs bg-cyan-50 text-cyan-700 px-2.5 py-1 rounded-full font-medium">
                      <MapPin size={12} />
                      {memberAuth}
                    </span>
                  )}

                  {/* Remove */}
                  {!isCurrentUser && (
                    <button
                      onClick={() => handleRemoveMember(member.uid)}
                      disabled={removingUid === member.uid}
                      className="text-red-400 hover:text-red-600 transition-colors p-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50"
                      title="הסר מהצוות"
                    >
                      {removingUid === member.uid ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Trash2 size={16} />
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pending Invitations */}
      {pendingInvitations.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-yellow-50/50">
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
              <Clock size={18} className="text-yellow-600" />
              הזמנות ממתינות ({pendingInvitations.length})
            </h2>
          </div>
          <div className="divide-y divide-gray-50">
            {pendingInvitations.map((inv) => {
              const targetAuth =
                inv.authorityId === authorityId
                  ? authorityDisplayName
                  : childAuthorities.find((c) => c.id === inv.authorityId)?.name || inv.authorityId;
              const targetName = typeof targetAuth === 'string' ? targetAuth : (targetAuth as any)?.he || '';
              const expiresDate = inv.expiresAt instanceof Date ? inv.expiresAt : new Date(inv.expiresAt);
              const isExpired = expiresDate < new Date();

              return (
                <div key={inv.id} className="px-6 py-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
                    <Mail size={18} className="text-yellow-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate" dir="ltr">{inv.email}</p>
                    <p className="text-xs text-gray-500">
                      {targetName && <span>עבור {targetName} • </span>}
                      {isExpired ? (
                        <span className="text-red-500">פג תוקף</span>
                      ) : (
                        <span>תוקף עד {expiresDate.toLocaleDateString('he-IL')}</span>
                      )}
                    </p>
                  </div>
                  {!isExpired && (
                    <button
                      onClick={() =>
                        copyToClipboard(
                          `${window.location.origin}/admin/authority-login?token=${inv.token}${inv.authorityId ? `&authority=${inv.authorityId}` : ''}`
                        )
                      }
                      className="text-cyan-600 hover:text-cyan-800 p-1.5 rounded-lg hover:bg-cyan-50 transition-colors"
                      title="העתק קישור"
                    >
                      <Copy size={16} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Invite Modal — shared component */}
      <InviteMemberModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        context={{
          tenantType: authority ? authorityTypeToTenantType(authority.type) : undefined,
          authorityId: authorityId || undefined,
          tenantId: authorityId || undefined,
          organizationName: authorityDisplayName,
        }}
        callerInfo={{
          adminId: currentUserId || '',
          adminName: '',
          adminEmail: currentUserEmail || '',
          callerAuthorityId: authorityId || undefined,
        }}
        onSuccess={(result) => {
          setCopiedLink(result.inviteLink);
          setSuccess('הזמנה נוצרה בהצלחה');
          setShowInviteModal(false);
          if (authorityId) loadTeamData(authorityId);
        }}
      />
    </div>
  );
}
