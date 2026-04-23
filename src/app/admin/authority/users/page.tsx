'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { getAuthoritiesByManager, getAllAuthorities } from '@/features/admin/services/authority.service';
import { formatFirebaseTimestamp } from '@/lib/utils/date-formatter';
import {
  Search, Users, Trophy, TrendingUp, Calendar, MapPin,
  Loader2, AlertCircle, Shield, Zap, ArrowUpDown,
  User as UserIcon, Star, Medal, Activity,
} from 'lucide-react';

// ── Privacy-safe user projection ──────────────────────────────────────

interface ScopedUser {
  firstName: string;
  lastInitial: string;
  gender: 'male' | 'female' | 'other' | undefined;
  age: number | null;
  neighborhood: string | undefined;
  daysActive: number;
  globalXP: number;
  globalLevel: number;
  lastActive: string;
  lastActiveRaw: number;
  photoURL?: string;
}

function getPrivacyName(fullName: string) {
  const parts = (fullName || '').trim().split(/\s+/);
  const firstName = parts[0] || 'ללא שם';
  const lastInitial = parts.length > 1 ? parts[parts.length - 1][0] + '\u05F3' : '';
  return { firstName, lastInitial };
}

function calculateAge(birthDate: any): number | null {
  if (!birthDate) return null;
  let date: Date | null = null;
  if (birthDate instanceof Date) {
    date = birthDate;
  } else if (birthDate?.toDate) {
    date = birthDate.toDate();
  } else if (typeof birthDate?.seconds === 'number') {
    date = new Date(birthDate.seconds * 1000);
  }
  if (!date || isNaN(date.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const m = today.getMonth() - date.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < date.getDate())) age--;
  return age;
}

function genderLabel(g: string | undefined) {
  if (g === 'male') return 'גבר';
  if (g === 'female') return 'אישה';
  if (g === 'other') return 'אחר';
  return '—';
}

function genderIcon(g: string | undefined) {
  if (g === 'male') return '♂';
  if (g === 'female') return '♀';
  return '⚪';
}

type SortKey = 'name' | 'xp' | 'level' | 'activity' | 'age';

// ── Page ──────────────────────────────────────────────────────────────

export default function AuthorityUsersPage() {
  const [users, setUsers] = useState<ScopedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authorityName, setAuthorityName] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [neighborhoodFilter, setNeighborhoodFilter] = useState<string>('all');
  const [leaderboardMode, setLeaderboardMode] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);

  // ── Load users scoped to authority ──────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setError('יש להתחבר תחילה'); setLoading(false); return; }

      try {
        const role = await checkUserRole(user.uid);

        let aId: string | null = role.authorityIds?.[0] || null;
        let aName = '';

        if (role.isSuperAdmin) {
          const allAuths = await getAllAuthorities(undefined, true);
          const stored = typeof window !== 'undefined'
            ? localStorage.getItem('admin_selected_authority_id') : null;
          const target = (stored && allAuths.find(a => a.id === stored)) ?? allAuths[0];
          if (target) {
            aId = target.id;
            aName = typeof target.name === 'string' ? target.name : (target.name?.he || '');
          }
        } else {
          const auths = await getAuthoritiesByManager(user.uid);
          if (auths.length > 0) {
            const a = auths[0];
            aId = aId ?? a.id;
            aName = typeof a.name === 'string' ? a.name : (a.name?.he || a.name?.en || '');
          }
        }

        if (!aId) { setError('לא נמצאה רשות משויכת'); setLoading(false); return; }
        setAuthorityName(aName);

        const scopedQuery = query(
          collection(db, 'users'),
          where('core.authorityId', '==', aId),
        );
        const snapshot = await getDocs(scopedQuery);

        const mapped: ScopedUser[] = snapshot.docs.map(docSnap => {
          const data = docSnap.data();
          const core = data?.core || {};
          const progression = data?.progression || {};
          const { firstName, lastInitial } = getPrivacyName(core.name || '');

          let lastActiveTs = 0;
          if (data?.lastActive?.seconds) lastActiveTs = data.lastActive.seconds * 1000;
          else if (data?.lastActive instanceof Date) lastActiveTs = data.lastActive.getTime();

          return {
            firstName,
            lastInitial,
            gender: core.gender || undefined,
            age: calculateAge(core.birthDate),
            neighborhood: (data as any)?.neighborhood || undefined,
            daysActive: progression.daysActive || 0,
            globalXP: progression.globalXP || 0,
            globalLevel: progression.globalLevel || 1,
            lastActive: data?.lastActive ? formatFirebaseTimestamp(data.lastActive) : '—',
            lastActiveRaw: lastActiveTs,
            photoURL: core.photoURL || undefined,
          };
        });

        setUsers(mapped);
      } catch (err: any) {
        console.error('Error loading authority users:', err);
        setError(err?.message || 'שגיאה בטעינת משתמשים');
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

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
        case 'activity': cmp = a.lastActiveRaw - b.lastActiveRaw; break;
        case 'age': cmp = (a.age || 0) - (b.age || 0); break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return sorted;
  }, [users, searchQuery, neighborhoodFilter, leaderboardMode, sortKey, sortAsc]);

  const stats = useMemo(() => {
    const total = users.length;
    const active7d = users.filter(u => u.lastActiveRaw > Date.now() - 7 * 86400000).length;
    const avgXP = total > 0 ? Math.round(users.reduce((s, u) => s + u.globalXP, 0) / total) : 0;
    const totalDays = users.reduce((s, u) => s + u.daysActive, 0);
    return { total, active7d, avgXP, totalDays };
  }, [users]);

  const toggleSort = (key: SortKey) => {
    if (leaderboardMode) return;
    if (sortKey === key) { setSortAsc(!sortAsc); }
    else { setSortKey(key); setSortAsc(key === 'name'); }
  };

  // ── Loading / Error ─────────────────────────────────────────────────

  if (loading) {
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

      {/* ═══ Header ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Users size={24} className="text-cyan-600" />
            תושבים רשומים
          </h1>
          {authorityName && (
            <div className="flex items-center gap-2 mt-1">
              <Shield size={14} className="text-cyan-500" />
              <span className="text-sm text-slate-500 font-bold">{authorityName}</span>
              <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">
                תצוגה מוגנת פרטיות
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Stats Row ═══ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Users} label="סה״כ רשומים" value={stats.total} color="cyan" />
        <StatCard icon={Activity} label="פעילים (7 ימים)" value={stats.active7d} color="green" />
        <StatCard icon={Zap} label="XP ממוצע" value={stats.avgXP.toLocaleString()} color="purple" />
        <StatCard icon={Calendar} label="ימי אימון כוללים" value={stats.totalDays.toLocaleString()} color="amber" />
      </div>

      {/* ═══ Toolbar: Search + Filter + Leaderboard ═══ */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        {/* Search */}
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

        {/* Neighborhood Filter */}
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

        {/* Leaderboard Toggle */}
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
                        {user.lastActive}
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
