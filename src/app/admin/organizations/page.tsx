'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { getAllAuthorities } from '@/features/admin/services/authority.service';
import { getUserFromFirestore } from '@/lib/firestore.service';
import { ORG_TYPE_OPTIONS, authorityTypeToTenantType, orgTypeDisplayName, VERTICAL_THEMES } from '@/features/admin/config/tenantLabels';
import { syncAllUnitCounts } from '@/features/admin/services/unit-count-sync.service';
import type { Authority, TenantType } from '@/types/admin-types';
import {
  Loader2, Plus, Search, Building2, ShieldCheck, GraduationCap,
  Users, Globe, ChevronLeft, ChevronRight, UserPlus, Copy, X, CheckCircle,
  GitBranch, Upload, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useOrgSelector } from '@/features/admin/context/OrgSelectorContext';
import InviteMemberModal from '@/features/admin/components/InviteMemberModal';
import SearchableSelect from '@/features/admin/components/SearchableSelect';

const PAGE_SIZE = 20;

const ROOT_TYPES = new Set(['city', 'regional_council', 'local_council', 'settlement', 'school', 'military_unit']);

interface OrgRow extends Authority {
  tenantType: TenantType;
  unitCount: number;
  ownerName?: string;
  ownerEmail?: string;
}

const ORG_ICON: Record<TenantType, React.ElementType> = {
  municipal: Building2,
  military: ShieldCheck,
  educational: GraduationCap,
};

const ORG_BADGE_COLOR: Record<TenantType, string> = {
  municipal: `${VERTICAL_THEMES.municipal.badgeBg} ${VERTICAL_THEMES.municipal.badgeText}`,
  military: `${VERTICAL_THEMES.military.badgeBg} ${VERTICAL_THEMES.military.badgeText}`,
  educational: `${VERTICAL_THEMES.educational.badgeBg} ${VERTICAL_THEMES.educational.badgeText}`,
};

export default function OrganizationsPage() {
  const router = useRouter();
  const orgCtx = useOrgSelector();
  const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [page, setPage] = useState(1);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<TenantType>('municipal');
  const [creating, setCreating] = useState(false);

  // Invite owner
  const [inviteOrgId, setInviteOrgId] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [success, setSuccess] = useState('');
  const [adminUid, setAdminUid] = useState('');

  // Org Import modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importParseError, setImportParseError] = useState('');
  const [importingOrgs, setImportingOrgs] = useState(false);
  const [importResult, setImportResult] = useState<{created: number; errors: string[]} | null>(null);
  const [recalculating, setRecalculating] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      setAdminUid(user.uid);

      try {
        const role = await checkUserRole(user.uid);
        if (!role.isSuperAdmin && !role.isVerticalAdmin) { setLoading(false); return; }

        const authorities = await getAllAuthorities();
        let rootAuthorities = authorities.filter(a => ROOT_TYPES.has(a.type) && !a.parentAuthorityId);

        if (role.isVerticalAdmin && role.managedVertical && !role.isSuperAdmin) {
          rootAuthorities = rootAuthorities.filter(a =>
            authorityTypeToTenantType(a.type) === role.managedVertical
          );
        }

        const rows: OrgRow[] = rootAuthorities.map(a => ({
          ...a,
          tenantType: authorityTypeToTenantType(a.type),
          unitCount: a.unitCount ?? 0,
        }));

        setOrgs(rows);

        // Lazy-load owner names in parallel (non-blocking)
        const managerIds = rows
          .map((r, i) => ({ idx: i, mid: r.managerIds?.[0] }))
          .filter(m => m.mid);

        if (managerIds.length > 0) {
          const profiles = await Promise.all(
            managerIds.map(async ({ mid }) => {
              try {
                return await getUserFromFirestore(mid!);
              } catch { return null; }
            })
          );

          setOrgs(prev => {
            const next = [...prev];
            managerIds.forEach(({ idx }, i) => {
              const profile = profiles[i];
              if (profile?.core) {
                next[idx] = {
                  ...next[idx],
                  ownerName: profile.core.name || undefined,
                  ownerEmail: profile.core.email || undefined,
                };
              }
            });
            return next;
          });
        }
      } catch (err) {
        console.error('[Organizations] load error:', err);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const allFiltered = useMemo(() => {
    let list = [...orgs];
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter(o => {
        const name = typeof o.name === 'string' ? o.name : '';
        return name.toLowerCase().includes(q) || o.id.toLowerCase().includes(q);
      });
    }
    if (filterType !== 'all') {
      list = list.filter(o => o.tenantType === filterType);
    }
    return list;
  }, [orgs, searchTerm, filterType]);

  const totalPages = Math.max(1, Math.ceil(allFiltered.length / PAGE_SIZE));
  const filtered = useMemo(() => allFiltered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [allFiltered, page]);

  useEffect(() => { setPage(1); }, [searchTerm, filterType]);

  const counts = useMemo(() => ({
    total: orgs.length,
    municipal: orgs.filter(o => o.tenantType === 'municipal').length,
    military: orgs.filter(o => o.tenantType === 'military').length,
    educational: orgs.filter(o => o.tenantType === 'educational').length,
  }), [orgs]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const slug = newName.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      const suffix = Math.random().toString(36).substring(2, 6);
      const id = slug ? `${slug}_${suffix}` : `org_${suffix}`;
      const authorityType = newType === 'military' ? 'military_unit' : newType === 'educational' ? 'school' : 'city';

      await setDoc(doc(db, 'authorities', id), {
        name: newName.trim(),
        type: authorityType,
        managerIds: [],
        userCount: 0,
        status: 'active',
        isActiveClient: false,
        pipelineStatus: 'lead',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await setDoc(doc(db, 'tenants', id), {
        name: newName.trim(),
        type: newType,
        authorityId: id,
        createdAt: serverTimestamp(),
      });

      setOrgs(prev => [...prev, {
        id,
        name: newName.trim(),
        type: authorityType,
        managerIds: [],
        userCount: 0,
        status: 'active',
        tenantType: newType,
        unitCount: 0,
      }]);

      setNewName('');
      setShowCreate(false);
      setSuccess(`ארגון "${newName.trim()}" נוצר בהצלחה`);
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      console.error('Error creating org:', err);
    } finally {
      setCreating(false);
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
    <div dir="rtl" className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-cyan-50 rounded-2xl flex items-center justify-center">
            <Globe size={28} className="text-cyan-600" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900">ניהול ארגונים</h1>
            <p className="text-sm text-gray-500">ארגוני-על בלבד (ללא שכונות / יחידות-משנה)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:from-cyan-700 hover:to-blue-700 transition-all shadow-lg shadow-cyan-200/50"
          >
            <Plus size={18} />
            ארגון חדש
          </button>
          <button
            onClick={() => { setShowImportModal(true); setImportJson(''); setImportParseError(''); }}
            className="flex items-center gap-2 bg-violet-50 hover:bg-violet-100 text-violet-700 px-5 py-2.5 rounded-xl font-bold text-sm transition-all border border-violet-200"
          >
            <Upload size={18} />
            ייבוא ארגונים
          </button>
          <button
            onClick={async () => {
              setRecalculating(true);
              try {
                const countMap = await syncAllUnitCounts();
                setOrgs(prev => prev.map(o => ({
                  ...o,
                  unitCount: countMap.get(o.id) ?? o.unitCount,
                })));
                setSuccess(`סונכרנו ${countMap.size} ארגונים בהצלחה`);
                setTimeout(() => setSuccess(''), 4000);
              } catch (err) {
                console.error('Error recalculating counts:', err);
              } finally {
                setRecalculating(false);
              }
            }}
            disabled={recalculating}
            className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 text-slate-700 px-4 py-2.5 rounded-xl font-bold text-sm transition-all border border-slate-200 disabled:opacity-50"
          >
            <RefreshCw size={16} className={recalculating ? 'animate-spin' : ''} />
            {recalculating ? 'מחשב...' : 'עדכן ספירות'}
          </button>
        </div>
      </div>

      {/* Summary Bar */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-center">
          <p className="text-2xl font-black text-gray-900">{counts.total}</p>
          <p className="text-xs text-gray-500 font-bold">סה״כ ארגונים</p>
        </div>
        <div className={`rounded-2xl shadow-sm border p-4 text-center ${VERTICAL_THEMES.municipal.accentBg} border-blue-200`}>
          <p className={`text-2xl font-black ${VERTICAL_THEMES.municipal.accentText}`}>{counts.municipal}</p>
          <p className="text-xs font-bold text-blue-600/70 flex items-center justify-center gap-1"><Building2 size={12} /> ערים</p>
        </div>
        <div className={`rounded-2xl shadow-sm border p-4 text-center ${VERTICAL_THEMES.military.accentBg} border-lime-200`}>
          <p className={`text-2xl font-black ${VERTICAL_THEMES.military.accentText}`}>{counts.military}</p>
          <p className="text-xs font-bold text-lime-600/70 flex items-center justify-center gap-1"><ShieldCheck size={12} /> צבאי</p>
        </div>
        <div className={`rounded-2xl shadow-sm border p-4 text-center ${VERTICAL_THEMES.educational.accentBg} border-orange-200`}>
          <p className={`text-2xl font-black ${VERTICAL_THEMES.educational.accentText}`}>{counts.educational}</p>
          <p className="text-xs font-bold text-orange-600/70 flex items-center justify-center gap-1"><GraduationCap size={12} /> חינוכי</p>
        </div>
      </div>

      {/* Feedback */}
      {success && (
        <div className="p-4 rounded-xl bg-green-50 border border-green-200 flex items-center gap-3">
          <CheckCircle size={18} className="text-green-500 flex-shrink-0" />
          <span className="text-sm text-green-800 flex-1">{success}</span>
          {copiedLink && (
            <button onClick={() => { navigator.clipboard.writeText(copiedLink); }} className="text-green-700 hover:text-green-900">
              <Copy size={14} />
            </button>
          )}
          <button onClick={() => { setSuccess(''); setCopiedLink(null); }}><X size={14} className="text-green-400" /></button>
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
              {importResult.created > 0 && `${importResult.created} ארגונים נוצרו בהצלחה.`}
              {importResult.errors.length > 0 && ` ${importResult.errors.length} שגיאות: ${importResult.errors[0]}`}
            </span>
          </div>
          <button onClick={() => setImportResult(null)} className="text-slate-400 hover:text-slate-600 flex-shrink-0">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Organization Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={() => { if (!importingOrgs) setShowImportModal(false); }}>
          <div
            dir="rtl"
            className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center">
                  <Upload size={20} className="text-violet-600" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-gray-900">ייבוא ארגונים מ-JSON</h2>
                  <p className="text-xs text-slate-500">יצירת ארגונים חדשים (חטיבות, בתי ספר, ערים) בפעולה אחת</p>
                </div>
              </div>
              <button
                onClick={() => { if (!importingOrgs) setShowImportModal(false); }}
                disabled={importingOrgs}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-500 font-mono leading-relaxed" dir="ltr">
                <span className="text-slate-400">{'{'}</span>{'\n'}
                {'  '}<span className="text-violet-600">"organizations"</span>: [{'\n'}
                {'    '}{'{'} <span className="text-violet-600">"name"</span>: <span className="text-green-600">"חטיבה 35"</span>, <span className="text-violet-600">"type"</span>: <span className="text-green-600">"military"</span> {'}'},{'\n'}
                {'    '}{'{'} <span className="text-violet-600">"name"</span>: <span className="text-green-600">"בית ספר הרצוג"</span>, <span className="text-violet-600">"type"</span>: <span className="text-green-600">"educational"</span> {'}'}{'\n'}
                {'  '}]{'\n'}
                <span className="text-slate-400">{'}'}</span>
              </div>
              <p className="text-xs text-slate-500">
                סוגים אפשריים:{' '}
                <code className="bg-slate-100 px-1.5 py-0.5 rounded text-lime-700 font-bold">military</code>{' · '}
                <code className="bg-slate-100 px-1.5 py-0.5 rounded text-orange-700 font-bold">educational</code>{' · '}
                <code className="bg-slate-100 px-1.5 py-0.5 rounded text-blue-700 font-bold">municipal</code>
              </p>

              <textarea
                value={importJson}
                onChange={e => { setImportJson(e.target.value); setImportParseError(''); }}
                placeholder='{"organizations": [{"name": "...", "type": "military"}]}'
                dir="ltr"
                className={`w-full h-56 px-4 py-3 rounded-xl border-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 transition-colors ${
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

            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100 bg-slate-50/50">
              <button
                onClick={() => setShowImportModal(false)}
                disabled={importingOrgs}
                className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold transition-all disabled:opacity-50"
              >
                ביטול
              </button>
              <button
                onClick={async () => {
                  const trimmed = importJson.trim();
                  if (!trimmed) { setImportParseError('הטקסט ריק — הדבק JSON תקין.'); return; }

                  let parsed: any;
                  try { parsed = JSON.parse(trimmed); }
                  catch (err: any) { setImportParseError(`JSON לא תקין: ${err?.message || 'שגיאת פענוח'}`); return; }

                  if (!parsed?.organizations || !Array.isArray(parsed.organizations) || parsed.organizations.length === 0) {
                    setImportParseError('ה-JSON חייב להכיל מערך "organizations" עם לפחות ארגון אחד.');
                    return;
                  }

                  setImportParseError('');
                  setImportingOrgs(true);
                  const result = { created: 0, errors: [] as string[] };

                  try {
                    for (const org of parsed.organizations) {
                      const name = org.name?.trim();
                      if (!name) { result.errors.push('ארגון ללא שם — דילוג'); continue; }

                      const tenantType: TenantType = (['military', 'educational', 'municipal'].includes(org.type)) ? org.type : 'municipal';
                      const slug = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                      const suffix = Math.random().toString(36).substring(2, 6);
                      const orgId = slug ? `${slug}_${suffix}` : `org_${suffix}`;
                      const authorityType = tenantType === 'military' ? 'military_unit' : tenantType === 'educational' ? 'school' : 'city';

                      try {
                        await setDoc(doc(db, 'authorities', orgId), {
                          name,
                          type: authorityType,
                          managerIds: [],
                          userCount: 0,
                          status: 'active',
                          isActiveClient: false,
                          pipelineStatus: 'lead',
                          createdAt: serverTimestamp(),
                          updatedAt: serverTimestamp(),
                        });
                        await setDoc(doc(db, 'tenants', orgId), {
                          name,
                          type: tenantType,
                          authorityId: orgId,
                          createdAt: serverTimestamp(),
                        });

                        setOrgs(prev => [...prev, {
                          id: orgId,
                          name,
                          type: authorityType,
                          managerIds: [],
                          userCount: 0,
                          status: 'active',
                          tenantType,
                          unitCount: 0,
                        }]);

                        result.created++;
                      } catch (err: any) {
                        result.errors.push(`${name}: ${err?.message || 'שגיאה'}`);
                      }
                    }

                    setImportResult(result);
                    setShowImportModal(false);
                    setImportJson('');
                  } catch (err: any) {
                    setImportParseError(err?.message || 'שגיאה בלתי צפויה.');
                  } finally {
                    setImportingOrgs(false);
                  }
                }}
                disabled={importingOrgs || !importJson.trim()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold transition-all disabled:opacity-50 shadow-lg shadow-violet-200/50"
              >
                {importingOrgs ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                {importingOrgs ? 'מייבא...' : 'אמת וייבא'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Form */}
      {showCreate && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
            <Plus size={20} className="text-cyan-600" />
            יצירת ארגון חדש
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="שם הארגון"
              className="px-4 py-3 rounded-xl border-2 border-gray-200 text-sm focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200 outline-none"
            />
            <SearchableSelect
              options={ORG_TYPE_OPTIONS.map(o => ({ id: o.value, label: o.label }))}
              value={newType}
              onChange={v => { if (v) setNewType(v as TenantType); }}
              placeholder="סוג ארגון..."
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || creating}
                className="flex-1 flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-bold px-4 py-3 rounded-xl transition-all disabled:opacity-50"
              >
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                צור ארגון
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-bold transition-all"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap bg-white rounded-2xl shadow-sm border border-gray-100 p-4 overflow-visible relative z-10">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="חפש ארגון..."
            className="w-full pr-10 pl-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
          />
        </div>
        <div className="min-w-[150px]">
          <SearchableSelect
            options={[
              { id: 'all', label: 'כל הסוגים' },
              ...ORG_TYPE_OPTIONS.map(o => ({ id: o.value, label: o.label })),
            ]}
            value={filterType}
            onChange={v => setFilterType(v || 'all')}
            placeholder="כל הסוגים"
          />
        </div>
      </div>

      {/* Org Cards */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Globe className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="text-sm font-bold">{searchTerm ? 'לא נמצאו תוצאות' : 'אין ארגונים במערכת'}</p>
          </div>
        ) : filtered.map(org => {
          const Icon = ORG_ICON[org.tenantType];
          const badge = ORG_BADGE_COLOR[org.tenantType];
          const orgName = typeof org.name === 'string' ? org.name : (org.name as any)?.he || org.id;

          return (
            <div key={org.id} className={`bg-white rounded-2xl shadow-sm border-l-4 border border-gray-100 p-5 hover:bg-slate-50/50 transition-colors ${VERTICAL_THEMES[org.tenantType].headerBorder}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${VERTICAL_THEMES[org.tenantType].accentBg}`}>
                    <Icon size={22} className={VERTICAL_THEMES[org.tenantType].accentText} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-black text-gray-900">{orgName}</h3>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${badge}`}>
                        {orgTypeDisplayName(org.tenantType)}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                      <span>{org.userCount ?? 0} משתמשים</span>
                      <span>{org.unitCount} יחידות</span>
                      {org.ownerName && (
                        <span className="flex items-center gap-1">
                          <Users size={10} />
                          {org.ownerName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      orgCtx.setSelectedOrgId(org.id);
                      router.push(`/admin/authority/units?type=${org.tenantType}&org=${org.id}`);
                    }}
                    className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition-all ${VERTICAL_THEMES[org.tenantType].accentBg} ${VERTICAL_THEMES[org.tenantType].accentText} hover:opacity-80`}
                  >
                    <GitBranch size={13} />
                    ניהול היררכיה
                  </button>
                  <button
                    onClick={() => { setInviteOrgId(org.id); }}
                    className="flex items-center gap-1.5 text-xs font-bold text-cyan-600 hover:text-cyan-800 bg-cyan-50 hover:bg-cyan-100 px-3 py-2 rounded-xl transition-all"
                  >
                    <UserPlus size={13} />
                    הזמן בעל ארגון
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <ChevronRight size={14} />
            הקודם
          </button>
          <span className="text-sm text-slate-500 font-bold">
            עמוד {page} מתוך {totalPages} ({allFiltered.length} תוצאות)
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            הבא
            <ChevronLeft size={14} />
          </button>
        </div>
      )}
      {/* Unified Invite Modal */}
      {inviteOrgId && (() => {
        const targetOrg = orgs.find(o => o.id === inviteOrgId);
        const orgName = targetOrg ? (typeof targetOrg.name === 'string' ? targetOrg.name : (targetOrg.name as any)?.he || targetOrg.id) : '';
        return (
          <InviteMemberModal
            isOpen={!!inviteOrgId}
            onClose={() => setInviteOrgId(null)}
            context={{
              tenantType: targetOrg?.tenantType,
              authorityId: inviteOrgId,
              tenantId: inviteOrgId,
              organizationName: orgName,
            }}
            callerInfo={{
              adminId: adminUid,
              adminName: 'Admin',
              adminEmail: '',
            }}
            onSuccess={(result) => {
              setCopiedLink(result.inviteLink);
              setSuccess(`הזמנה לבעל ארגון נוצרה בהצלחה`);
              setInviteOrgId(null);
              setTimeout(() => { setSuccess(''); setCopiedLink(null); }, 6000);
            }}
          />
        );
      })()}
    </div>
  );
}
