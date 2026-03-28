'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CommunityGroup, SessionAttendance } from '@/types/community.types';
import {
  Users,
  CalendarCheck,
  Clock,
  MapPin,
  ChevronLeft,
  Activity,
  TrendingUp,
  Loader2,
  CalendarDays,
  ArrowLeft,
  BarChart3,
} from 'lucide-react';

function toISODate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

const DAY_LABELS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

type TabId = 'today' | 'upcoming' | 'past';

interface DashboardSession {
  groupId: string;
  groupName: string;
  time: string;
  date: string;
  dayOfWeek: number;
  location: string;
  maxParticipants?: number;
  attendance: SessionAttendance | null;
  label?: string;
}

interface DebugInfo {
  groupCount: number;
  totalSlots: number;
  attendanceDocs: number;
  authorityId: string;
}

interface SessionsDashboardProps {
  authorityId: string;
  compact?: boolean;
}

export default function SessionsDashboard({ authorityId, compact }: SessionsDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<CommunityGroup[]>([]);
  const [allAttendance, setAllAttendance] = useState<Map<string, Map<string, SessionAttendance>>>(new Map());
  const [weeklyRsvps, setWeeklyRsvps] = useState(0);
  const [selectedSession, setSelectedSession] = useState<DashboardSession | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('today');
  const [pickerDate, setPickerDate] = useState('');
  const [debug, setDebug] = useState<DebugInfo>({ groupCount: 0, totalSlots: 0, attendanceDocs: 0, authorityId: '' });

  const loadData = useCallback(async (authId: string) => {
    setLoading(true);
    try {
      const groupsSnap = await getDocs(
        query(collection(db, 'community_groups'), where('authorityId', '==', authId)),
      );
      const allGroups = groupsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as CommunityGroup));
      setGroups(allGroups);

      let totalSlots = 0;
      for (const g of allGroups) {
        const slots = g.scheduleSlots?.length ? g.scheduleSlots : g.schedule ? [g.schedule] : [];
        totalSlots += slots.length;
      }

      const attMap = new Map<string, Map<string, SessionAttendance>>();
      const today = new Date();
      const weekAgo = addDays(today, -7);
      let rsvpTotal = 0;
      let attDocCount = 0;

      for (const group of allGroups) {
        try {
          const attSnap = await getDocs(collection(db, 'community_groups', group.id, 'attendance'));
          const docMap = new Map<string, SessionAttendance>();
          for (const adoc of attSnap.docs) {
            const data = adoc.data() as SessionAttendance;
            docMap.set(adoc.id, data);
            attDocCount++;
            if (data.date >= toISODate(weekAgo)) {
              rsvpTotal += data.currentCount;
            }
          }
          attMap.set(group.id, docMap);
        } catch { /* no attendance docs yet */ }
      }

      setAllAttendance(attMap);
      setWeeklyRsvps(rsvpTotal);
      setDebug({ groupCount: allGroups.length, totalSlots, attendanceDocs: attDocCount, authorityId: authId });
    } catch (err) {
      console.error('[SessionsDashboard] load failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authorityId) loadData(authorityId);
  }, [authorityId, loadData]);

  const buildSessionsForDate = useCallback((targetDate: Date): DashboardSession[] => {
    const iso = toISODate(targetDate);
    const dow = targetDate.getDay();
    const sessions: DashboardSession[] = [];

    for (const group of groups) {
      const slots = group.scheduleSlots?.length ? group.scheduleSlots : group.schedule ? [group.schedule] : [];
      for (const slot of slots) {
        if (slot.dayOfWeek !== dow) continue;
        const docId = `${iso}_${slot.time.replace(':', '-')}`;
        const att = allAttendance.get(group.id)?.get(docId) ?? null;
        sessions.push({
          groupId: group.id,
          groupName: group.name,
          time: slot.time,
          date: iso,
          dayOfWeek: dow,
          location: slot.location?.address || group.meetingLocation?.address || '—',
          maxParticipants: slot.maxParticipants ?? group.maxParticipants,
          attendance: att,
          label: slot.label,
        });
      }
    }
    sessions.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
    return sessions;
  }, [groups, allAttendance]);

  const todaySessions = useMemo(() => buildSessionsForDate(new Date()), [buildSessionsForDate]);
  const upcomingSessions = useMemo(() => {
    const results: DashboardSession[] = [];
    for (let i = 1; i <= 30; i++) results.push(...buildSessionsForDate(addDays(new Date(), i)));
    return results;
  }, [buildSessionsForDate]);
  const pastSessions = useMemo(() => {
    const results: DashboardSession[] = [];
    for (let i = 1; i <= 30; i++) results.push(...buildSessionsForDate(addDays(new Date(), -i)));
    results.sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
    return results;
  }, [buildSessionsForDate]);

  const filteredSessions = useMemo(() => {
    if (pickerDate) return buildSessionsForDate(new Date(pickerDate + 'T00:00:00'));
    switch (activeTab) {
      case 'today': return todaySessions;
      case 'upcoming': return upcomingSessions;
      case 'past': return pastSessions;
    }
  }, [activeTab, pickerDate, todaySessions, upcomingSessions, pastSessions, buildSessionsForDate]);

  const activeGroupsToday = useMemo(() => new Set(todaySessions.map((s) => s.groupId)).size, [todaySessions]);

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: 'today', label: 'היום', count: todaySessions.length },
    { id: 'upcoming', label: 'עתידי', count: upcomingSessions.length },
    { id: 'past', label: 'היסטוריה', count: pastSessions.length },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-7 h-7 animate-spin text-cyan-500" />
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${compact ? '' : 'max-w-5xl mx-auto space-y-8'}`} dir="rtl">
      {/* Header — only in standalone mode */}
      {!compact && (
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2">
            <Activity className="w-6 h-6 text-cyan-500" />
            דשבורד מפגשים
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            יום {DAY_LABELS[new Date().getDay()]}, {new Date().toLocaleDateString('he-IL')}
          </p>
        </div>
      )}

      {/* Top Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-2xl p-5 border border-cyan-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-cyan-600 uppercase tracking-widest">RSVPs השבוע</p>
              <p className="text-2xl font-black text-gray-900">{weeklyRsvps}</p>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-5 border border-emerald-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">קבוצות פעילות היום</p>
              <p className="text-2xl font-black text-gray-900">{activeGroupsToday}</p>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-2xl p-5 border border-purple-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500 flex items-center justify-center">
              <CalendarCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-purple-600 uppercase tracking-widest">מפגשים היום</p>
              <p className="text-2xl font-black text-gray-900">{todaySessions.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs + Date Picker */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setPickerDate(''); setSelectedSession(null); }}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                activeTab === tab.id && !pickerDate ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              <span className={`mr-1.5 text-xs ${activeTab === tab.id && !pickerDate ? 'text-cyan-500' : 'text-gray-400'}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-gray-400" />
          <input
            type="date"
            value={pickerDate}
            onChange={(e) => { setPickerDate(e.target.value); setSelectedSession(null); }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-200 bg-white"
          />
          {pickerDate && (
            <button onClick={() => setPickerDate('')} className="text-xs text-cyan-600 font-bold hover:underline">
              נקה
            </button>
          )}
        </div>
      </div>

      {/* Sessions Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-black flex items-center gap-2">
            <Clock className="w-5 h-5 text-cyan-500" />
            {pickerDate
              ? `מפגשים ל-${new Date(pickerDate + 'T00:00:00').toLocaleDateString('he-IL')}`
              : activeTab === 'today' ? 'מפגשים להיום' : activeTab === 'upcoming' ? 'מפגשים קרובים' : 'היסטוריית מפגשים'}
          </h2>
          <span className="text-xs text-gray-400">
            {filteredSessions.length} מפגשים
            <span className="text-gray-300 mr-2">({debug.attendanceDocs} רשומות)</span>
          </span>
        </div>

        {filteredSessions.length === 0 ? (
          <EmptyState tab={pickerDate ? 'picker' : activeTab} onSwitchTab={() => { setActiveTab('upcoming'); setPickerDate(''); }} debug={debug} />
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredSessions.map((session, i) => (
              <SessionRow
                key={`${session.groupId}_${session.date}_${session.time}_${i}`}
                session={session}
                showDate={activeTab !== 'today' || !!pickerDate}
                showSuccessRate={activeTab === 'past'}
                isSelected={selectedSession?.groupId === session.groupId && selectedSession?.time === session.time && selectedSession?.date === session.date}
                onSelect={() =>
                  setSelectedSession(
                    selectedSession?.groupId === session.groupId && selectedSession?.time === session.time && selectedSession?.date === session.date ? null : session,
                  )
                }
              />
            ))}
          </div>
        )}
      </div>

      {selectedSession && <AttendanceDetail session={selectedSession} />}
    </div>
  );
}

/* ── Exported helpers for the analytics summary card ─────────── */

export { toISODate, addDays };

/* ── Session Row ────────────────────────────────────────────────── */

function SessionRow({ session, showDate, showSuccessRate, isSelected, onSelect }: {
  session: DashboardSession; showDate: boolean; showSuccessRate: boolean; isSelected: boolean; onSelect: () => void;
}) {
  const count = session.attendance?.currentCount ?? 0;
  const max = session.maxParticipants;
  const waitlistCount = session.attendance?.waitlist?.length ?? 0;
  const pct = max ? Math.min(100, Math.round((count / max) * 100)) : null;
  const successRate = max && max > 0 ? Math.round((count / max) * 100) : null;

  return (
    <button onClick={onSelect} className={`w-full text-right px-5 py-4 hover:bg-gray-50 transition-colors flex items-center gap-4 ${isSelected ? 'bg-cyan-50/50' : ''}`}>
      <div className="w-20 flex-shrink-0">
        {showDate && <p className="text-[10px] text-gray-400 font-bold">{DAY_LABELS[session.dayOfWeek]} {session.date.slice(5)}</p>}
        <span className="text-lg font-black text-gray-900">{session.time}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-800 truncate">
          {session.groupName}
          {session.label && <span className="text-gray-400 font-medium mr-1.5">— {session.label}</span>}
        </p>
        <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5 truncate">
          <MapPin className="w-3 h-3 flex-shrink-0" />{session.location}
        </p>
      </div>
      <div className="w-32 flex-shrink-0">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className={`font-bold ${pct != null && pct >= 100 ? 'text-red-500' : 'text-gray-700'}`}>
            {count}{max ? `/${max}` : ''} משתתפים
          </span>
        </div>
        {pct != null && (
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-cyan-500'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
        )}
        {waitlistCount > 0 && <p className="text-[10px] text-amber-600 font-bold mt-0.5">{waitlistCount} ברשימת המתנה</p>}
      </div>
      {showSuccessRate && (
        <div className="w-16 flex-shrink-0 text-center">
          {successRate != null ? (
            <span className={`text-sm font-black ${successRate >= 80 ? 'text-emerald-600' : successRate >= 50 ? 'text-amber-600' : 'text-red-500'}`}>{successRate}%</span>
          ) : <span className="text-xs text-gray-300">—</span>}
        </div>
      )}
      <ChevronLeft className={`w-4 h-4 flex-shrink-0 transition-transform ${isSelected ? 'rotate-90 text-cyan-500' : 'text-gray-300'}`} />
    </button>
  );
}

/* ── Empty State ────────────────────────────────────────────────── */

function EmptyState({ tab, onSwitchTab, debug }: { tab: string; onSwitchTab: () => void; debug: DebugInfo }) {
  const debugLine = (
    <p className="mt-4 text-[10px] text-gray-300 font-mono">
      נבדקו {debug.groupCount} קבוצות עם {debug.totalSlots} משבצות, נמצאו {debug.attendanceDocs} רשומות נוכחות
    </p>
  );
  if (tab === 'today') return (
    <div className="p-10 text-center">
      <CalendarCheck className="w-12 h-12 mx-auto mb-3 text-gray-200" />
      <p className="font-bold text-gray-500 text-base">אין מפגשים מתוכננים להיום</p>
      <p className="text-sm text-gray-400 mt-1">אולי תרצה לראות מה מתוכנן למחר?</p>
      <button onClick={onSwitchTab} className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-cyan-50 text-cyan-600 rounded-xl text-sm font-bold hover:bg-cyan-100 transition-colors">
        <ArrowLeft className="w-4 h-4" />מפגשים קרובים
      </button>
      {debugLine}
    </div>
  );
  if (tab === 'upcoming') return (
    <div className="p-10 text-center">
      <CalendarDays className="w-12 h-12 mx-auto mb-3 text-gray-200" />
      <p className="font-bold text-gray-500 text-base">אין מפגשים מתוכננים ב-30 הימים הקרובים</p>
      <p className="text-sm text-gray-400 mt-1">הוסף מפגשים דרך דף ניהול הקהילות</p>
      {debugLine}
    </div>
  );
  if (tab === 'past') return (
    <div className="p-10 text-center">
      <BarChart3 className="w-12 h-12 mx-auto mb-3 text-gray-200" />
      <p className="font-bold text-gray-500 text-base">אין היסטוריית מפגשים</p>
      <p className="text-sm text-gray-400 mt-1">ברגע שהמפגשים הראשונים יתקיימו, הנתונים יופיעו כאן</p>
      {debugLine}
    </div>
  );
  return (
    <div className="p-10 text-center">
      <CalendarCheck className="w-12 h-12 mx-auto mb-3 text-gray-200" />
      <p className="font-bold text-gray-500 text-base">אין מפגשים בתאריך הנבחר</p>
      {debugLine}
    </div>
  );
}

/* ── Attendance Detail ──────────────────────────────────────────── */

function AttendanceDetail({ session }: { session: DashboardSession }) {
  const count = session.attendance?.currentCount ?? 0;
  const max = session.maxParticipants;
  const successRate = max && max > 0 ? Math.round((count / max) * 100) : null;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="text-base font-black">{session.groupName} — {session.time}</h3>
          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
            <MapPin className="w-3 h-3" />{session.location}<span className="mx-1">·</span>{DAY_LABELS[session.dayOfWeek]} {session.date}
          </p>
        </div>
        {successRate != null && (
          <div className="text-center">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">אחוז הצלחה</p>
            <p className={`text-xl font-black ${successRate >= 80 ? 'text-emerald-600' : successRate >= 50 ? 'text-amber-600' : 'text-red-500'}`}>{successRate}%</p>
          </div>
        )}
      </div>
      <div className="p-5">
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-cyan-500" />רשומים ({count}{max ? `/${max}` : ''})
        </h4>
        {session.attendance && Object.keys(session.attendance.attendeeProfiles ?? {}).length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(session.attendance.attendeeProfiles ?? {}).map(([uid, p]) => (
              <div key={uid} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                {p.photoURL ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.photoURL} alt={p.name} className="w-7 h-7 rounded-full object-cover" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                    <span className="text-[10px] text-white font-black">{p.name?.charAt(0)}</span>
                  </div>
                )}
                <span className="text-xs font-bold text-gray-700 truncate">{p.name}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-xs text-gray-400">אין נרשמים עדיין</p>}
      </div>
      {(session.attendance?.waitlist?.length ?? 0) > 0 && (
        <div className="px-5 pb-5 border-t border-gray-100 pt-4">
          <h4 className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            ⏳ רשימת המתנה ({session.attendance!.waitlist!.length})
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(session.attendance?.waitlistProfiles ?? {}).map(([uid, p]) => (
              <div key={uid} className="flex items-center gap-2 bg-amber-50 rounded-xl px-3 py-2 border border-amber-100">
                {p.photoURL ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.photoURL} alt={p.name} className="w-7 h-7 rounded-full object-cover" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                    <span className="text-[10px] text-white font-black">{p.name?.charAt(0)}</span>
                  </div>
                )}
                <span className="text-xs font-bold text-amber-700 truncate">{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
