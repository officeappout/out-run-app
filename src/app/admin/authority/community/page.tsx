'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit as firestoreLimit,
} from 'firebase/firestore';
import { checkUserRole } from '@/features/admin/services/auth.service';
import {
  getAuthoritiesByManager,
  getAllAuthorities,
  getChildrenByParent,
} from '@/features/admin/services/authority.service';
import {
  getEventsByAuthority,
  getGroupsByAuthority,
  getGroupMembers,
} from '@/features/admin/services/community.service';
import type { Authority } from '@/types/admin-types';
import type { CommunityEvent, CommunityGroup, EventRegistration } from '@/types/community.types';
import dynamic_import from 'next/dynamic';
import {
  Loader2,
  AlertTriangle,
  CalendarHeart,
  Users,
  ChevronDown,
  Download,
  Clock,
  UserCheck,
  Search,
  CalendarCheck,
  RefreshCw,
  Star,
  Dumbbell,
  LayoutList,
  CalendarDays,
  ClipboardList,
} from 'lucide-react';

const SessionsDashboard = dynamic_import(
  () => import('@/features/admin/components/authority-manager/SessionsDashboard'),
  { ssr: false, loading: () => <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div> },
);
const CommunityGroups = dynamic_import(
  () => import('@/features/admin/components/authority-manager/CommunityGroups'),
  { ssr: false, loading: () => <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div> },
);
const CommunityEvents = dynamic_import(
  () => import('@/features/admin/components/authority-manager/CommunityEvents'),
  { ssr: false, loading: () => <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div> },
);

// ── Types ─────────────────────────────────────────────────────────────

type HubTab = 'schedule' | 'manage' | 'rsvp';

// ── Helpers ───────────────────────────────────────────────────────────

function getPrivacyName(fullName: string): { firstName: string; lastInitial: string } {
  const parts = (fullName || '').trim().split(/\s+/);
  const firstName = parts[0] || 'ללא שם';
  const lastInitial = parts.length > 1 ? parts[parts.length - 1][0] + '\u05F3' : '';
  return { firstName, lastInitial };
}

function formatDate(d: any): string {
  if (!d) return '—';
  const date = d instanceof Date ? d : typeof d?.toDate === 'function' ? d.toDate() : new Date(d);
  return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTime(t: string | undefined): string {
  return t || '—';
}

function formatJoinedAt(d: any): string {
  if (!d) return '—';
  const date = d instanceof Date ? d : typeof d?.toDate === 'function' ? d.toDate() : new Date(d);
  return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function isPastEvent(event: CommunityEvent): boolean {
  const eventDate = event.date instanceof Date ? event.date : new Date(event.date);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return eventDate < now;
}

const EVENT_CATEGORY_LABELS: Record<string, string> = {
  walking: 'הליכה', running: 'ריצה', yoga: 'יוגה', calisthenics: 'קליסטניקס',
  cycling: 'רכיבה', other: 'אחר', race: 'מרוץ', workshop: 'סדנה', meetup: 'מפגש', competition: 'תחרות',
};

function exportToCSV(
  participants: { firstName: string; lastInitial: string; joinedAt: string }[],
  eventName: string,
) {
  const BOM = '\uFEFF';
  const header = ['#', 'שם פרטי', 'שם משפחה', 'תאריך הרשמה'].join(',');
  const rows = participants.map((p, i) =>
    [i + 1, p.firstName, p.lastInitial, p.joinedAt].join(',')
  );
  const csv = BOM + [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `רשימת_נרשמים_${eventName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ── Page ─────────────────────────────────────────────────────────────

export default function CommunityHubPage() {
  const searchParams = useSearchParams();
  const initialTab = (() => {
    const t = typeof window !== 'undefined' ? searchParams?.get('tab') : null;
    return t && ['schedule', 'manage', 'rsvp'].includes(t) ? t as HubTab : 'schedule';
  })();
  const [activeTab, setActiveTab] = useState<HubTab>(initialTab);
  const [authorityId, setAuthorityId] = useState<string | null>(null);
  const [authority, setAuthority] = useState<Authority | null>(null);
  const [neighborhoods, setNeighborhoods] = useState<{ id: string; name: string }[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  // RSVP tab state
  const [rsvpEvents, setRsvpEvents] = useState<CommunityEvent[]>([]);
  const [rsvpGroups, setRsvpGroups] = useState<CommunityGroup[]>([]);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [rsvpSearchQuery, setRsvpSearchQuery] = useState('');
  const [showPast, setShowPast] = useState(false);

  // ── Auth ────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setPageError('יש להתחבר תחילה'); setPageLoading(false); return; }

      try {
        const role = await checkUserRole(user.uid);
        let aId: string | null = role.authorityIds?.[0] || null;
        let foundAuth: Authority | null = null;

        if (role.isSuperAdmin) {
          const allAuths = await getAllAuthorities(undefined, true);
          const stored = typeof window !== 'undefined'
            ? localStorage.getItem('admin_selected_authority_id') : null;
          const target = (stored && allAuths.find(a => a.id === stored)) ?? allAuths[0];
          if (target) { aId = target.id; foundAuth = target; }
        } else {
          const auths = await getAuthoritiesByManager(user.uid);
          if (auths.length > 0) { aId = aId ?? auths[0].id; foundAuth = auths[0]; }
        }

        if (!aId) { setPageError('לא נמצאה רשות מקושרת'); setPageLoading(false); return; }
        setAuthorityId(aId);
        setAuthority(foundAuth);

        // Load neighborhoods
        try {
          const children = await getChildrenByParent(aId);
          setNeighborhoods(children.map(c => ({ id: c.id, name: typeof c.name === 'string' ? c.name : '' })));
        } catch { /* non-fatal */ }
      } catch (err) {
        console.error('[CommunityHub] auth check failed:', err);
        setPageError('שגיאה בטעינת הרשאות');
      } finally {
        setPageLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // ── Load RSVP data when tab switches ───────────────────────────────
  const loadRsvpData = useCallback(async () => {
    if (!authorityId) return;
    setRsvpLoading(true);
    try {
      const [events, groups] = await Promise.all([
        getEventsByAuthority(authorityId),
        getGroupsByAuthority(authorityId),
      ]);
      setRsvpEvents(events);
      setRsvpGroups(groups);
    } catch (err) {
      console.error('[CommunityHub] RSVP load failed:', err);
    } finally {
      setRsvpLoading(false);
    }
  }, [authorityId]);

  useEffect(() => {
    if (activeTab === 'rsvp' && authorityId && rsvpEvents.length === 0 && rsvpGroups.length === 0) {
      loadRsvpData();
    }
  }, [activeTab, authorityId, loadRsvpData, rsvpEvents.length, rsvpGroups.length]);

  // ── RSVP filtered data ─────────────────────────────────────────────
  const filteredRsvpEvents = useMemo(() => {
    let list = rsvpEvents;
    if (!showPast) list = list.filter(e => !isPastEvent(e));
    if (rsvpSearchQuery.trim()) {
      const q = rsvpSearchQuery.trim().toLowerCase();
      list = list.filter(e =>
        e.name.toLowerCase().includes(q) || e.description?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [rsvpEvents, showPast, rsvpSearchQuery]);

  const filteredRsvpGroups = useMemo(() => {
    if (!rsvpSearchQuery.trim()) return rsvpGroups;
    const q = rsvpSearchQuery.trim().toLowerCase();
    return rsvpGroups.filter(g =>
      g.name.toLowerCase().includes(q) || g.description?.toLowerCase().includes(q)
    );
  }, [rsvpGroups, rsvpSearchQuery]);

  const upcomingCount = rsvpEvents.filter(e => !isPastEvent(e)).length;
  const totalRegs = rsvpEvents.reduce((s, e) => s + (e.currentRegistrations ?? 0), 0);
  const totalMembers = rsvpGroups.reduce((s, g) => s + (g.currentParticipants ?? g.memberCount ?? 0), 0);

  // ── Render ─────────────────────────────────────────────────────────

  if (pageLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (pageError || !authorityId) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <AlertTriangle className="w-10 h-10 text-amber-400" />
        <p className="text-lg font-bold text-slate-700">{pageError || 'שגיאה'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12" dir="rtl">
      {/* ═══ Header ═══ */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-violet-50 rounded-2xl flex items-center justify-center">
            <Users size={24} className="text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900">מרכז קהילה ואירועים</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              לוח זמנים, ניהול קבוצות ואירועים, ורשימות נרשמים — הכל במקום אחד
            </p>
          </div>
        </div>
      </div>

      {/* ═══ Tab Switcher ═══ */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-1.5">
        <div className="flex gap-1">
          {([
            { id: 'schedule' as const, label: 'לו"ז ובקרה',               icon: CalendarDays, color: '#3B82F6' },
            { id: 'manage' as const,   label: 'ניהול קבוצות ואירועים',    icon: LayoutList,   color: '#8B5CF6' },
            { id: 'rsvp' as const,     label: 'נרשמים ו-RSVP',           icon: ClipboardList, color: '#10B981' },
          ]).map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm transition-all ${
                  isActive
                    ? 'text-white shadow-md'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                }`}
                style={{ backgroundColor: isActive ? tab.color : undefined }}
              >
                <tab.icon size={16} />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ━━━ TAB 1: Schedule ━━━ */}
      {activeTab === 'schedule' && (
        <SessionsDashboard authorityId={authorityId} />
      )}

      {/* ━━━ TAB 2: Management ━━━ */}
      {activeTab === 'manage' && (
        <div className="space-y-8">
          {/* Sub-section: Groups */}
          <div>
            <h2 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Dumbbell className="w-4 h-4 text-violet-500" />
              קבוצות אימון
            </h2>
            <CommunityGroups
              authorityId={authorityId}
              authorityCoordinates={authority?.coordinates}
              neighborhoods={neighborhoods}
            />
          </div>

          {/* Sub-section: Events */}
          <div>
            <h2 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <CalendarHeart className="w-4 h-4 text-violet-500" />
              אירועים קהילתיים
            </h2>
            <CommunityEvents
              authorityId={authorityId}
              authorityCoordinates={authority?.coordinates}
              neighborhoods={neighborhoods}
            />
          </div>
        </div>
      )}

      {/* ━━━ TAB 3: RSVP ━━━ */}
      {activeTab === 'rsvp' && (
        <div>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-violet-700">{upcomingCount}</p>
              <p className="text-[11px] text-violet-500 font-bold">אירועים קרובים</p>
            </div>
            <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-cyan-700">{totalRegs}</p>
              <p className="text-[11px] text-cyan-500 font-bold">נרשמים לאירועים</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-emerald-700">{totalMembers}</p>
              <p className="text-[11px] text-emerald-500 font-bold">חברי קבוצות</p>
            </div>
          </div>

          {/* Search + Filter */}
          <div className="flex items-center gap-3 mb-6 flex-wrap">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={rsvpSearchQuery}
                onChange={e => setRsvpSearchQuery(e.target.value)}
                placeholder="חפש אירוע או קבוצה..."
                className="w-full pr-9 pl-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-transparent"
              />
            </div>
            <button
              onClick={() => setShowPast(!showPast)}
              className={`text-xs font-bold px-4 py-2.5 rounded-xl transition-all ${
                showPast ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {showPast ? 'כולל עבר' : 'הצג גם אירועי עבר'}
            </button>
            <button
              onClick={loadRsvpData}
              disabled={rsvpLoading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all disabled:opacity-50"
            >
              <RefreshCw size={14} className={rsvpLoading ? 'animate-spin' : ''} />
              רענן
            </button>
          </div>

          {rsvpLoading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          )}

          {!rsvpLoading && (
            <>
              {/* Events Section */}
              <section className="mb-10">
                <h2 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <CalendarHeart className="w-4 h-4 text-violet-500" />
                  אירועים קהילתיים ({filteredRsvpEvents.length})
                </h2>
                {filteredRsvpEvents.length === 0 ? (
                  <div className="text-center py-12 bg-slate-50 rounded-2xl">
                    <CalendarHeart className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-500">
                      {rsvpSearchQuery ? 'לא נמצאו אירועים תואמים' : 'אין אירועים קרובים'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredRsvpEvents.map(event => (
                      <RsvpEventCard key={event.id} event={event} />
                    ))}
                  </div>
                )}
              </section>

              {/* Groups Section */}
              <section>
                <h2 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Dumbbell className="w-4 h-4 text-cyan-500" />
                  קבוצות אימון ({filteredRsvpGroups.length})
                </h2>
                {filteredRsvpGroups.length === 0 ? (
                  <div className="text-center py-12 bg-slate-50 rounded-2xl">
                    <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-500">
                      {rsvpSearchQuery ? 'לא נמצאו קבוצות תואמות' : 'אין קבוצות אימון'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredRsvpGroups.map(group => (
                      <RsvpGroupCard key={group.id} group={group} />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── RSVP Event Card ──────────────────────────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function RsvpEventCard({ event }: { event: CommunityEvent }) {
  const [expanded, setExpanded] = useState(false);
  const [registrations, setRegistrations] = useState<EventRegistration[]>([]);
  const [regLoading, setRegLoading] = useState(false);
  const [regLoaded, setRegLoaded] = useState(false);

  const past = isPastEvent(event);

  const handleExpand = async () => {
    const willExpand = !expanded;
    setExpanded(willExpand);

    if (willExpand && !regLoaded) {
      setRegLoading(true);
      try {
        const q = query(
          collection(db, 'community_events', event.id, 'registrations'),
          orderBy('joinedAt', 'desc'),
          firestoreLimit(500),
        );
        const snap = await getDocs(q);
        const regs: EventRegistration[] = snap.docs.map(d => {
          const data = d.data();
          return {
            uid: data.uid ?? d.id,
            name: data.name ?? '',
            photoURL: data.photoURL ?? undefined,
            joinedAt: data.joinedAt instanceof Date ? data.joinedAt :
                     typeof data.joinedAt?.toDate === 'function' ? data.joinedAt.toDate() : new Date(),
          };
        });
        setRegistrations(regs);
        setRegLoaded(true);
      } catch (err) {
        console.error('[RsvpEventCard] registration load failed:', err);
      } finally {
        setRegLoading(false);
      }
    }
  };

  const privacyRegs = registrations.map(r => {
    const { firstName, lastInitial } = getPrivacyName(r.name);
    return { ...r, firstName, lastInitial, joinedAtFormatted: formatJoinedAt(r.joinedAt) };
  });

  return (
    <div className={`bg-white border rounded-2xl shadow-sm transition-all ${past ? 'opacity-60' : ''}`}>
      <div className="p-4 cursor-pointer" onClick={handleExpand}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
              event.isOfficial ? 'bg-gradient-to-br from-violet-500 to-purple-600' : 'bg-violet-50'
            }`}>
              <CalendarHeart className={`w-4 h-4 ${event.isOfficial ? 'text-white' : 'text-violet-500'}`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-black text-slate-900 leading-tight truncate">{event.name}</p>
                {event.isOfficial && <Star className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" fill="currentColor" />}
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                {EVENT_CATEGORY_LABELS[event.category] ?? event.category}
                {event.location?.address ? ` · ${event.location.address}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {event.registrationRequired && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-violet-100 text-violet-700">
                <UserCheck className="w-3 h-3" />
                {event.currentRegistrations ?? 0}{event.maxParticipants ? `/${event.maxParticipants}` : ''}
              </span>
            )}
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1"><CalendarCheck className="w-3 h-3" />{formatDate(event.date)}</span>
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatTime(event.startTime)}{event.endTime ? ` – ${event.endTime}` : ''}</span>
          {past && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">הסתיים</span>}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 p-4">
          {regLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : privacyRegs.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-8 h-8 text-slate-200 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-400">אין נרשמים לאירוע זה</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-black text-slate-600 flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5" />רשימת נרשמים ({privacyRegs.length})
                </p>
                <button
                  onClick={e => { e.stopPropagation(); exportToCSV(privacyRegs.map(r => ({ firstName: r.firstName, lastInitial: r.lastInitial, joinedAt: r.joinedAtFormatted })), event.name); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold hover:bg-emerald-100 transition-colors"
                >
                  <Download className="w-3 h-3" />ייצא CSV
                </button>
              </div>
              <RegistrantTable participants={privacyRegs} headerLabel="תאריך הרשמה" />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── RSVP Group Card ──────────────────────────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function RsvpGroupCard({ group }: { group: CommunityGroup }) {
  const [expanded, setExpanded] = useState(false);
  const [members, setMembers] = useState<{ uid: string; name: string; photoURL?: string; joinedAt: Date }[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersLoaded, setMembersLoaded] = useState(false);

  const memberCount = group.currentParticipants ?? group.memberCount ?? 0;

  const handleExpand = async () => {
    const willExpand = !expanded;
    setExpanded(willExpand);
    if (willExpand && !membersLoaded) {
      setMembersLoading(true);
      try {
        const fetched = await getGroupMembers(group.id, 500);
        setMembers(fetched);
        setMembersLoaded(true);
      } catch (err) { console.error('[RsvpGroupCard] members load failed:', err); }
      finally { setMembersLoading(false); }
    }
  };

  const privacyMembers = members.map(m => {
    const { firstName, lastInitial } = getPrivacyName(m.name);
    return { ...m, firstName, lastInitial, joinedAtFormatted: formatJoinedAt(m.joinedAt) };
  });

  const scheduleLabel = (() => {
    const slots = group.scheduleSlots ?? (group.schedule ? [group.schedule] : []);
    if (slots.length === 0) return null;
    const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    return slots.map(s => `יום ${dayNames[s.dayOfWeek] ?? s.dayOfWeek} ${s.time}`).join(' · ');
  })();

  return (
    <div className="bg-white border rounded-2xl shadow-sm transition-all">
      <div className="p-4 cursor-pointer" onClick={handleExpand}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-cyan-50 flex items-center justify-center flex-shrink-0">
              <Dumbbell className="w-4 h-4 text-cyan-500" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-black text-slate-900 leading-tight truncate">{group.name}</p>
                {group.isOfficial && <Star className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" fill="currentColor" />}
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                {EVENT_CATEGORY_LABELS[group.category] ?? group.category}
                {group.meetingLocation?.address ? ` · ${group.meetingLocation.address}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-cyan-100 text-cyan-700">
              <Users className="w-3 h-3" />{memberCount}{group.maxParticipants ? `/${group.maxParticipants}` : ''}
            </span>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
          {scheduleLabel && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{scheduleLabel}</span>}
          {!group.isActive && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">לא פעילה</span>}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 p-4">
          {membersLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : privacyMembers.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-8 h-8 text-slate-200 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-400">אין חברים בקבוצה</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-black text-slate-600 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />חברי הקבוצה ({privacyMembers.length})
                </p>
                <button
                  onClick={e => { e.stopPropagation(); exportToCSV(privacyMembers.map(m => ({ firstName: m.firstName, lastInitial: m.lastInitial, joinedAt: m.joinedAtFormatted })), group.name); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold hover:bg-emerald-100 transition-colors"
                >
                  <Download className="w-3 h-3" />ייצא CSV
                </button>
              </div>
              <RegistrantTable participants={privacyMembers} headerLabel="תאריך הצטרפות" />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── Shared Registrant Table ──────────────────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function RegistrantTable({
  participants,
  headerLabel,
}: {
  participants: { uid: string; firstName: string; lastInitial: string; joinedAtFormatted: string }[];
  headerLabel: string;
}) {
  return (
    <div className="bg-slate-50 rounded-xl overflow-hidden">
      <table className="w-full text-sm" dir="rtl">
        <thead>
          <tr className="text-[11px] text-slate-400 font-bold border-b border-slate-200">
            <th className="text-right py-2 px-3 w-10">#</th>
            <th className="text-right py-2 px-3">שם</th>
            <th className="text-right py-2 px-3">{headerLabel}</th>
          </tr>
        </thead>
        <tbody>
          {participants.map((p, i) => (
            <tr key={p.uid} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-100/50 transition-colors">
              <td className="py-2 px-3 text-[11px] text-slate-400">{i + 1}</td>
              <td className="py-2 px-3">
                <span className="font-bold text-slate-800">{p.firstName}</span>
                {p.lastInitial && <span className="text-slate-400 mr-1">{p.lastInitial}</span>}
              </td>
              <td className="py-2 px-3 text-[11px] text-slate-400">{p.joinedAtFormatted}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
