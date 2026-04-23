'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, setDoc, collection, query, where, getDocs, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { getAuthoritiesByManager, getAuthority } from '@/features/admin/services/authority.service';
import { authorityTypeToTenantType, getTenantLabels, VERTICAL_THEMES } from '@/features/admin/config/tenantLabels';
import { syncTenantUnitCount } from '@/features/admin/services/unit-count-sync.service';
import { createAccessCode, createBatchAccessCodes, getAccessCodesByTenant, type AccessCode as AccessCodeType } from '@/features/admin/services/access-code-admin.service';
import {
  Loader2, ArrowRight, Users, Dumbbell,
  Building2, ChevronLeft, Search,
  ChevronDown, MapPin, Clock, User,
  KeyRound, Copy, Check, Plus, X, Download, Package,
  Shield, GraduationCap,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────

interface UnitMember {
  uid: string;
  name: string;
  unitPath: string[];
  lastWorkoutDate: string | null;
  workoutCount: number;
  globalXP: number;
}

interface SubUnit {
  id: string;
  name: string;
  memberCount: number;
  unitPath: string[];
}

// ── Page ─────────────────────────────────────────────────────────────

export default function UnitDrilldownPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const rawUnitId = params?.unitId as string;
  const unitId = rawUnitId;
  const urlTenantType = searchParams?.get('type') as 'municipal' | 'educational' | 'military' | null;
  const urlOrgId = searchParams?.get('org') as string | null;

  const [loading, setLoading] = useState(true);
  const [unitName, setUnitName] = useState<string>('');
  const [unitPath, setUnitPath] = useState<string[]>([]);
  const [subUnits, setSubUnits] = useState<SubUnit[]>([]);
  const [members, setMembers] = useState<UnitMember[]>([]);
  const [tenantType, setTenantType] = useState<string>('municipal');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAllMembers, setShowAllMembers] = useState(false);
  const [selectedMember, setSelectedMember] = useState<UnitMember | null>(null);
  const [memberWorkouts, setMemberWorkouts] = useState<any[]>([]);
  const [loadingWorkouts, setLoadingWorkouts] = useState(false);
  const [tenantId, setTenantId] = useState<string>('');
  const [showCodePanel, setShowCodePanel] = useState(false);
  const [codeMaxUses, setCodeMaxUses] = useState(50);
  const [codeExpiryDays, setCodeExpiryDays] = useState(30);
  const [codeLabel, setCodeLabel] = useState('');
  const [generatingCode, setGeneratingCode] = useState(false);
  const [generatedCodes, setGeneratedCodes] = useState<AccessCodeType[]>([]);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [adminUid, setAdminUid] = useState<string>('');
  const [batchCount, setBatchCount] = useState(10);
  const [generatingBatch, setGeneratingBatch] = useState(false);
  const [showAddSubUnit, setShowAddSubUnit] = useState(false);
  const [newSubUnitName, setNewSubUnitName] = useState('');
  const [creatingSubUnit, setCreatingSubUnit] = useState(false);

  useEffect(() => {
    if (!unitId) return;

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      setAdminUid(user.uid);

      try {
        const auths = await getAuthoritiesByManager(user.uid);
        const authority = auths[0];
        if (urlOrgId) setTenantId(urlOrgId);
        else if (authority) setTenantId(authority.id);

        const activeTenantId = urlOrgId || authority?.id;

        if (activeTenantId) {
          try {
            const orgDoc = await getAuthority(activeTenantId);
            if (orgDoc) {
              setTenantType(authorityTypeToTenantType(orgDoc.type));
            } else if (authority) {
              setTenantType(authorityTypeToTenantType(authority.type));
            }
          } catch {
            if (authority) setTenantType(authorityTypeToTenantType(authority.type));
          }
        } else if (authority) {
          setTenantType(authorityTypeToTenantType(authority.type));
        }

        let resolvedUnitName = decodeURIComponent(rawUnitId);
        let resolvedUnitPath: string[] = [];

        if (activeTenantId) {
          const unitDocRef = doc(db, 'tenants', activeTenantId, 'units', unitId);
          const unitSnap = await getDoc(unitDocRef);
          if (unitSnap.exists()) {
            const unitData = unitSnap.data();
            resolvedUnitName = unitData.name ?? decodeURIComponent(rawUnitId);
            resolvedUnitPath = unitData.unitPath ?? [];
          }
        }

        setUnitName(resolvedUnitName);
        setUnitPath(resolvedUnitPath);

        if (activeTenantId) {
          const subSnap = await getDocs(query(
            collection(db, 'tenants', activeTenantId, 'units'),
            where('parentUnitId', '==', unitId),
          ));
          setSubUnits(subSnap.docs.map(d => {
            const data = d.data();
            return {
              id: d.id,
              name: data.name ?? d.id,
              memberCount: data.memberCount ?? 0,
              unitPath: data.unitPath ?? [],
            };
          }));
        }

        // Load members in this unit
        const usersSnap = await getDocs(query(
          collection(db, 'users'),
          where('core.unitId', '==', unitId),
        ));

        const membersList: UnitMember[] = [];
        for (const userDoc of usersSnap.docs) {
          const userData = userDoc.data();
          const core = (userData.core ?? {}) as Record<string, any>;
          const progression = (userData.progression ?? {}) as Record<string, any>;

          const wSnap = await getDocs(query(
            collection(db, 'workouts'),
            where('userId', '==', userDoc.id),
            orderBy('completedAt', 'desc'),
            limit(5),
          ));

          let lastDate: string | null = null;
          if (wSnap.docs.length > 0) {
            const first = wSnap.docs[0].data();
            const ts = first.completedAt?.toDate?.() ?? (first.completedAt ? new Date(first.completedAt) : null);
            if (ts) lastDate = ts.toISOString().split('T')[0];
          }

          membersList.push({
            uid: userDoc.id,
            name: core.name ?? 'ללא שם',
            unitPath: core.unitPath ?? [],
            lastWorkoutDate: lastDate,
            workoutCount: wSnap.size,
            globalXP: typeof progression.globalXP === 'number' ? progression.globalXP : 0,
          });
        }

        setMembers(membersList);

        if (activeTenantId) {
          try {
            const allCodes = await getAccessCodesByTenant(activeTenantId);
            const unitCodes = allCodes.filter(c => c.unitId === unitId);
            setGeneratedCodes(unitCodes);
          } catch { /* ignore */ }
        }
      } catch (err) {
        console.error('[UnitDrilldown] load error:', err);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [unitId]);

  const labels = getTenantLabels(tenantType as any);
  const isSchoolContext = tenantType === 'educational';

  const resolvedTenantType = (tenantType === 'military' || tenantType === 'educational' ? tenantType : 'municipal') as 'municipal' | 'educational' | 'military';

  const handleGenerateCode = async () => {
    if (!tenantId || !unitId) return;
    setGeneratingCode(true);
    try {
      console.log('[UnitDrilldown] Generating code with tenantType:', resolvedTenantType, '(raw:', tenantType, ')');
      const newCode = await createAccessCode({
        tenantId,
        unitId,
        unitPath,
        tenantType: resolvedTenantType,
        maxUses: codeMaxUses,
        expiresInDays: codeExpiryDays,
        label: codeLabel || `${unitName} — קוד גישה`,
        adminUid,
      });
      setGeneratedCodes(prev => [newCode, ...prev]);
      setCodeLabel('');
    } catch (err) {
      console.error('Error generating code:', err);
    } finally {
      setGeneratingCode(false);
    }
  };

  const handleGenerateBatch = async () => {
    if (!tenantId || !unitId || batchCount < 1) return;
    setGeneratingBatch(true);
    try {
      console.log('[UnitDrilldown] Generating batch with tenantType:', resolvedTenantType, '(raw:', tenantType, ')');
      const newCodes = await createBatchAccessCodes({
        tenantId,
        unitId,
        unitPath,
        tenantType: resolvedTenantType,
        maxUses: 1,
        expiresInDays: codeExpiryDays,
        label: codeLabel || `${unitName} — חבילה`,
        adminUid,
      }, batchCount);
      setGeneratedCodes(prev => [...newCodes, ...prev]);
      setCodeLabel('');
    } catch (err) {
      console.error('Error generating batch:', err);
    } finally {
      setGeneratingBatch(false);
    }
  };

  const handleExportCodes = () => {
    const lines = ['קוד,סטטוס,משתמש,שימושים,תיאור'];
    generatedCodes.forEach(c => {
      const status = c.usageCount > 0 ? 'נוצל' : 'זמין';
      const user = c.lastUsedByDisplayName || (c.usageCount > 0 ? 'לא ידוע' : '—');
      lines.push(`${c.code},${status},${user},${c.usageCount}/${c.maxUses},${c.label ?? ''}`);
    });
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `access-codes-${unitId}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  const filteredMembers = useMemo(() => {
    let list = members;
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter(m => m.name.toLowerCase().includes(q));
    }
    if (!showAllMembers && list.length > 20) return list.slice(0, 20);
    return list;
  }, [members, searchTerm, showAllMembers]);

  const loadMemberWorkouts = async (member: UnitMember) => {
    setSelectedMember(member);
    setLoadingWorkouts(true);
    try {
      const wSnap = await getDocs(query(
        collection(db, 'workouts'),
        where('userId', '==', member.uid),
        orderBy('completedAt', 'desc'),
        limit(20),
      ));
      setMemberWorkouts(wSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch {
      setMemberWorkouts([]);
    } finally {
      setLoadingWorkouts(false);
    }
  };

  const theme = VERTICAL_THEMES[(tenantType as 'municipal' | 'military' | 'educational')] ?? VERTICAL_THEMES.municipal;

  const currentDepth = unitPath.length;
  const nextHierarchyLabel = labels.hierarchyLabels[currentDepth + 1] ?? labels.subUnitSingular;

  const handleCreateSubUnit = async () => {
    if (!newSubUnitName.trim() || !tenantId) return;
    setCreatingSubUnit(true);
    try {
      const trimmedName = newSubUnitName.trim();
      const slug = trimmedName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      const suffix = Math.random().toString(36).substring(2, 6);
      const subId = slug ? `${slug}_${suffix}` : `unit_${suffix}`;

      const parentPath = unitPath.length > 0 ? unitPath : [unitName];
      const childPath = [...parentPath, trimmedName];

      console.log('[UnitDrilldown] Creating sub-unit:', { subId, name: trimmedName, parentUnitId: unitId, childPath, tenantType: resolvedTenantType });

      await setDoc(doc(db, 'tenants', tenantId, 'units', subId), {
        name: trimmedName,
        parentUnitId: unitId,
        unitPath: childPath,
        memberCount: 0,
        createdAt: serverTimestamp(),
      });
      setSubUnits(prev => [...prev, { id: subId, name: trimmedName, memberCount: 0, unitPath: childPath }]);
      setNewSubUnitName('');
      setShowAddSubUnit(false);
      if (tenantId) syncTenantUnitCount(tenantId).catch(() => {});
    } catch (err) {
      console.error('[UnitDrilldown] Error creating sub-unit:', err);
    } finally {
      setCreatingSubUnit(false);
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
    <div dir="rtl" className="space-y-6 pb-12 max-w-5xl mx-auto">
      {/* ═══ Breadcrumbs (uses hierarchyLabels for educational/military context) ═══ */}
      <nav className="flex items-center gap-1.5 text-sm text-slate-500 flex-wrap">
        <Link href={`/admin/authority/units${urlTenantType ? `?type=${urlTenantType}` : ''}`} className="hover:text-cyan-600 font-bold">
          {labels.subUnitsTitle}
        </Link>
        {unitPath.map((segment, i) => {
          const hierarchyLabel = labels.hierarchyLabels[i + 1] ?? '';
          const isLast = i === unitPath.length - 1;
          return (
            <span key={i} className="flex items-center gap-1.5">
              <ChevronLeft size={12} />
              <span className={isLast ? 'text-slate-800 font-black' : 'font-bold'}>
                {hierarchyLabel ? `${hierarchyLabel}: ` : ''}{segment}
              </span>
            </span>
          );
        })}
        {unitPath.length === 0 && (
          <>
            <ChevronLeft size={12} />
            <span className="text-slate-800 font-black">{unitName}</span>
          </>
        )}
      </nav>

      {/* ═══ Header ═══ */}
      <div className={`flex items-center justify-between bg-white rounded-2xl shadow-sm border-l-4 border border-gray-100 p-6 ${theme.headerBorder}`}>
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${theme.accentBg}`}>
            {tenantType === 'military'
              ? <Shield size={28} className={theme.accentText} />
              : tenantType === 'educational'
              ? <GraduationCap size={28} className={theme.accentText} />
              : <Building2 size={28} className={theme.accentText} />
            }
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-gray-900">{unitName}</h1>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${theme.badgeBg} ${theme.badgeText}`}>
                {labels.orgTypeLabel}
              </span>
            </div>
            <p className="text-sm text-gray-500">
              {members.length} {labels.membersTitle} · {subUnits.length} {labels.subUnitsTitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddSubUnit(true)}
            className={`flex items-center gap-2 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-all ${
              tenantType === 'military' ? 'bg-lime-700 hover:bg-lime-800'
              : tenantType === 'educational' ? 'bg-orange-600 hover:bg-orange-700'
              : 'bg-blue-700 hover:bg-blue-800'
            }`}
          >
            <Plus size={14} />
            הוסף {nextHierarchyLabel}
          </button>
          <button
            onClick={() => setShowCodePanel(prev => !prev)}
            className="flex items-center gap-2 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 text-sm font-bold px-4 py-2.5 rounded-xl transition-all"
          >
            <KeyRound size={14} />
            קודי גישה
          </button>
          <Link
            href={`/admin/authority/units${urlTenantType ? `?type=${urlTenantType}` : ''}`}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold px-4 py-2.5 rounded-xl transition-all"
          >
            <ArrowRight size={14} />
            חזור
          </Link>
        </div>
      </div>

      {/* ═══ Add Sub-Unit Form ═══ */}
      {showAddSubUnit && (
        <div className={`bg-white rounded-2xl shadow-sm border-l-4 border border-gray-100 p-5 ${theme.headerBorder}`}>
          <h3 className="text-sm font-black text-gray-900 mb-3 flex items-center gap-2">
            <Plus size={16} className={theme.accentText} />
            הוסף {nextHierarchyLabel} תחת {unitName}
          </h3>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={newSubUnitName}
              onChange={e => setNewSubUnitName(e.target.value)}
              placeholder={`שם ה${nextHierarchyLabel}`}
              className="flex-1 px-4 py-2.5 rounded-xl border-2 border-gray-200 text-sm focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200 outline-none"
            />
            <button
              onClick={handleCreateSubUnit}
              disabled={!newSubUnitName.trim() || creatingSubUnit}
              className={`flex items-center gap-2 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-all disabled:opacity-50 ${
                tenantType === 'military' ? 'bg-lime-700 hover:bg-lime-800'
                : tenantType === 'educational' ? 'bg-orange-600 hover:bg-orange-700'
                : 'bg-blue-700 hover:bg-blue-800'
              }`}
            >
              {creatingSubUnit ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              צור
            </button>
            <button onClick={() => { setShowAddSubUnit(false); setNewSubUnitName(''); }} className="text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* ═══ Access Code Generator ═══ */}
      {showCodePanel && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-cyan-50 rounded-xl flex items-center justify-center">
                <KeyRound size={18} className="text-cyan-600" />
              </div>
              <div>
                <h2 className="text-base font-black text-gray-900">קודי גישה — {unitName}</h2>
                <p className="text-xs text-slate-500">קודים עבור {labels.membersTitle} להצטרפות ישירה ליחידה זו</p>
              </div>
            </div>
            {generatedCodes.length > 0 && (
              <button
                onClick={handleExportCodes}
                className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold px-4 py-2 rounded-xl transition-all"
              >
                <Download size={14} />
                ייצוא רשימה
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 rounded-xl p-4">
            <input
              type="text"
              value={codeLabel}
              onChange={e => setCodeLabel(e.target.value)}
              placeholder="תיאור (אופציונלי)"
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-cyan-300 focus:border-transparent"
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500 whitespace-nowrap">מקסימום שימושים:</label>
              <input
                type="number"
                min={1}
                value={codeMaxUses}
                onChange={e => setCodeMaxUses(Number(e.target.value))}
                className="w-20 px-2 py-2 rounded-lg border border-slate-200 text-sm text-center focus:ring-2 focus:ring-cyan-300"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500 whitespace-nowrap">תוקף (ימים):</label>
              <input
                type="number"
                min={1}
                value={codeExpiryDays}
                onChange={e => setCodeExpiryDays(Number(e.target.value))}
                className="w-20 px-2 py-2 rounded-lg border border-slate-200 text-sm text-center focus:ring-2 focus:ring-cyan-300"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerateCode}
              disabled={generatingCode}
              className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-all disabled:opacity-50"
            >
              {generatingCode ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              הפק קוד בודד
            </button>

            <div className="flex items-center gap-2 bg-violet-50 rounded-xl px-3 py-1.5 border border-violet-200">
              <input
                type="number"
                min={2}
                max={100}
                value={batchCount}
                onChange={e => setBatchCount(Math.max(2, Math.min(100, Number(e.target.value))))}
                className="w-14 px-1 py-1 rounded-lg border border-violet-200 text-sm text-center bg-white focus:ring-2 focus:ring-violet-300"
              />
              <button
                onClick={handleGenerateBatch}
                disabled={generatingBatch}
                className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold px-4 py-2 rounded-xl transition-all disabled:opacity-50"
              >
                {generatingBatch ? <Loader2 size={14} className="animate-spin" /> : <Package size={14} />}
                הפק חבילת קודים (חד-פעמיים)
              </button>
            </div>
          </div>

          {generatedCodes.length > 0 && (
            <div className="bg-slate-50 rounded-xl overflow-hidden">
              <table className="w-full text-sm" dir="rtl">
                <thead>
                  <tr className="text-[11px] text-slate-400 font-bold border-b border-slate-200">
                    <th className="text-right py-2 px-3">קוד</th>
                    <th className="text-right py-2 px-3">שימושים</th>
                    <th className="text-right py-2 px-3">סטטוס / משתמש</th>
                    <th className="text-right py-2 px-3">תיאור</th>
                    <th className="text-right py-2 px-3 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {generatedCodes.map(c => {
                    const isUsed = c.usageCount > 0;
                    return (
                      <tr key={c.id} className="border-b border-slate-100 last:border-b-0">
                        <td className="py-2.5 px-3">
                          <code dir="ltr" className="text-sm font-black text-slate-800 tracking-wider">{c.code}</code>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="text-xs font-bold">{c.usageCount}/{c.maxUses}</span>
                        </td>
                        <td className="py-2.5 px-3">
                          {isUsed ? (
                            <span className="text-xs font-bold text-violet-600 flex items-center gap-1">
                              <User size={11} />
                              {c.lastUsedByDisplayName || 'משתמש'}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                              זמין
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-xs text-slate-500">{c.label ?? '—'}</td>
                        <td className="py-2.5 px-3">
                          <button
                            onClick={() => copyCode(c.code, c.id)}
                            className="flex items-center gap-1 text-xs font-bold text-cyan-600 hover:text-cyan-800 transition-colors"
                          >
                            {copiedCodeId === c.id ? <Check size={12} /> : <Copy size={12} />}
                            {copiedCodeId === c.id ? 'הועתק' : 'העתק'}
                          </button>
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

      {/* ═══ Sub-Units ═══ */}
      {subUnits.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-black text-gray-900 px-1">{labels.subUnitsTitle}</h2>
          {subUnits.map(sub => (
            <Link
              key={sub.id}
              href={`/admin/authority/units/${sub.id}?type=${tenantType}&org=${tenantId}`}
              className="flex items-center justify-between bg-white rounded-2xl shadow-sm border border-gray-100 p-4 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                  tenantType === 'military' ? 'bg-lime-50' : tenantType === 'educational' ? 'bg-orange-50' : 'bg-slate-100'
                }`}>
                  {tenantType === 'military'
                    ? <Shield size={16} className="text-lime-700" />
                    : tenantType === 'educational'
                    ? <GraduationCap size={16} className="text-orange-600" />
                    : <Building2 size={16} className="text-slate-600" />
                  }
                </div>
                <p className="font-bold text-slate-800">{sub.name}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-cyan-600">{sub.memberCount}</span>
                <ChevronLeft size={16} className="text-slate-300" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* ═══ Members Table ═══ */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-cyan-50 rounded-xl flex items-center justify-center">
              <Users size={18} className="text-cyan-600" />
            </div>
            <h2 className="text-base font-black text-gray-900">
              {labels.membersTitle} ({members.length})
            </h2>
          </div>
        </div>

        <div className="relative mb-3">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder={`חפש ${labels.memberSingular}...`}
            className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:border-transparent"
          />
        </div>

        {filteredMembers.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <Users className="w-8 h-8 mx-auto mb-2 text-slate-200" />
            <p className="text-sm font-bold">{searchTerm ? 'לא נמצאו תוצאות' : `אין ${labels.membersTitle}`}</p>
          </div>
        ) : (
          <>
            <div className="bg-slate-50 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-slate-400 font-bold border-b border-slate-200">
                    <th className="text-right py-2 px-3 w-8">#</th>
                    <th className="text-right py-2 px-3">שם</th>
                    {isSchoolContext && <th className="text-right py-2 px-3">XP</th>}
                    <th className="text-right py-2 px-3">אימונים</th>
                    <th className="text-right py-2 px-3">פעילות אחרונה</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.map((m, i) => (
                    <tr
                      key={m.uid}
                      onClick={() => loadMemberWorkouts(m)}
                      className="border-b border-slate-100 last:border-b-0 hover:bg-cyan-50/50 transition-colors cursor-pointer"
                    >
                      <td className="py-2.5 px-3 text-[11px] text-slate-400">{i + 1}</td>
                      <td className="py-2.5 px-3">
                        <span className="font-bold text-slate-800 flex items-center gap-1.5">
                          <User size={12} className="text-slate-400" />
                          {m.name}
                        </span>
                      </td>
                      {isSchoolContext && (
                        <td className="py-2.5 px-3">
                          <span className="text-xs font-black text-amber-600">{m.globalXP.toLocaleString()}</span>
                        </td>
                      )}
                      <td className="py-2.5 px-3">
                        <span className="text-xs font-bold text-cyan-600">{m.workoutCount}</span>
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-slate-500">
                        {m.lastWorkoutDate ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {members.length > 20 && !showAllMembers && !searchTerm && (
              <button
                onClick={() => setShowAllMembers(true)}
                className="mt-3 text-xs font-bold text-cyan-600 hover:text-cyan-800 flex items-center gap-1"
              >
                <ChevronDown size={12} />
                הצג את כל {members.length} ה{labels.membersTitle}
              </button>
            )}
          </>
        )}
      </div>

      {/* ═══ Soldier Detail Sheet ═══ */}
      {selectedMember && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-cyan-50 rounded-2xl flex items-center justify-center">
                <User size={22} className="text-cyan-600" />
              </div>
              <div>
                <h2 className="text-lg font-black text-gray-900">{selectedMember.name}</h2>
                <p className="text-xs text-slate-500">
                  {selectedMember.workoutCount} אימונים · פעילות אחרונה: {selectedMember.lastWorkoutDate ?? '—'}
                  {isSchoolContext && ` · ${selectedMember.globalXP.toLocaleString()} XP`}
                </p>
              </div>
            </div>
            <button
              onClick={() => setSelectedMember(null)}
              className="text-xs font-bold text-slate-400 hover:text-slate-600"
            >
              סגור
            </button>
          </div>

          {loadingWorkouts ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : memberWorkouts.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">אין היסטוריית אימונים</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-thin">
              {memberWorkouts.map((w: any) => {
                const completedAt = w.completedAt?.toDate?.() ?? (w.completedAt ? new Date(w.completedAt) : null);
                const dateStr = completedAt
                  ? completedAt.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })
                  : '—';

                return (
                  <div key={w.id} className="bg-slate-50 rounded-xl p-4 flex items-center gap-4">
                    <div className="w-9 h-9 bg-violet-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Dumbbell size={16} className="text-violet-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">
                        {w.workoutTitle ?? w.type ?? 'אימון'}
                      </p>
                      <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-500">
                        <span className="flex items-center gap-0.5">
                          <Clock size={10} />
                          {dateStr}
                        </span>
                        {w.durationMinutes && (
                          <span>{Math.round(w.durationMinutes)} דק׳</span>
                        )}
                        {w.routePath && w.routePath.length > 0 && (
                          <span className="flex items-center gap-0.5 text-green-600">
                            <MapPin size={10} />
                            GPS
                          </span>
                        )}
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
