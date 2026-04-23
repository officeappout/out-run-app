'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { checkUserRole } from '@/features/admin/services/auth.service';
import {
  getAllAccessCodes, createAccessCode, toggleAccessCode, deleteAccessCode,
  type AccessCode, type CreateAccessCodeInput,
} from '@/features/admin/services/access-code-admin.service';
import {
  Loader2, Plus, Copy, Trash2, Check, X, KeyRound,
  ChevronDown, Shield, GraduationCap, Building2,
  ToggleLeft, ToggleRight, Search, User,
} from 'lucide-react';
import SearchableSelect from '@/features/admin/components/SearchableSelect';

interface TenantOption {
  id: string;
  name: string;
  type: string;
}

interface UnitOption {
  id: string;
  name: string;
  unitPath: string[];
}

export default function AccessCodesPage() {
  const [loading, setLoading] = useState(true);
  const [codes, setCodes] = useState<AccessCode[]>([]);
  const [adminUid, setAdminUid] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'military' | 'municipal' | 'educational'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'used' | 'inactive'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Create form state
  const [showForm, setShowForm] = useState(false);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [maxUses, setMaxUses] = useState(50);
  const [expiresInDays, setExpiresInDays] = useState(90);
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      setAdminUid(user.uid);

      try {
        const role = await checkUserRole(user.uid);
        if (!role.isSuperAdmin && !role.isAuthorityManager) {
          setLoading(false);
          return;
        }

        const [codesData, tenantsSnap] = await Promise.all([
          getAllAccessCodes(),
          getDocs(collection(db, 'tenants')),
        ]);

        setCodes(codesData);
        setTenants(tenantsSnap.docs.map(d => ({
          id: d.id,
          name: d.data().name ?? d.id,
          type: d.data().tenantType ?? 'municipal',
        })));
      } catch (err) {
        console.error('[AccessCodes] init error:', err);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // Load units when tenant changes
  useEffect(() => {
    if (!selectedTenantId) { setUnits([]); return; }
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'tenants', selectedTenantId, 'units'));
        setUnits(snap.docs.map(d => ({
          id: d.id,
          name: d.data().name ?? d.id,
          unitPath: d.data().unitPath ?? [],
        })));
      } catch (err) {
        console.error('[AccessCodes] error loading units:', err);
      }
    })();
  }, [selectedTenantId]);

  const selectedTenant = tenants.find(t => t.id === selectedTenantId);
  const selectedUnit = units.find(u => u.id === selectedUnitId);

  const handleCreate = async () => {
    if (!selectedTenantId || !selectedUnitId || !selectedTenant) return;
    setCreating(true);
    try {
      const input: CreateAccessCodeInput = {
        tenantId: selectedTenantId,
        unitId: selectedUnitId,
        unitPath: selectedUnit?.unitPath ?? [],
        tenantType: selectedTenant.type as 'municipal' | 'educational' | 'military',
        maxUses,
        expiresInDays,
        label: label.trim() || undefined,
        adminUid,
      };
      const newCode = await createAccessCode(input);
      setCodes(prev => [newCode, ...prev]);
      setShowForm(false);
      setLabel('');
      setSelectedUnitId('');
    } catch (err) {
      console.error('[AccessCodes] create error:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (code: AccessCode) => {
    try {
      await toggleAccessCode(code.id, !code.isActive);
      setCodes(prev => prev.map(c => c.id === code.id ? { ...c, isActive: !c.isActive } : c));
    } catch (err) {
      console.error('[AccessCodes] toggle error:', err);
    }
  };

  const handleDelete = async (codeId: string) => {
    if (!confirm('למחוק את קוד הגישה?')) return;
    try {
      await deleteAccessCode(codeId);
      setCodes(prev => prev.filter(c => c.id !== codeId));
    } catch (err) {
      console.error('[AccessCodes] delete error:', err);
    }
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const filtered = useMemo(() => {
    let result = codes;
    if (filterType !== 'all') {
      result = result.filter(c => c.tenantType === filterType);
    }
    if (filterStatus !== 'all') {
      if (filterStatus === 'active') result = result.filter(c => c.isActive && c.usageCount === 0);
      else if (filterStatus === 'used') result = result.filter(c => c.usageCount > 0);
      else if (filterStatus === 'inactive') result = result.filter(c => !c.isActive);
    }
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      result = result.filter(c =>
        c.code.toLowerCase().includes(q) ||
        c.label?.toLowerCase().includes(q) ||
        c.unitPath.some(s => s.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [codes, searchTerm, filterType, filterStatus]);

  const allSelected = filtered.length > 0 && filtered.every(c => selectedIds.has(c.id));
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(c => c.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (!confirm(`למחוק ${selectedIds.size} קודי גישה?`)) return;
    setBulkDeleting(true);
    try {
      await Promise.all(Array.from(selectedIds).map(id => deleteAccessCode(id)));
      setCodes(prev => prev.filter(c => !selectedIds.has(c.id)));
      setSelectedIds(new Set());
    } catch (err) {
      console.error('[AccessCodes] bulk delete error:', err);
    } finally {
      setBulkDeleting(false);
    }
  };

  const tenantTypeIcon = (type: string) => {
    if (type === 'military') return <Shield size={14} className="text-red-500" />;
    if (type === 'educational') return <GraduationCap size={14} className="text-amber-500" />;
    return <Building2 size={14} className="text-cyan-500" />;
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-violet-50 rounded-2xl flex items-center justify-center">
            <KeyRound size={28} className="text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900">קודי גישה</h1>
            <p className="text-sm text-gray-500">
              {codes.length} קודים · ניהול קודי הצטרפות לארגונים ויחידות
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold transition-colors"
        >
          {showForm ? <X size={16} /> : <Plus size={16} />}
          {showForm ? 'ביטול' : 'צור קוד חדש'}
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="text-base font-black text-gray-900">צור קוד גישה חדש</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Organization selector */}
            <div>
              <label className="text-[11px] text-slate-400 font-bold block mb-1">ארגון</label>
              <SearchableSelect
                options={tenants.map(t => ({
                  id: t.id,
                  label: `${t.name} (${t.type === 'military' ? 'צבאי' : t.type === 'educational' ? 'חינוכי' : 'עירוני'})`,
                  icon: t.type === 'military' ? <Shield size={14} className="text-red-500" /> : t.type === 'educational' ? <GraduationCap size={14} className="text-amber-500" /> : <Building2 size={14} className="text-cyan-500" />,
                }))}
                value={selectedTenantId}
                onChange={v => { setSelectedTenantId(v); setSelectedUnitId(''); }}
                placeholder="בחר ארגון..."
              />
            </div>

            {/* Unit selector (hierarchy) */}
            <div>
              <label className="text-[11px] text-slate-400 font-bold block mb-1">יחידה (Unit)</label>
              <SearchableSelect
                options={units.map(u => ({
                  id: u.id,
                  label: u.unitPath.length > 0 ? u.unitPath.join(' › ') : u.name,
                }))}
                value={selectedUnitId}
                onChange={setSelectedUnitId}
                placeholder="בחר יחידה..."
                disabled={!selectedTenantId || units.length === 0}
              />
              {selectedUnit && selectedUnit.unitPath.length > 0 && (
                <p className="text-[11px] text-violet-500 mt-1 font-bold">
                  היררכיה: {selectedUnit.unitPath.join(' → ')}
                </p>
              )}
            </div>

            {/* Max uses */}
            <div>
              <label className="text-[11px] text-slate-400 font-bold block mb-1">מספר שימושים מקסימלי</label>
              <input
                dir="ltr"
                type="number"
                min={0}
                value={maxUses}
                onChange={e => setMaxUses(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
              <p className="text-[10px] text-slate-400 mt-0.5">0 = ללא הגבלה</p>
            </div>

            {/* Expiry */}
            <div>
              <label className="text-[11px] text-slate-400 font-bold block mb-1">תוקף (ימים)</label>
              <input
                dir="ltr"
                type="number"
                min={0}
                value={expiresInDays}
                onChange={e => setExpiresInDays(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
              <p className="text-[10px] text-slate-400 mt-0.5">0 = ללא תפוגה</p>
            </div>

            {/* Label */}
            <div className="md:col-span-2">
              <label className="text-[11px] text-slate-400 font-bold block mb-1">תווית (אופציונלי)</label>
              <input
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder='למשל: "קוד חברת סיירים ג׳"'
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={creating || !selectedTenantId || !selectedUnitId}
            className="flex items-center gap-2 px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold disabled:opacity-40 transition-colors"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
            {creating ? 'יוצר...' : 'צור קוד'}
          </button>
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center overflow-visible relative z-10">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="חפש קוד, תווית או יחידה..."
            className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
          />
        </div>
        <div className="min-w-[140px]">
          <SearchableSelect
            options={[
              { id: 'all', label: 'כל הסוגים' },
              { id: 'military', label: 'צבאי', icon: <Shield size={14} className="text-red-500" /> },
              { id: 'municipal', label: 'עירוני', icon: <Building2 size={14} className="text-cyan-500" /> },
              { id: 'educational', label: 'חינוכי', icon: <GraduationCap size={14} className="text-amber-500" /> },
            ]}
            value={filterType}
            onChange={v => setFilterType((v || 'all') as typeof filterType)}
            placeholder="כל הסוגים"
          />
        </div>
        <div className="min-w-[140px]">
          <SearchableSelect
            options={[
              { id: 'all', label: 'כל הסטטוסים' },
              { id: 'active', label: 'פעיל' },
              { id: 'used', label: 'בשימוש' },
              { id: 'inactive', label: 'מושבת' },
            ]}
            value={filterStatus}
            onChange={v => setFilterStatus((v || 'all') as typeof filterStatus)}
            placeholder="כל הסטטוסים"
          />
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {someSelected && (
        <div className="flex items-center gap-3 bg-violet-50 border border-violet-200 rounded-xl px-4 py-2.5">
          <span className="text-sm font-bold text-violet-700">{selectedIds.size} נבחרו</span>
          <button
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
          >
            {bulkDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            מחיקה קבוצתית
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-violet-600 hover:text-violet-800 font-bold"
          >
            נקה בחירה
          </button>
        </div>
      )}

      {/* Codes Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-slate-400 font-bold border-b border-slate-200 bg-slate-50">
              <th className="py-3 px-3 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                />
              </th>
              <th className="text-right py-3 px-4">קוד</th>
              <th className="text-right py-3 px-4">סוג</th>
              <th className="text-right py-3 px-4">היררכיית יחידה</th>
              <th className="text-right py-3 px-4">תווית</th>
              <th className="text-right py-3 px-4">שימושים</th>
              <th className="text-right py-3 px-4">משתמש</th>
              <th className="text-right py-3 px-4">סטטוס</th>
              <th className="text-right py-3 px-4 w-24">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(code => (
              <tr key={code.id} className={`border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors ${selectedIds.has(code.id) ? 'bg-violet-50/50' : ''}`}>
                <td className="py-3 px-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(code.id)}
                    onChange={() => toggleSelect(code.id)}
                    className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                  />
                </td>
                <td className="py-3 px-4">
                  <button
                    onClick={() => handleCopy(code.code)}
                    className="flex items-center gap-2 font-mono text-sm font-black text-violet-700 bg-violet-50 px-3 py-1 rounded-lg hover:bg-violet-100 transition-colors"
                  >
                    {code.code}
                    {copiedCode === code.code ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                  </button>
                </td>
                <td className="py-3 px-4">
                  <span className="flex items-center gap-1.5">
                    {tenantTypeIcon(code.tenantType)}
                    <span className="text-xs font-bold text-slate-600">
                      {code.tenantType === 'military' ? 'צבאי' : code.tenantType === 'educational' ? 'חינוכי' : 'עירוני'}
                    </span>
                  </span>
                </td>
                <td className="py-3 px-4 text-xs text-slate-600">
                  {code.unitPath.length > 0 ? code.unitPath.join(' › ') : code.unitId}
                </td>
                <td className="py-3 px-4 text-xs text-slate-500">{code.label ?? '—'}</td>
                <td className="py-3 px-4">
                  <span className="text-xs font-bold">
                    {code.usageCount}{code.maxUses > 0 ? ` / ${code.maxUses}` : ''}
                  </span>
                </td>
                <td className="py-3 px-4">
                  {code.usageCount > 0 ? (
                    <span className="text-xs font-bold text-violet-600 flex items-center gap-1">
                      <User size={11} />
                      {code.lastUsedByDisplayName || 'לא ידוע'}
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">זמין</span>
                  )}
                </td>
                <td className="py-3 px-4">
                  <button onClick={() => handleToggle(code)} className="flex items-center gap-1.5">
                    {code.isActive ? (
                      <><ToggleRight size={18} className="text-green-500" /><span className="text-[11px] font-bold text-green-600">פעיל</span></>
                    ) : (
                      <><ToggleLeft size={18} className="text-slate-300" /><span className="text-[11px] font-bold text-slate-400">מושבת</span></>
                    )}
                  </button>
                </td>
                <td className="py-3 px-4">
                  <button
                    onClick={() => handleDelete(code.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <KeyRound className="w-8 h-8 mx-auto mb-2 text-slate-200" />
            <p className="text-sm font-bold">{searchTerm ? 'לא נמצאו קודים' : 'אין קודי גישה עדיין'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
