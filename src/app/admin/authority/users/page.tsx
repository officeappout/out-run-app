'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { getAllAuthorities } from '@/features/admin/services/authority.service';
import { Authority } from '@/types/admin-types';
import { formatFirebaseTimestamp } from '@/lib/utils/date-formatter';
import {
  Search, Users, Trophy, Calendar, MapPin,
  Loader2, AlertCircle, Shield, Zap, ArrowUpDown,
  User as UserIcon, Medal, ChevronDown,
} from 'lucide-react';

// ── Page ──────────────────────────────────────────────────────────────
//
// super_admin / system_admin ONLY (product decision, 22.09.2026 follow-up
// to the city-summary rollout). Authority managers no longer have this tab
// at all — their own city's aggregate numbers live on the dashboard card
// instead (GET /api/authority-manager/city-summary). This screen restores
// the full cross-city roster super_admin had before, sourced from the
// separate GET /api/admin/authority-roster?authorityId=... endpoint (full
// per-resident data — names, age, gender, etc. — NEVER shared query code
// with the aggregate-only city-summary endpoint).

interface RosterEntry {
  firstName: string;
  lastInitial: string;
  gender: 'male' | 'female' | 'other' | null;
  age: number | null;
  neighborhood: string | null;
  daysActive: number;
  globalXP: number;
  globalLevel: number;
  lastActiveRaw: number | null;
  photoURL: string | null;
}

function genderLabel(g: string | null) {
  if (g === 'male') return 'גבר';
  if (g === 'female') return 'אישה';
  if (g === 'other') return 'אחר';
  return '—';
}

function genderIcon(g: string | null) {
  if (g === 'male') return '♂';
  if (g === 'female') return '♀';
  return '⚪';
}

type SortKey = 'name' | 'xp' | 'level' | 'activity' | 'age';

const AUTHORITY_STORAGE_KEY = 'admin_selected_authority_id';

export default function AuthorityUsersPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null); // null = still checking
  const [authorities, setAuthorities] = useState<Authority[]>([]);
  const [selectedAuthority, setSelectedAuthority] = useState<Authority | null>(null);
  const [showAuthorityDropdown, setShowAuthorityDropdown] = useState(false);

  const [users, setUsers] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [neighborhoodFilter, setNeighborhoodFilter] = useState<string>('all');
  const [leaderboardMode, setLeaderboardMode] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);

  const persistAndSelect = (a: Authority) => {
    setSelectedAuthority(a);
    try {
      localStorage.setItem(AUTHORITY_STORAGE_KEY, a.id);
    } catch { /* private-browsing / storage full — graceful no-op */ }
  };

  // ── Authorize, then load authorities list ───────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setError('יש להתחבר תחילה'); setLoading(false); setAuthorized(false); return; }

      try {
        const role = await checkUserRole(user.uid);
        if (!role.isSuperAdmin && !role.isSystemAdmin) {
          setAuthorized(false);
          setLoading(false);
          return;
        }
        setAuthorized(true);

        const allAuths = await getAllAuthorities(undefined, true);
        setAuthorities(allAuths);
        const stored = typeof window !== 'undefined' ? localStorage.getItem(AUTHORITY_STORAGE_KEY) : null;
        const target = (stored && allAuths.find(a => a.id === stored)) ?? allAuths[0];
        if (target) setSelectedAuthority(target);
        else { setLoading(false); }
      } catch (err) {
        console.error('[AuthorityUsersPage] authorization check failed:', err);
        setError('שגיאה בבדיקת הרשאות');
        setAuthorized(false);
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // ── Load roster whenever the selected authority changes ─────────────
  useEffect(() => {
    if (!authorized || !selectedAuthority) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const user = auth.currentUser;
        if (!user) { setError('יש להתחבר תחילה'); return; }
        const idToken = await user.getIdToken();
        const res = await fetch(
          `/api/admin/authority-roster?authorityId=${encodeURIComponent(selectedAuthority.id)}`,
          { headers: { Authorization: `Bearer ${idToken}` } },
        );
        if (!res.ok) {
          setError(res.status === 403 ? 'אין הרשאה לצפות ברשימה זו.' : 'שגיאה בטעינת משתמשים');
          return;
        }
        const data = await res.json();
        if (!cancelled) setUsers(data.roster || []);
      } catch (err) {
        console.error('[AuthorityUsersPage] failed to load roster:', err);
        if (!cancelled) setError('שגיאה בטעינת משתמשים');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [authorized, selectedAuthority]);

  // ── Derived data ────────────────────────────────────────────────────

  const neighborhoods = useMemo(() => {
    const set = new Set<string>();
    users.forEach(u => { if (u.neighborhood) set.add(u.neighborhood); });
    return Array.from(set).sort();
  }, [users]);

  const filteredUsers = useMemo(() => {
    let list = users;

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(u => u.firstName.toLowerCase().includes(q));
    }

    if (neighborhoodFilter !== 'all') {
      list = list.filter(u => u.neighborhood === neighborhoodFilter);
    }

    if (leaderboardMode) {
      return [...list].sort((a, b) => b.globalXP - a.globalXP);
    }

    const sorted = [...list];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name': cmp = a.firstName.localeCompare(b.firstName, 'he'); break;
        case 'xp': cmp = a.globalXP - b.globalXP; break;
        case 'level': cmp = a.globalLevel - b.globalLevel; break;
        case 'activity': cmp = (a.lastActiveRaw || 0) - (b.lastActiveRaw || 0); break;
        case 'age': cmp = (a.age || 0) - (b.age || 0); break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return sorted;
  }, [users, searchQuery, neighborhoodFilter, leaderboardMode, sortKey, sortAsc]);

  const stats = useMemo(() => {
    const total = users.length;
    const active7d = users.filter(u => (u.lastActiveRaw || 0) > Date.now() - 7 * 86400000).length;
    const avgXP = total > 0 ? Math.round(users.reduce((s, u) => s + u.globalXP, 0) / total) : 0;
    const totalDays = users.reduce((s, u) => s + u.daysActive, 0);
    return { total, active7d, avgXP, totalDays };
  }, [users]);

  const toggleSort = (key: SortKey) => {
    if (leaderboardMode) return;
    if (sortKey === key) { setSortAsc(!sortAsc); }
    else { setSortKey(key); setSortAsc(key === 'name'); }
  };

  // Authority.name is typed as `string`, but (matching the same pattern
  // already used elsewhere in this codebase — dashboard/page.tsx,
  // authority/locations/page.tsx) can hold a {he, en} object at runtime.
  const authorityDisplayName = (a: Authority) => {
    if (typeof a.name === 'string') return a.name;
    const localized = a.name as unknown as { he?: string; en?: string } | undefined;
    return localized?.he || localized?.en || a.id;
  };

  // ── Authorization gate ───────────────────────────────────────────────

  if (authorized === null) {
    return (
      <div className="flex items-center justify-center h-64 gap-3" dir="rtl">
        <Loader2 className="animate-spin text-cyan-500" size={28} />
        <span className="text-slate-600">בודק הרשאות...</span>
      </div>
    );
  }

  if (authorized === false) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4" dir="rtl">
        <Shield size={40} className="text-gray-400" />
        <div className="text-center">
          <h3 className="text-lg font-bold text-gray-900 mb-1">אין הרשאה</h3>
          <p className="text-gray-500 text-sm">מסך זה זמין למנהלי מערכת בלבד.</p>
        </div>
      </div>
    );
  }

  // ── Loading / Error ─────────────────────────────────────────────────

  if (loading && users.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 gap-3" dir="rtl">
        <Loader2 className="animate-spin text-cyan-500" size={28} />
        <span className="text-slate-600">טוען נתוני משתמשים...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4" dir="rtl">
        <AlertCircle size={40} className="text-red-400" />
        <p className="text-red-600 font-semibold">{error}</p>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6" dir="rtl">

      {/* ═══ Header + Authority Picker ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Users size={24} className="text-cyan-600" />
            תושבים רשומים
          </h1>
          <p className="text-xs text-slate-400 mt-1">תצוגת מנהל מערכת — כל הרשויות</p>
        </div>

        {authorities.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowAuthorityDropdown(v => !v)}
              className="flex items-center gap-2 bg-white border border-gray-200 px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-gray-50 transition-all"
            >
              <Shield size={14} className="text-cyan-500" />
              {selectedAuthority ? authorityDisplayName(selectedAuthority) : 'בחר רשות'}
              <ChevronDown size={14} className={`transition-transform ${showAuthorityDropdown ? 'rotate-180' : ''}`} />
            </button>
            {showAuthorityDropdown && (
              <div className="absolute left-0 mt-2 w-64 max-h-80 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg z-10">
                {authorities.map(a => (
                  <button
                    key={a.id}
                    onClick={() => { persistAndSelect(a); setShowAuthorityDropdown(false); }}
                    className={`w-full text-right px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${
                      selectedAuthority?.id === a.id ? 'bg-cyan-50 font-bold text-cyan-700' : 'text-gray-700'
                    }`}
                  >
                    {authorityDisplayName(a)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ Stats Row ═══ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Users} label="סה״כ רשומים" value={stats.total} color="cyan" />
        <StatCard icon={Zap} label="פעילים (7 ימים)" value={stats.active7d} color="green" />
        <StatCard icon={Zap} label="XP ממוצע" value={stats.avgXP.toLocaleString()} color="purple" />
        <StatCard icon={Calendar} label="ימי אימון כוללים" value={stats.totalDays.toLocaleString()} color="amber" />
      </div>

      {/* ═══ Toolbar: Search + Filter + Leaderboard ═══ */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="חפש לפי שם פרטי..."
            className="w-full py-2.5 pr-10 pl-4 bg-slate-50 rounded-xl border-2 border-transparent focus:border-cyan-400 focus:bg-white outline-none text-sm text-right transition-all"
          />
        </div>

        <div className="relative min-w-[180px]">
          <MapPin size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select
            value={neighborhoodFilter}
            onChange={e => setNeighborhoodFilter(e.target.value)}
            className="w-full py-2.5 pr-9 pl-4 bg-slate-50 rounded-xl border-2 border-transparent focus:border-cyan-400 appearance-none outline-none text-sm font-medium cursor-pointer transition-all"
          >
            <option value="all">כל השכונות</option>
            {neighborhoods.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        <button
          onClick={() => setLeaderboardMode(!leaderboardMode)}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${
            leaderboardMode
              ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-200'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Trophy size={16} />
          {leaderboardMode ? 'מצב לידרבורד' : 'לידרבורד'}
        </button>
      </div>

      {/* ═══ Table ═══ */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        {filteredUsers.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <UserIcon size={40} className="mx-auto mb-3 text-slate-300" />
            <p className="font-bold">לא נמצאו תושבים</p>
            <p className="text-xs mt-1">נסה לשנות את החיפוש או הסינון</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80">
                  {leaderboardMode && (
                    <th className="py-3 px-4 text-center font-black text-slate-500 w-12">#</th>
                  )}
                  <SortHeader label="שם" sortKey="name" active={sortKey} asc={sortAsc} leaderboard={leaderboardMode} onSort={toggleSort} />
                  <th className="py-3 px-3 text-center font-bold text-slate-500">מגדר</th>
                  <SortHeader label="גיל" sortKey="age" active={sortKey} asc={sortAsc} leaderboard={leaderboardMode} onSort={toggleSort} />
                  <th className="py-3 px-3 text-right font-bold text-slate-500">שכונה</th>
                  <SortHeader label="ימי פעילות" sortKey="activity" active={sortKey} asc={sortAsc} leaderboard={leaderboardMode} onSort={toggleSort} align="center" />
                  <SortHeader label="XP" sortKey="xp" active={sortKey} asc={sortAsc} leaderboard={leaderboardMode} onSort={toggleSort} align="center" />
                  <SortHeader label="רמה" sortKey="level" active={sortKey} asc={sortAsc} leaderboard={leaderboardMode} onSort={toggleSort} align="center" />
                  <th className="py-3 px-3 text-right font-bold text-slate-500">פעילות אחרונה</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user, idx) => {
                  const rank = idx + 1;
                  const isTop3 = leaderboardMode && rank <= 3;
                  return (
                    <tr
                      key={`${user.firstName}-${idx}`}
                      className={`border-b border-slate-50 transition-colors ${
                        isTop3
                          ? rank === 1 ? 'bg-amber-50/60' : rank === 2 ? 'bg-slate-50/60' : 'bg-orange-50/40'
                          : 'hover:bg-slate-50/50'
                      }`}
                    >
                      {leaderboardMode && (
                        <td className="py-3 px-4 text-center">
                          {rank === 1 ? <Medal size={20} className="text-amber-500 mx-auto" /> :
                           rank === 2 ? <Medal size={18} className="text-slate-400 mx-auto" /> :
                           rank === 3 ? <Medal size={16} className="text-orange-400 mx-auto" /> :
                           <span className="text-slate-400 font-mono text-xs">{rank}</span>}
                        </td>
                      )}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-100 to-blue-100 flex items-center justify-center flex-shrink-0 border border-cyan-200">
                            {user.photoURL ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={user.photoURL} alt="" className="w-full h-full rounded-full object-cover" />
                            ) : (
                              <span className="text-sm font-black text-cyan-600">
                                {user.firstName[0]}
                              </span>
                            )}
                          </div>
                          <span className={`font-bold ${isTop3 ? 'text-slate-900' : 'text-slate-700'}`}>
                            {user.firstName} {user.lastInitial}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="text-base" title={genderLabel(user.gender)}>
                          {genderIcon(user.gender)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center text-slate-600">
                        {user.age !== null ? user.age : '—'}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-600 text-xs">
                        {user.neighborhood || '—'}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="inline-flex items-center gap-1 text-slate-600">
                          <Calendar size={12} className="text-slate-400" />
                          {user.daysActive}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`inline-flex items-center gap-1 font-bold ${
                          leaderboardMode && rank <= 3 ? 'text-amber-600' : 'text-purple-600'
                        }`}>
                          <Zap size={12} />
                          {user.globalXP.toLocaleString()}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-cyan-100 text-cyan-700 text-xs font-black">
                          {user.globalLevel}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right text-xs text-slate-500">
                        {user.lastActiveRaw ? formatFirebaseTimestamp(user.lastActiveRaw) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
          <span>מציג {filteredUsers.length} מתוך {users.length} תושבים</span>
          <span className="flex items-center gap-1.5">
            <Shield size={12} className="text-amber-500" />
            אימייל, טלפון ומזהה אישי מוסתרים
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: string | number; color: string;
}) {
  const colorMap: Record<string, string> = {
    cyan: 'from-cyan-50 to-cyan-100/50 border-cyan-200 text-cyan-700',
    green: 'from-green-50 to-green-100/50 border-green-200 text-green-700',
    purple: 'from-purple-50 to-purple-100/50 border-purple-200 text-purple-700',
    amber: 'from-amber-50 to-amber-100/50 border-amber-200 text-amber-700',
  };
  const iconColorMap: Record<string, string> = {
    cyan: 'text-cyan-500', green: 'text-green-500', purple: 'text-purple-500', amber: 'text-amber-500',
  };
  return (
    <div className={`bg-gradient-to-br ${colorMap[color]} border rounded-2xl p-4 flex items-center gap-3`}>
      <div className={`w-10 h-10 rounded-xl bg-white/70 flex items-center justify-center ${iconColorMap[color]}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</p>
        <p className="text-xl font-black">{value}</p>
      </div>
    </div>
  );
}

function SortHeader({ label, sortKey, active, asc, leaderboard, onSort, align = 'right' }: {
  label: string; sortKey: SortKey; active: SortKey; asc: boolean;
  leaderboard: boolean; onSort: (k: SortKey) => void; align?: 'right' | 'center';
}) {
  const isActive = active === sortKey && !leaderboard;
  return (
    <th
      className={`py-3 px-3 font-bold text-slate-500 ${align === 'center' ? 'text-center' : 'text-right'} ${
        leaderboard ? '' : 'cursor-pointer select-none hover:text-slate-700'
      }`}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive && (
          <ArrowUpDown size={12} className={`transition-transform ${asc ? '' : 'rotate-180'}`} />
        )}
      </span>
    </th>
  );
}
