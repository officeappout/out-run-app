'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { getAuthoritiesByManager, getAllAuthorities, getAuthority, getChildrenByParent } from '@/features/admin/services/authority.service';
import { authorityTypeToTenantType, getTenantLabels, orgTypeDisplayName, VERTICAL_THEMES } from '@/features/admin/config/tenantLabels';
import type { Authority, TenantType } from '@/types/admin-types';
import { Loader2, Users, ChevronLeft, Building2, Globe, Plus, X, Shield, GraduationCap, Upload, AlertTriangle, CheckCircle, Trash2 } from 'lucide-react';
import { importHierarchyFromJSON, type HierarchyImportResult } from '@/features/admin/services/unit-import.service';
import { syncTenantUnitCount } from '@/features/admin/services/unit-count-sync.service';
import AdminBreadcrumb from '@/features/admin/components/AdminBreadcrumb';
import SearchableSelect from '@/features/admin/components/SearchableSelect';

interface UnitRow {
  id: string;
  name: string;
  memberCount: number;
  unitPath: string[];
}

export default function UnitsListPage() {
  const searchParams = useSearchParams();
  const typeFilter = searchParams?.get('type') as TenantType | null;
  const urlOrgId = searchParams?.get('org') as string | null;

  const [loading, setLoading] = useState(true);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [tenantType, setTenantType] = useState<string>('municipal');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [allOrgs, setAllOrgs] = useState<Authority[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [orgDisplayName, setOrgDisplayName] = useState<string>('');
  const [authoritySubType, setAuthoritySubType] = useState<string>('');

  // Summary stats
  const [totalUsers, setTotalUsers] = useState(0);
  const [activeUsersLast7d, setActiveUsersLast7d] = useState(0);

  // Add Unit form
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [newUnitName, setNewUnitName] = useState('');
  const [creatingUnit, setCreatingUnit] = useState(false);

  const loadUnitsForAuthority = async (authId: string) => {
    const a = await getAuthority(authId);
    let derived: string = 'municipal';
    if (a) {
      derived = authorityTypeToTenantType(a.type);
      setTenantType(derived);
      setAuthoritySubType(a.type);
      const name = typeof a.name === 'string' ? a.name : (a.name as any)?.he || authId;
      setOrgDisplayName(name);
    }

    let rows: UnitRow[] = [];

    if (derived === 'municipal') {
      // Municipal: children are stored as child authorities (neighborhoods / settlements)
      try {
        const children = await getChildrenByParent(authId);
        rows = children.map(child => ({
          id: child.id,
          name: typeof child.name === 'string' ? child.name : child.id,
          memberCount: child.userCount ?? 0,
          unitPath: [],
        }));
      } catch { /* ignore */ }
    } else {
      // Military / Educational: units stored in tenants/{orgId}/units subcollection
      const unitsSnap = await getDocs(collection(db, 'tenants', authId, 'units'));
      rows = unitsSnap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name ?? d.id,
          memberCount: data.memberCount ?? 0,
          unitPath: data.unitPath ?? [],
        };
      });
    }

    // Fallback: if nothing found, check for direct users
    if (rows.length === 0 && a) {
      try {
        const usersSnap = await getDocs(query(
          collection(db, 'users'),
          where('core.unitId', '==', authId),
        ));
        if (usersSnap.size > 0) {
          rows.push({
            id: authId,
            name: typeof a.name === 'string' ? a.name : authId,
            memberCount: usersSnap.size,
            unitPath: [],
          });
        }
      } catch { /* ignore */ }
    }

    setUnits(rows);

    // Load summary stats: total registered users + 7-day active users
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
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }

      try {
        const role = await checkUserRole(user.uid);
        setIsSuperAdmin(role.isSuperAdmin);

        if (role.isSuperAdmin) {
          const orgs = await getAllAuthorities();
          let filtered = orgs;
          if (typeFilter) {
            filtered = orgs.filter(o => authorityTypeToTenantType(o.type) === typeFilter);
          }
          setAllOrgs(filtered);

          // Only auto-select if there's an explicit URL org or saved context — never default to first
          const savedId = typeof window !== 'undefined' ? localStorage.getItem('admin_selected_org_id') : null;
          const targetId = (urlOrgId && filtered.some(o => o.id === urlOrgId))
            ? urlOrgId
            : (savedId && savedId !== 'all' && filtered.some(o => o.id === savedId))
              ? savedId
              : null;

          if (targetId) {
            setSelectedOrgId(targetId);
            await loadUnitsForAuthority(targetId);
          }
        } else {
          const auths = await getAuthoritiesByManager(user.uid);
          const authority = auths[0];
          if (!authority) { setLoading(false); return; }
          setSelectedOrgId(authority.id);
          await loadUnitsForAuthority(authority.id);
        }
      } catch (err) {
        console.error('[Units] load error:', err);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [typeFilter]);

  const labels = getTenantLabels(tenantType as any);
  const theme = VERTICAL_THEMES[tenantType as TenantType] ?? VERTICAL_THEMES.municipal;
  const isMunicipal = tenantType === 'municipal';
  const childLabel = isMunicipal
    ? (authoritySubType === 'regional_council' ? 'יישוב' : 'שכונה')
    : (labels.hierarchyLabels[1] ?? labels.subUnitSingular);

  // Import modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importParseError, setImportParseError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<HierarchyImportResult | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  const handleCreateUnit = async () => {
    if (!newUnitName.trim() || !selectedOrgId) return;
    setCreatingUnit(true);
    try {
      const trimmed = newUnitName.trim();
      const slug = trimmed.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      const suffix = Math.random().toString(36).substring(2, 6);
      const unitId = slug ? `${slug}_${suffix}` : `unit_${suffix}`;

      if (isMunicipal) {
        const childType = authoritySubType === 'regional_council' ? 'local_council' : 'neighborhood';
        await setDoc(doc(db, 'authorities', unitId), {
          name: trimmed,
          type: childType,
          parentAuthorityId: selectedOrgId,
          managerIds: [],
          userCount: 0,
          status: 'active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, 'tenants', selectedOrgId, 'units', unitId), {
          name: trimmed,
          memberCount: 0,
          unitPath: [trimmed],
          createdAt: serverTimestamp(),
        });
        syncTenantUnitCount(selectedOrgId).catch(() => {});
      }

      setUnits(prev => [...prev, { id: unitId, name: trimmed, memberCount: 0, unitPath: [] }]);
      setNewUnitName('');
      setShowAddUnit(false);
    } catch (err) {
      console.error('Error creating unit:', err);
    } finally {
      setCreatingUnit(false);
    }
  };

  const handleDeleteAllUnits = async () => {
    if (!selectedOrgId) return;
    setDeletingAll(true);
    try {
      const unitsSnap = await getDocs(collection(db, 'tenants', selectedOrgId, 'units'));
      const BATCH_SIZE = 490;
      for (let i = 0; i < unitsSnap.docs.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = unitsSnap.docs.slice(i, i + BATCH_SIZE);
        for (const d of chunk) {
          batch.delete(d.ref);
        }
        await batch.commit();
      }
      setUnits([]);
      setShowDeleteConfirm(false);
      syncTenantUnitCount(selectedOrgId).catch(() => {});
    } catch (err) {
      console.error('Error deleting all units:', err);
    } finally {
      setDeletingAll(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-6 pb-12 max-w-4xl mx-auto">
      {/* Org Selector for Super Admins */}
      {isSuperAdmin && allOrgs.length > 1 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
          <Globe size={20} className="text-cyan-600 flex-shrink-0" />
          <div className="flex-1" style={{ position: 'relative', zIndex: 20 }}>
            <label className="text-xs font-bold text-slate-500 block mb-1">בחר ארגון</label>
            <SearchableSelect
              options={allOrgs.map(org => {
                const name = typeof org.name === 'string' ? org.name : (org.name as any)?.he || org.id;
                return { id: org.id, label: `${name} (${orgTypeDisplayName(authorityTypeToTenantType(org.type))})` };
              })}
              value={selectedOrgId}
              onChange={async (id) => {
                if (!id) return;
                setSelectedOrgId(id);
                setLoading(true);
                await loadUnitsForAuthority(id);
                setLoading(false);
              }}
              placeholder="בחר ארגון..."
            />
          </div>
        </div>
      )}

      {/* Overview: show all orgs as clickable cards when no org is selected */}
      {isSuperAdmin && !selectedOrgId && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${typeFilter === 'military' ? 'bg-lime-50' : typeFilter === 'educational' ? 'bg-orange-50' : 'bg-blue-50'}`}>
              {typeFilter === 'military' ? <Shield size={24} className="text-lime-700" /> : typeFilter === 'educational' ? <GraduationCap size={24} className="text-orange-600" /> : <Building2 size={24} className="text-blue-700" />}
            </div>
            <div>
              <h1 className="text-2xl font-black text-gray-900">
                {typeFilter === 'military' ? 'סקירת חטיבות' : typeFilter === 'educational' ? 'סקירת בתי ספר' : 'סקירת רשויות'}
              </h1>
              <p className="text-sm text-slate-400">{allOrgs.length} ארגונים — בחר ארגון לצפייה בהיררכיה</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {allOrgs.map(org => {
              const name = typeof org.name === 'string' ? org.name : (org.name as any)?.he || org.id;
              const count = org.unitCount ?? 0;
              const orgTheme = VERTICAL_THEMES[authorityTypeToTenantType(org.type)] ?? VERTICAL_THEMES.municipal;
              return (
                <button
                  key={org.id}
                  onClick={async () => {
                    setSelectedOrgId(org.id);
                    setLoading(true);
                    await loadUnitsForAuthority(org.id);
                    setLoading(false);
                  }}
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-right hover:shadow-md hover:border-gray-200 transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${orgTheme.accentBg}`}>
                        {authorityTypeToTenantType(org.type) === 'military' ? <Shield size={18} className={orgTheme.accentText} /> : authorityTypeToTenantType(org.type) === 'educational' ? <GraduationCap size={18} className={orgTheme.accentText} /> : <Building2 size={18} className={orgTheme.accentText} />}
                      </div>
                      <div>
                        <p className="font-black text-gray-900 group-hover:text-cyan-700 transition-colors">{name}</p>
                        <p className="text-xs text-slate-400">{count} יחידות</p>
                      </div>
                    </div>
                    <ChevronLeft size={18} className="text-slate-300 group-hover:text-cyan-500 transition-colors" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {(selectedOrgId || !isSuperAdmin) && (
      <>
      <AdminBreadcrumb items={[
        { label: 'ארגונים', href: '/admin/organizations' },
        ...(orgDisplayName ? [{ label: orgDisplayName }] : []),
        { label: labels.subUnitsTitle },
      ]} />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${theme.accentBg}`}>
            {tenantType === 'military'
              ? <Shield size={24} className={theme.accentText} />
              : tenantType === 'educational'
              ? <GraduationCap size={24} className={theme.accentText} />
              : <Building2 size={24} className={theme.accentText} />
            }
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900">{labels.subUnitsTitle}</h1>
            <p className="text-sm text-gray-500">
              {orgDisplayName ? `${orgDisplayName} — ` : ''}ניהול {labels.subUnitsTitle} ו{labels.membersTitle}
            </p>
          </div>
        </div>
        {selectedOrgId && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddUnit(true)}
              className={`flex items-center gap-2 text-white px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg ${
                tenantType === 'military' ? 'bg-lime-700 hover:bg-lime-800 shadow-lime-200/50'
                : tenantType === 'educational' ? 'bg-orange-600 hover:bg-orange-700 shadow-orange-200/50'
                : 'bg-blue-700 hover:bg-blue-800 shadow-blue-200/50'
              }`}
            >
              <Plus size={16} />
              הוסף {childLabel}
            </button>
            {!isMunicipal && (
              <button
                onClick={() => { setShowImportModal(true); setImportJson(''); setImportParseError(''); }}
                className="flex items-center gap-2 bg-violet-50 hover:bg-violet-100 text-violet-700 px-4 py-2.5 rounded-xl font-bold text-sm transition-all border border-violet-200"
              >
                <Upload size={16} />
                ייבוא JSON
              </button>
            )}
            {!isMunicipal && units.length > 0 && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 px-4 py-2.5 rounded-xl font-bold text-sm transition-all border border-red-200"
              >
                <Trash2 size={16} />
                מחק הכל
              </button>
            )}
          </div>
        )}
      </div>

      {/* Summary Stats */}
      {selectedOrgId && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-5 ${theme.headerBorder} border-r-4`}>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">משתמשים רשומים</p>
            <p className="text-3xl font-black text-slate-800">{totalUsers}</p>
          </div>
          <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-5 ${theme.headerBorder} border-r-4`}>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">{isMunicipal ? 'שכונות / יישובים' : labels.subUnitsTitle}</p>
            <p className="text-3xl font-black text-slate-800">{units.length}</p>
          </div>
          <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-5 ${theme.headerBorder} border-r-4`}>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">פעילים ב-7 ימים</p>
            <p className="text-3xl font-black text-slate-800">{activeUsersLast7d}</p>
            {totalUsers > 0 && (
              <p className="text-[10px] text-slate-400 mt-0.5">{Math.round((activeUsersLast7d / totalUsers) * 100)}% מהרשומים</p>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={() => { if (!deletingAll) setShowDeleteConfirm(false); }}>
          <div
            dir="rtl"
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center">
                <Trash2 size={24} className="text-red-500" />
              </div>
              <div>
                <h2 className="text-lg font-black text-gray-900">מחיקת כל היחידות</h2>
                <p className="text-sm text-slate-500">האם למחוק את כל {units.length} היחידות ב-{orgDisplayName}?</p>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-sm text-red-700 font-bold">פעולה זו בלתי הפיכה! כל היחידות ותתי-היחידות יימחקו.</p>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deletingAll}
                className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold transition-all disabled:opacity-50"
              >
                ביטול
              </button>
              <button
                onClick={handleDeleteAllUnits}
                disabled={deletingAll}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-all disabled:opacity-50"
              >
                {deletingAll ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {deletingAll ? 'מוחק...' : 'מחק הכל'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Result Feedback */}
      {importResult && (
        <div className={`p-4 rounded-xl flex items-center justify-between gap-3 ${
          importResult.errors.length > 0
            ? 'bg-amber-50 border border-amber-200'
            : 'bg-green-50 border border-green-200'
        }`}>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {importResult.errors.length > 0
              ? <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
              : <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
            }
            <span className="text-sm font-bold">
              {importResult.created > 0 && `${importResult.created} יחידות נוצרו בהצלחה.`}
              {importResult.errors.length > 0 && ` ${importResult.errors.length} שגיאות: ${importResult.errors[0]}`}
            </span>
          </div>
          <button onClick={() => setImportResult(null)} className="text-slate-400 hover:text-slate-600 flex-shrink-0">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ═══ JSON Import Modal ═══ */}
      {showImportModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={() => { if (!importing) setShowImportModal(false); }}>
          <div
            dir="rtl"
            className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center">
                  <Upload size={20} className="text-violet-600" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-gray-900">ייבוא היררכיה מ-JSON</h2>
                  <p className="text-xs text-slate-500">הדבק את מבנה היחידות בפורמט JSON</p>
                </div>
              </div>
              <button
                onClick={() => { if (!importing) setShowImportModal(false); }}
                disabled={importing}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-500 font-mono leading-relaxed" dir="ltr">
                <span className="text-slate-400">{'{'}</span>{'\n'}
                {'  '}<span className="text-violet-600">"units"</span>: [{'\n'}
                {'    '}{'{'} <span className="text-violet-600">"name"</span>: <span className="text-green-600">"גדוד 101"</span>, <span className="text-violet-600">"type"</span>: <span className="text-green-600">"battalion"</span>,{'\n'}
                {'      '}<span className="text-violet-600">"subUnits"</span>: [{'{'} <span className="text-violet-600">"name"</span>: <span className="text-green-600">"פלוגה א'"</span> {'}'}] {'}'}{'\n'}
                {'  '}]{'\n'}
                <span className="text-slate-400">{'}'}</span>
              </div>

              <textarea
                value={importJson}
                onChange={e => { setImportJson(e.target.value); setImportParseError(''); }}
                placeholder='{"units": [{"name": "...", "subUnits": [...]}]}'
                dir="ltr"
                className={`w-full h-64 px-4 py-3 rounded-xl border-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 transition-colors ${
                  importParseError
                    ? 'border-red-300 focus:ring-red-200 bg-red-50/30'
                    : 'border-gray-200 focus:ring-violet-200 focus:border-violet-400'
                }`}
              />

              {importParseError && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200">
                  <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700 font-bold">{importParseError}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100 bg-slate-50/50">
              <button
                onClick={() => setShowImportModal(false)}
                disabled={importing}
                className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold transition-all disabled:opacity-50"
              >
                ביטול
              </button>
              <button
                onClick={async () => {
                  const trimmed = importJson.trim();
                  if (!trimmed) {
                    setImportParseError('הטקסט ריק — הדבק JSON תקין.');
                    return;
                  }

                  let parsed: any;
                  try {
                    parsed = JSON.parse(trimmed);
                  } catch (err: any) {
                    setImportParseError(`JSON לא תקין: ${err?.message || 'שגיאת פענוח'}`);
                    return;
                  }

                  if (!parsed?.units || !Array.isArray(parsed.units) || parsed.units.length === 0) {
                    setImportParseError('ה-JSON חייב להכיל מערך "units" עם לפחות יחידה אחת.');
                    return;
                  }

                  setImportParseError('');
                  setImporting(true);
                  try {
                    const result = await importHierarchyFromJSON(selectedOrgId, parsed);
                    setImportResult(result);
                    await syncTenantUnitCount(selectedOrgId);
                    await loadUnitsForAuthority(selectedOrgId);
                    setShowImportModal(false);
                    setImportJson('');
                  } catch (err: any) {
                    setImportParseError(err?.message || 'שגיאה בלתי צפויה בייבוא.');
                  } finally {
                    setImporting(false);
                  }
                }}
                disabled={importing || !importJson.trim()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold transition-all disabled:opacity-50 shadow-lg shadow-violet-200/50"
              >
                {importing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                {importing ? 'מייבא...' : 'אמת וייבא'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Unit Inline Form */}
      {showAddUnit && (
        <div className={`bg-white rounded-2xl shadow-sm border-l-4 border border-gray-100 p-5 ${theme.headerBorder}`}>
          <h3 className="text-sm font-black text-gray-900 mb-3 flex items-center gap-2">
            <Plus size={16} className={theme.accentText} />
            הוסף {childLabel} ל-{orgDisplayName}
          </h3>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={newUnitName}
              onChange={e => setNewUnitName(e.target.value)}
              placeholder={`שם ה${childLabel}`}
              className="flex-1 px-4 py-2.5 rounded-xl border-2 border-gray-200 text-sm focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200 outline-none"
            />
            <button
              onClick={handleCreateUnit}
              disabled={!newUnitName.trim() || creatingUnit}
              className={`flex items-center gap-2 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-all disabled:opacity-50 ${
                tenantType === 'military' ? 'bg-lime-700 hover:bg-lime-800'
                : tenantType === 'educational' ? 'bg-orange-600 hover:bg-orange-700'
                : 'bg-blue-700 hover:bg-blue-800'
              }`}
            >
              {creatingUnit ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              צור
            </button>
            <button onClick={() => { setShowAddUnit(false); setNewUnitName(''); }} className="text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {units.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          {tenantType === 'military'
            ? <Shield className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            : <Building2 className="w-10 h-10 mx-auto mb-3 text-slate-200" />
          }
          <p className="text-sm font-bold">אין {labels.subUnitsTitle} להצגה</p>
        </div>
      ) : (
        <div className="space-y-3">
          {units.map(unit => (
            <Link
              key={unit.id}
              href={`/admin/authority/units/${unit.id}?type=${tenantType}&org=${selectedOrgId}`}
              className="flex items-center justify-between bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  tenantType === 'military' ? 'bg-lime-50' : tenantType === 'educational' ? 'bg-orange-50' : 'bg-slate-100'
                }`}>
                  {tenantType === 'military'
                    ? <Shield size={18} className="text-lime-700" />
                    : tenantType === 'educational'
                    ? <GraduationCap size={18} className="text-orange-600" />
                    : <Users size={18} className="text-slate-600" />
                  }
                </div>
                <div>
                  <p className="font-bold text-slate-800">{unit.name}</p>
                  {unit.unitPath.length > 0 && (
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {unit.unitPath.join(' › ')}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-cyan-600">
                  {unit.memberCount} {labels.membersTitle}
                </span>
                <ChevronLeft size={16} className="text-slate-300" />
              </div>
            </Link>
          ))}
        </div>
      )}
      </>
      )}
    </div>
  );
}
