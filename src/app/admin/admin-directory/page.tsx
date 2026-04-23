'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { collection, getDocs, query, where, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { getAllInvitations } from '@/features/admin/services/invitation.service';
import { getAllAuthorities } from '@/features/admin/services/authority.service';
import type { AdminInvitation } from '@/types/invitation.type';
import type { Authority } from '@/types/admin-types';
import {
  Loader2, Search, Users, Shield, ShieldCheck, Building2,
  GraduationCap, Mail, Clock, CheckCircle, XCircle,
  ArrowUpDown, UserCheck, UserX, Pencil, X, Save,
} from 'lucide-react';
import SearchableSelect from '@/features/admin/components/SearchableSelect';

interface DirectoryEntry {
  uid: string;
  name: string;
  email: string;
  role: 'super_admin' | 'vertical_admin' | 'authority_manager' | 'unit_admin' | 'tenant_owner' | 'pending';
  assignedEntity: string;
  organizationalContext: string;
  tenantType?: string;
  managedVertical?: string;
  unitPath?: string[];
  status: 'active' | 'invited' | 'expired';
  invitedAt?: Date;
  acceptedAt?: Date;
  lastLoginAt?: Date;
}

type SortKey = 'name' | 'email' | 'role' | 'assignedEntity' | 'organizationalContext' | 'status' | 'lastLoginAt';

function relativeTime(date?: Date): string {
  if (!date) return '—';
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'כעת';
  if (minutes < 60) return `לפני ${minutes} דק׳`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `לפני ${hours} שע׳`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `לפני ${days} ימים`;
  return date.toLocaleDateString('he-IL');
}

function toJsDate(ts: any): Date | undefined {
  if (!ts) return undefined;
  if (ts instanceof Date) return ts;
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (ts.seconds) return new Date(ts.seconds * 1000);
  return new Date(ts);
}

export default function AdminDirectoryPage() {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterVertical, setFilterVertical] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);

  const [editEntry, setEditEntry] = useState<DirectoryEntry | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editVertical, setEditVertical] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }

      try {
        const role = await checkUserRole(user.uid);
        if (!role.isSuperAdmin) { setLoading(false); return; }

        const [usersSnap, invitations, authorities] = await Promise.all([
          getDocs(query(collection(db, 'users'), where('role', '==', 'admin'))),
          getAllInvitations(),
          getAllAuthorities(),
        ]);

        const authorityMap = new Map<string, Authority>();
        for (const a of authorities) authorityMap.set(a.id, a);

        const directory: DirectoryEntry[] = [];
        const processedEmails = new Set<string>();

        for (const userDoc of usersSnap.docs) {
          const data = userDoc.data();
          const core = (data.core ?? {}) as Record<string, any>;

          const email = (core.email ?? '').toLowerCase();
          processedEmails.add(email);

          const authorityId = core.authorityId;
          const tenantId = core.tenantId;
          const unitPath = core.unitPath;
          const isSuperAdmin = core.isSuperAdmin === true;
          const isVerticalAdmin = core.isVerticalAdmin === true;
          const managedVertical = core.managedVertical || undefined;
          const lastLoginAt = toJsDate(core.lastLoginAt);

          let assignedEntity = '—';
          let entryRole: DirectoryEntry['role'] = 'authority_manager';
          const isTenantOwnerFlag = core.isTenantOwner === true;
          const userTenantType = core.tenantType || undefined;

          if (isSuperAdmin) {
            entryRole = 'super_admin';
            assignedEntity = 'Super Admin — גלובלי';
          } else if (isVerticalAdmin && managedVertical) {
            entryRole = 'vertical_admin';
            const verticalLabel = managedVertical === 'military' ? 'צבאי' : managedVertical === 'educational' ? 'חינוכי' : 'עירוני';
            assignedEntity = `מנהל ורטיקלי — ${verticalLabel}`;
          } else if (isTenantOwnerFlag && tenantId) {
            entryRole = 'tenant_owner';
            if (authorityId) {
              const auth = authorityMap.get(authorityId);
              assignedEntity = auth?.name ?? authorityId;
            } else {
              assignedEntity = tenantId;
            }
          } else if (tenantId && unitPath?.length > 0) {
            entryRole = 'unit_admin';
            assignedEntity = unitPath.join(' › ');
          } else if (authorityId) {
            const auth = authorityMap.get(authorityId);
            assignedEntity = auth?.name ?? authorityId;
          }

          const tenantTypeLabel =
            userTenantType === 'military' ? 'צבאי' :
            userTenantType === 'educational' ? 'חינוכי' :
            userTenantType === 'municipal' ? 'עירוני' :
            managedVertical === 'military' ? 'צבאי' :
            managedVertical === 'educational' ? 'חינוכי' :
            managedVertical === 'municipal' ? 'עירוני' :
            authorityId ? 'עירוני' : '—';

          const orgCtx = entryRole === 'super_admin' ? 'גלובלי — כל הארגונים'
            : entryRole === 'vertical_admin' ? `ורטיקלי — ${tenantTypeLabel}`
            : isTenantOwnerFlag ? `בעל ארגון (${tenantTypeLabel})`
            : unitPath?.length ? `${tenantTypeLabel} › ${unitPath.join(' › ')}`
            : authorityId ? `${tenantTypeLabel} — ${authorityMap.get(authorityId)?.name ?? authorityId}`
            : '—';

          directory.push({
            uid: userDoc.id,
            name: core.name ?? 'ללא שם',
            email,
            role: entryRole,
            assignedEntity,
            organizationalContext: orgCtx,
            tenantType: userTenantType || managedVertical,
            managedVertical,
            unitPath: unitPath ?? undefined,
            status: 'active',
            lastLoginAt,
          });
        }

        for (const inv of invitations) {
          if (inv.isUsed) continue;
          if (processedEmails.has(inv.email.toLowerCase())) continue;

          const isExpired = inv.expiresAt && inv.expiresAt < new Date();
          let assignedEntity = '—';

          if (inv.unitPath && inv.unitPath.length > 0) {
            assignedEntity = inv.unitPath.join(' › ');
          } else if (inv.authorityId) {
            const auth = authorityMap.get(inv.authorityId);
            assignedEntity = auth?.name ?? inv.authorityId;
          }

          const invRole: DirectoryEntry['role'] =
            inv.role === 'super_admin' ? 'super_admin'
            : inv.role === 'vertical_admin' ? 'vertical_admin'
            : inv.role === 'tenant_owner' ? 'tenant_owner'
            : inv.role === 'unit_admin' ? 'unit_admin'
            : 'authority_manager';

          if (invRole === 'vertical_admin' && inv.managedVertical) {
            const vLabel = inv.managedVertical === 'military' ? 'צבאי' : inv.managedVertical === 'educational' ? 'חינוכי' : 'עירוני';
            assignedEntity = `מנהל ורטיקלי — ${vLabel}`;
          }

          const invOrgCtx = invRole === 'super_admin' ? 'גלובלי — כל הארגונים'
            : invRole === 'vertical_admin' ? `ורטיקלי`
            : invRole === 'tenant_owner' ? `בעל ארגון`
            : inv.unitPath?.length ? inv.unitPath.join(' › ')
            : inv.authorityId ? `${authorityMap.get(inv.authorityId)?.name ?? inv.authorityId}`
            : '—';

          directory.push({
            uid: inv.id,
            name: inv.email.split('@')[0],
            email: inv.email,
            role: invRole,
            assignedEntity,
            organizationalContext: invOrgCtx,
            tenantType: inv.managedVertical || undefined,
            managedVertical: inv.managedVertical || undefined,
            status: isExpired ? 'expired' : 'invited',
            invitedAt: inv.createdAt,
          });
        }

        setEntries(directory);
      } catch (err) {
        console.error('[AdminDirectory] error:', err);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(prev => !prev);
    else { setSortKey(key); setSortAsc(true); }
  };

  const filtered = useMemo(() => {
    let list = [...entries];

    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        e.assignedEntity.toLowerCase().includes(q),
      );
    }

    if (filterRole !== 'all') list = list.filter(e => e.role === filterRole);
    if (filterStatus !== 'all') list = list.filter(e => e.status === filterStatus);
    if (filterVertical !== 'all') list = list.filter(e => e.tenantType === filterVertical || e.managedVertical === filterVertical);

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name': cmp = a.name.localeCompare(b.name, 'he'); break;
        case 'email': cmp = a.email.localeCompare(b.email); break;
        case 'role': cmp = a.role.localeCompare(b.role); break;
        case 'assignedEntity': cmp = a.assignedEntity.localeCompare(b.assignedEntity, 'he'); break;
        case 'organizationalContext': cmp = a.organizationalContext.localeCompare(b.organizationalContext, 'he'); break;
        case 'status': cmp = a.status.localeCompare(b.status); break;
        case 'lastLoginAt': {
          const at = a.lastLoginAt?.getTime() ?? 0;
          const bt = b.lastLoginAt?.getTime() ?? 0;
          cmp = at - bt;
          break;
        }
      }
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [entries, searchTerm, filterRole, filterStatus, filterVertical, sortKey, sortAsc]);

  const counts = useMemo(() => ({
    total: entries.length,
    active: entries.filter(e => e.status === 'active').length,
    invited: entries.filter(e => e.status === 'invited').length,
    expired: entries.filter(e => e.status === 'expired').length,
  }), [entries]);

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <th
      onClick={() => toggleSort(field)}
      className="text-right py-3 px-4 cursor-pointer select-none hover:text-slate-600 transition-colors"
    >
      <span className="flex items-center gap-1">
        {label}
        <ArrowUpDown size={10} className={sortKey === field ? 'text-cyan-500' : 'text-slate-300'} />
      </span>
    </th>
  );

  const roleLabel = (role: string) => {
    switch (role) {
      case 'super_admin': return 'סופר אדמין';
      case 'vertical_admin': return 'מנהל ורטיקלי';
      case 'tenant_owner': return 'בעל ארגון';
      case 'authority_manager': return 'מנהל רשות';
      case 'unit_admin': return 'מנהל יחידה';
      default: return role;
    }
  };

  const roleBadge = (role: string) => {
    const colors: Record<string, string> = {
      super_admin: 'bg-violet-100 text-violet-700',
      vertical_admin: 'bg-amber-100 text-amber-700',
      tenant_owner: 'bg-emerald-100 text-emerald-700',
      authority_manager: 'bg-cyan-100 text-cyan-700',
      unit_admin: 'bg-red-100 text-red-700',
    };
    return (
      <span className={`text-[11px] font-black px-2.5 py-1 rounded-lg ${colors[role] ?? 'bg-slate-100 text-slate-600'}`}>
        {roleLabel(role)}
      </span>
    );
  };

  const statusBadge = (status: string) => {
    if (status === 'active') return (
      <span className="flex items-center gap-1 text-[11px] font-bold text-green-600">
        <UserCheck size={12} /> פעיל
      </span>
    );
    if (status === 'invited') return (
      <span className="flex items-center gap-1 text-[11px] font-bold text-amber-600">
        <Mail size={12} /> הוזמן
      </span>
    );
    return (
      <span className="flex items-center gap-1 text-[11px] font-bold text-red-500">
        <UserX size={12} /> פג תוקף
      </span>
    );
  };

  const openEditModal = (entry: DirectoryEntry) => {
    setEditEntry(entry);
    setEditRole(entry.role);
    setEditVertical(entry.managedVertical || '');
  };

  const handleSaveEdit = async () => {
    if (!editEntry || editEntry.status !== 'active') return;
    setSaving(true);
    try {
      const userRef = doc(db, 'users', editEntry.uid);
      const updates: Record<string, any> = {
        updatedAt: serverTimestamp(),
      };

      // Reset previous role flags
      updates['core.isSuperAdmin'] = editRole === 'super_admin';
      updates['core.isVerticalAdmin'] = editRole === 'vertical_admin';
      updates['core.isTenantOwner'] = editRole === 'tenant_owner';

      if (editRole === 'vertical_admin') {
        updates['core.managedVertical'] = editVertical || null;
      } else {
        updates['core.managedVertical'] = null;
      }

      await updateDoc(userRef, updates);

      setEntries(prev => prev.map(e => {
        if (e.uid !== editEntry.uid) return e;
        return {
          ...e,
          role: editRole as DirectoryEntry['role'],
          managedVertical: editRole === 'vertical_admin' ? editVertical : undefined,
        };
      }));

      setEditEntry(null);
    } catch (err) {
      console.error('[EditAdmin] save error:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 bg-cyan-50 rounded-2xl flex items-center justify-center">
          <Users size={28} className="text-cyan-600" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-900">ספריית מנהלים</h1>
          <p className="text-sm text-gray-500">
            {counts.active} פעילים · {counts.invited} הזמנות ממתינות · {counts.expired} פגי תוקף
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap bg-white rounded-2xl shadow-sm border border-gray-100 p-4 overflow-visible relative z-10">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="חפש שם, אימייל או ארגון..."
            className="w-full pr-10 pl-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
          />
        </div>

        <div className="min-w-[140px]">
          <SearchableSelect
            options={[
              { id: 'all', label: 'כל התפקידים' },
              { id: 'super_admin', label: 'סופר אדמין' },
              { id: 'vertical_admin', label: 'מנהל ורטיקלי' },
              { id: 'tenant_owner', label: 'בעל ארגון' },
              { id: 'authority_manager', label: 'מנהל רשות' },
              { id: 'unit_admin', label: 'מנהל יחידה' },
            ]}
            value={filterRole}
            onChange={v => setFilterRole(v || 'all')}
            placeholder="כל התפקידים"
          />
        </div>

        <div className="min-w-[130px]">
          <SearchableSelect
            options={[
              { id: 'all', label: 'כל הורטיקלים' },
              { id: 'military', label: 'צבאי' },
              { id: 'municipal', label: 'עירוני' },
              { id: 'educational', label: 'חינוכי' },
            ]}
            value={filterVertical}
            onChange={v => setFilterVertical(v || 'all')}
            placeholder="כל הורטיקלים"
          />
        </div>

        <div className="min-w-[130px]">
          <SearchableSelect
            options={[
              { id: 'all', label: 'כל הסטטוסים' },
              { id: 'active', label: 'פעיל' },
              { id: 'invited', label: 'הוזמן' },
              { id: 'expired', label: 'פג תוקף' },
            ]}
            value={filterStatus}
            onChange={v => setFilterStatus(v || 'all')}
            placeholder="כל הסטטוסים"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-slate-400 font-bold border-b border-slate-200 bg-slate-50">
                <th className="text-right py-3 px-4 w-8">#</th>
                <SortHeader label="שם" field="name" />
                <SortHeader label="אימייל" field="email" />
                <SortHeader label="תפקיד" field="role" />
                <SortHeader label="ישות מנוהלת" field="assignedEntity" />
                <SortHeader label="הקשר ארגוני" field="organizationalContext" />
                <SortHeader label="כניסה אחרונה" field="lastLoginAt" />
                <SortHeader label="סטטוס" field="status" />
                <th className="text-right py-3 px-4 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry, i) => (
                <tr
                  key={entry.uid}
                  className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors"
                >
                  <td className="py-3 px-4 text-[11px] text-slate-400">{i + 1}</td>
                  <td className="py-3 px-4 font-bold text-slate-800">{entry.name}</td>
                  <td className="py-3 px-4 text-xs text-slate-600" dir="ltr">{entry.email}</td>
                  <td className="py-3 px-4">{roleBadge(entry.role)}</td>
                  <td className="py-3 px-4 text-xs text-slate-600 max-w-[200px] truncate">
                    {entry.assignedEntity}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-500 max-w-[200px] truncate">
                    {entry.organizationalContext}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-400 whitespace-nowrap">
                    {entry.status === 'active' ? relativeTime(entry.lastLoginAt) : '—'}
                  </td>
                  <td className="py-3 px-4">{statusBadge(entry.status)}</td>
                  <td className="py-3 px-4">
                    {entry.status === 'active' && (
                      <button
                        onClick={() => openEditModal(entry)}
                        className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                        title="ערוך"
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <Users className="w-8 h-8 mx-auto mb-2 text-slate-200" />
            <p className="text-sm font-bold">{searchTerm ? 'לא נמצאו תוצאות' : 'אין מנהלים במערכת'}</p>
          </div>
        )}
      </div>

      {/* Edit Admin Modal */}
      {editEntry && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative" dir="rtl">
            <button onClick={() => setEditEntry(null)} className="absolute top-4 left-4 text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>

            <h3 className="text-xl font-black text-gray-900 mb-1 flex items-center gap-2">
              <Pencil size={22} className="text-cyan-600" />
              עריכת הרשאות
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              {editEntry.name} ({editEntry.email})
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">תפקיד</label>
                <SearchableSelect
                  options={[
                    { id: 'super_admin', label: 'סופר אדמין' },
                    { id: 'vertical_admin', label: 'מנהל ורטיקלי' },
                    { id: 'tenant_owner', label: 'בעל ארגון' },
                    { id: 'authority_manager', label: 'מנהל רשות' },
                    { id: 'unit_admin', label: 'מנהל יחידה' },
                  ]}
                  value={editRole}
                  onChange={v => { if (v) setEditRole(v); }}
                  placeholder="בחר תפקיד..."
                />
              </div>

              {editRole === 'vertical_admin' && (
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">ורטיקל מנוהל</label>
                  <SearchableSelect
                    options={[
                      { id: 'military', label: 'צבאי' },
                      { id: 'municipal', label: 'עירוני' },
                      { id: 'educational', label: 'חינוכי' },
                    ]}
                    value={editVertical}
                    onChange={v => setEditVertical(v)}
                    placeholder="בחר ורטיקל..."
                  />
                </div>
              )}

              <button
                onClick={handleSaveEdit}
                disabled={saving || (editRole === 'vertical_admin' && !editVertical)}
                className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white py-3 rounded-xl font-bold text-sm hover:from-cyan-700 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving ? (
                  <><Loader2 size={18} className="animate-spin" /> שומר...</>
                ) : (
                  <><Save size={18} /> שמור שינויים</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
