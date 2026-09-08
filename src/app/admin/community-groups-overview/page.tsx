'use client';

export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════════════
// כל הקבוצות במערכת — מסך פיקוח, לא ניהול תוכן (08.09.2026)
//
// נבנה אחרי ש-12 סניפי צו כושר התבררו כבלתי-נראים בפאנל (authorityId ריק
// חסם אותם מ-getGroupsByAuthority) — David ביקש מסך אחד שעונה "מה קיים
// אצלי בכלל", חוצה-רשויות.
//
// הבחנה מכוונת, לא טכנית: קבוצות "רשמיות" (source: authority/professional
// — ייבוא, פאנל, רשות) מול קבוצות "משתמשים" (source: 'user', נפתחו
// מהאפליקציה). לקבוצת משתמש - אין כאן עריכת תוכן בכלל, רק כיבוי/הפעלה
// והסרה. זו לא סקרנות - זו אחריות על תוכן שמשתמשים יוצרים לפני שהאפליקציה
// עולה לחנויות, בלי להתערב במה שהם כתבו.
//
// גישה: לא רשום ב-allowedPaths/vaAllowedPaths של admin/layout.tsx בכוונה
// — מסך חוצה-רשויות לא נועד למנהל-רשות בודד, בדיוק הכיוון ההפוך מהפער
// שמצאנו ב-isAdmin() (§8, לא תוקן) — לא פותר אותו, אבל לא מוסיף לו כלי
// נוח נוסף.
// ═══════════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { getAllAuthorities } from '@/features/admin/services/authority.service';
import { getAllGroupsForAdmin, updateGroup, deleteGroup } from '@/features/admin/services/community.service';
import type { Authority } from '@/types/admin-types';
import type { CommunityGroup } from '@/types/community.types';
import {
  Loader2,
  AlertTriangle,
  Users,
  Building2,
  UserCircle2,
  Power,
  Trash2,
  Pencil,
  ShieldCheck,
} from 'lucide-react';

type SourceFilter = 'all' | 'authority' | 'professional' | 'user';
type ActiveFilter = 'all' | 'active' | 'inactive';
type PersonaFilter = 'all' | 'none' | 'reserve';

const SOURCE_LABELS: Record<string, string> = {
  authority: 'רשות',
  professional: 'מקצועי',
  user: 'משתמש',
};

function formatUpdatedAt(d: unknown): string {
  if (!d) return '—';
  const date = d instanceof Date ? d : typeof (d as any)?.toDate === 'function' ? (d as any).toDate() : new Date(d as any);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function CommunityGroupsOverviewPage() {
  const router = useRouter();
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [groups, setGroups] = useState<CommunityGroup[]>([]);
  const [authoritiesById, setAuthoritiesById] = useState<Record<string, Authority>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [authorityFilter, setAuthorityFilter] = useState<string>('all');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');
  const [personaFilter, setPersonaFilter] = useState<PersonaFilter>('all');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setPageError('יש להתחבר תחילה'); setPageLoading(false); return; }
      try {
        const role = await checkUserRole(user.uid);
        if (!role.isSuperAdmin && !role.isSystemAdmin) {
          setPageError('מסך זה זמין למנהל-על בלבד');
          setPageLoading(false);
          return;
        }
        await load();
      } catch (err) {
        console.error('[CommunityGroupsOverview] auth check failed:', err);
        setPageError('שגיאה בטעינת הרשאות');
        setPageLoading(false);
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setPageLoading(true);
    try {
      const [allGroups, allAuthorities] = await Promise.all([
        getAllGroupsForAdmin(),
        getAllAuthorities(),
      ]);
      setGroups(allGroups);
      const byId: Record<string, Authority> = {};
      allAuthorities.forEach((a) => { byId[a.id] = a; });
      setAuthoritiesById(byId);
    } catch (err) {
      console.error('[CommunityGroupsOverview] load failed:', err);
      setPageError('שגיאה בטעינת הקבוצות');
    } finally {
      setPageLoading(false);
    }
  }

  const filtered = useMemo(() => {
    return groups.filter((g) => {
      const src = g.source ?? 'authority';
      if (sourceFilter !== 'all' && src !== sourceFilter) return false;
      if (authorityFilter !== 'all') {
        if (authorityFilter === '(none)') { if (g.authorityId) return false; }
        else if (g.authorityId !== authorityFilter) return false;
      }
      if (activeFilter === 'active' && !g.isActive) return false;
      if (activeFilter === 'inactive' && g.isActive) return false;
      const hasPersona = (g.audiencePersonas?.length ?? 0) > 0;
      if (personaFilter === 'reserve' && !g.audiencePersonas?.includes('reserve')) return false;
      if (personaFilter === 'none' && hasPersona) return false;
      return true;
    });
  }, [groups, sourceFilter, authorityFilter, activeFilter, personaFilter]);

  const authorityOptions = useMemo(() => {
    const ids = new Set(groups.map((g) => g.authorityId).filter(Boolean));
    return Array.from(ids).map((id) => ({ id: id as string, name: authoritiesById[id as string]?.name ?? id }));
  }, [groups, authoritiesById]);

  async function handleToggleActive(g: CommunityGroup) {
    setBusyId(g.id);
    try {
      // updateGroup() unconditionally re-stamps source: data.source ?? 'authority'
      // (community.service.ts — "repair any legacy doc missing it"). Omitting
      // `source` here would silently flip every source:'user' group to
      // 'authority' the moment an admin deactivates it — corrupting the exact
      // field this session's backfill just fixed, and defeating requirement
      // #5 (no edit path for user groups) the moment it's toggled once.
      // Found by an independent review agent before this ever shipped.
      await updateGroup(g.id, { isActive: !g.isActive, source: g.source }, g.audiencePersonas ?? []);
      setGroups((prev) => prev.map((x) => (x.id === g.id ? { ...x, isActive: !x.isActive } : x)));
    } catch (err) {
      console.error('[CommunityGroupsOverview] toggle isActive failed:', err);
      alert('שגיאה בעדכון הקבוצה');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(g: CommunityGroup) {
    if (!confirm(`למחוק לצמיתות את "${g.name}"? הפעולה אינה הפיכה.`)) return;
    setBusyId(g.id);
    try {
      await deleteGroup(g.id);
      setGroups((prev) => prev.filter((x) => x.id !== g.id));
    } catch (err) {
      console.error('[CommunityGroupsOverview] delete failed:', err);
      alert('שגיאה במחיקת הקבוצה');
    } finally {
      setBusyId(null);
    }
  }

  function handleEdit(g: CommunityGroup) {
    // No group-level deep-link exists in the per-authority screen — the
    // closest safe navigation is: select that authority (same localStorage
    // key the super-admin authority-switcher already uses), then open its
    // management tab, where the admin finds this group in a normal-sized
    // per-authority list. Full duplicate edit UI here is out of scope for
    // an oversight screen.
    if (g.authorityId && typeof window !== 'undefined') {
      localStorage.setItem('admin_selected_authority_id', g.authorityId);
    }
    router.push('/admin/authority/community?tab=manage');
  }

  if (pageLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <AlertTriangle className="w-10 h-10 text-amber-400" />
        <p className="text-lg font-bold text-slate-700">{pageError}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12" dir="rtl">
      {/* ═══ Header ═══ */}
      <div className="flex items-center gap-3 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="w-12 h-12 bg-violet-50 rounded-2xl flex items-center justify-center">
          <Users size={24} className="text-violet-600" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-900">כל הקבוצות במערכת</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {groups.length} קבוצות סה״כ, חוצה-רשויות — {filtered.length} מוצגות לפי הסינון
          </p>
        </div>
      </div>

      {/* ═══ Filters ═══ */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-wrap items-center gap-3">
        <FilterSelect
          label="מקור"
          value={sourceFilter}
          onChange={(v) => setSourceFilter(v as SourceFilter)}
          options={[
            { value: 'all', label: 'הכל' },
            { value: 'authority', label: 'רשות (רשמי)' },
            { value: 'professional', label: 'מקצועי (רשמי)' },
            { value: 'user', label: 'משתמשים' },
          ]}
        />
        <FilterSelect
          label="רשות/עיר"
          value={authorityFilter}
          onChange={setAuthorityFilter}
          options={[
            { value: 'all', label: 'הכל' },
            { value: '(none)', label: 'ללא שיוך' },
            ...authorityOptions.map((a) => ({ value: a.id, label: a.name })),
          ]}
        />
        <FilterSelect
          label="סטטוס"
          value={activeFilter}
          onChange={(v) => setActiveFilter(v as ActiveFilter)}
          options={[
            { value: 'all', label: 'הכל' },
            { value: 'active', label: 'פעילות' },
            { value: 'inactive', label: 'לא פעילות' },
          ]}
        />
        <FilterSelect
          label="פרסונה"
          value={personaFilter}
          onChange={(v) => setPersonaFilter(v as PersonaFilter)}
          options={[
            { value: 'all', label: 'הכל' },
            { value: 'reserve', label: 'מילואים (צו כושר)' },
            { value: 'none', label: 'ציבורי (ללא פרסונה)' },
          ]}
        />
      </div>

      {/* ═══ Table ═══ */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="text-[11px] text-slate-400 font-bold border-b border-slate-200">
              <th className="text-right py-3 px-4">שם</th>
              <th className="text-right py-3 px-4">רשות/עיר</th>
              <th className="text-right py-3 px-4">מקור</th>
              <th className="text-right py-3 px-4">סטטוס</th>
              <th className="text-right py-3 px-4">חברים</th>
              <th className="text-right py-3 px-4">פרסונה</th>
              <th className="text-right py-3 px-4">עודכן</th>
              <th className="text-right py-3 px-4">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((g) => {
              const src = g.source ?? 'authority';
              const isUserGroup = src === 'user';
              const authorityName = g.authorityId ? (authoritiesById[g.authorityId]?.name ?? g.authorityId) : '—';
              const busy = busyId === g.id;
              return (
                <tr key={g.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4 font-bold text-slate-800 max-w-[220px] truncate">{g.name}</td>
                  <td className="py-3 px-4 text-slate-500">{authorityName}</td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full ${
                      isUserGroup ? 'bg-cyan-50 text-cyan-700' : 'bg-violet-50 text-violet-700'
                    }`}>
                      {isUserGroup ? <UserCircle2 className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
                      {SOURCE_LABELS[src] ?? src}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${
                      g.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                    }`}>
                      {g.isActive ? 'פעילה' : 'לא פעילה'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-500">{g.currentParticipants ?? g.memberCount ?? 0}</td>
                  <td className="py-3 px-4 text-slate-500">
                    {g.audiencePersonas?.length ? g.audiencePersonas.join(', ') : '—'}
                  </td>
                  <td className="py-3 px-4 text-[11px] text-slate-400">{formatUpdatedAt(g.updatedAt)}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5">
                      <button
                        disabled={busy}
                        onClick={() => handleToggleActive(g)}
                        title={g.isActive ? 'השבת קבוצה' : 'הפעל קבוצה'}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 disabled:opacity-40 transition-colors"
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => handleDelete(g)}
                        title="הסר קבוצה"
                        className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 disabled:opacity-40 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      {/* עריכת תוכן — רק לקבוצות רשמיות. קבוצת משתמש היא שלו,
                          לא עורכים אותה בשקט (החלטת דוד, 08.09.2026).
                          מוצג רק ל-source==='authority' דווקא, לא "כל מה
                          שאינו user": handleEdit מנווט למסך הרשות
                          (CommunityGroups.tsx), וה-officialGroups שלו מסנן
                          החוצה גם 'professional' — כפתור לשם היה מוביל
                          למסך ריק לקבוצה כזו. אין כרגע אף נתיב יצירה
                          שכותב source:'professional' בכלל (נבדק), אז זה
                          לא חוסם היום — אבל אל תרחיב בחזרה ל-!isUserGroup
                          בלי לבנות קודם יעד עריכה אמיתי לסוג הזה. */}
                      {src === 'authority' && (
                        <button
                          onClick={() => handleEdit(g)}
                          title="ערוך (במסך הרשות)"
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-16 text-slate-400 text-sm font-bold">
                  אין קבוצות התואמות את הסינון
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterSelect({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-2 text-xs font-bold text-slate-500">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-300"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
