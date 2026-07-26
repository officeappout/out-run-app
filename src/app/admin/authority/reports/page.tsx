'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  updateDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { getAuthoritiesByManager, getAllAuthorities } from '@/features/admin/services/authority.service';
import { getReportsByAuthority, updateReportStatus } from '@/features/admin/services/maintenance.service';
import { deleteGroup, deleteEvent } from '@/features/admin/services/community.service';
import type { MaintenanceReport, MaintenanceStatus, MaintenanceIssueType } from '@/types/maintenance.types';
import ParkDetailDrawer from '@/features/admin/components/parks/ParkDetailDrawer';
import {
  Flag,
  Trash2,
  CheckCircle2,
  RefreshCw,
  ArrowRight,
  Loader2,
  AlertTriangle,
  Users,
  CalendarHeart,
  Search,
  MessageCircle,
  CalendarCheck,
  X,
  Wrench,
  ShieldAlert,
  Camera,
  MapPin,
  ChevronDown,
  Save,
  Clock,
  CircleDot,
  CheckCircle,
  XCircle,
  FileText,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────

type TabId = 'infrastructure' | 'community';

interface CommunityReport {
  id: string;
  targetId: string;
  targetType: 'group' | 'event';
  targetName: string;
  reporterId: string;
  reason: string;
  status: 'pending' | 'reviewed' | 'dismissed';
  createdAt: any;
}

interface ChatMsg {
  id: string;
  senderName: string;
  text: string;
  sentAt: any;
  type?: string;
}

// ── Constants ─────────────────────────────────────────────────────────

const REASON_LABELS: Record<string, string> = {
  spam: 'ספאם / תוכן מסחרי',
  inappropriate: 'תוכן לא ראוי',
  harassment: 'הטרדה או אלימות',
  misinformation: 'מידע מטעה',
  other: 'אחר',
};

const ISSUE_TYPE_LABELS: Record<MaintenanceIssueType, string> = {
  broken: 'שבור',
  damaged: 'פגום',
  missing: 'חסר',
  unsafe: 'לא בטיחותי',
  other: 'אחר',
};

const ISSUE_TYPE_COLORS: Record<MaintenanceIssueType, string> = {
  broken: 'bg-red-100 text-red-700',
  damaged: 'bg-orange-100 text-orange-700',
  missing: 'bg-violet-100 text-violet-700',
  unsafe: 'bg-rose-100 text-rose-700',
  other: 'bg-slate-100 text-slate-600',
};

const STATUS_CONFIG: Record<MaintenanceStatus, { label: string; color: string; icon: typeof CircleDot }> = {
  reported: { label: 'דווח', color: 'bg-amber-100 text-amber-700', icon: CircleDot },
  in_review: { label: 'בבדיקה', color: 'bg-blue-100 text-blue-700', icon: Search },
  in_progress: { label: 'בטיפול', color: 'bg-cyan-100 text-cyan-700', icon: Clock },
  resolved: { label: 'טופל', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  dismissed: { label: 'נדחה', color: 'bg-slate-100 text-slate-500', icon: XCircle },
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'border-r-4 border-r-red-500',
  high: 'border-r-4 border-r-orange-400',
  medium: 'border-r-4 border-r-amber-300',
  low: 'border-r-4 border-r-slate-200',
};

// ── Helpers ───────────────────────────────────────────────────────────

function formatDate(ts: any): string {
  if (!ts) return '—';
  const d = ts instanceof Date ? ts : typeof ts?.toDate === 'function' ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatMsgTime(ts: any): string {
  if (!ts) return '';
  const d = typeof ts?.toDate === 'function' ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

// ── Page Component ────────────────────────────────────────────────────

export default function ReportsPage() {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabId>('infrastructure');
  const [authorityId, setAuthorityId] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Infrastructure state
  const [infraReports, setInfraReports] = useState<MaintenanceReport[]>([]);
  const [infraLoading, setInfraLoading] = useState(false);
  const [infraFilter, setInfraFilter] = useState<MaintenanceStatus | 'all'>('all');

  // Community state
  const [communityReports, setCommunityReports] = useState<CommunityReport[]>([]);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);


  // Chat modal state
  const [chatModal, setChatModal] = useState<{ targetId: string; targetName: string } | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  // Park Detail Drawer
  const [detailParkId, setDetailParkId] = useState<string | null>(null);

  // ── Auth & Authority resolution ───────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setPageError('יש להתחבר תחילה'); setPageLoading(false); return; }

      try {
        const role = await checkUserRole(user.uid);
        let aId: string | null = role.authorityIds?.[0] || null;
        const isSuper = !!role.isSuperAdmin;
        setIsSuperAdmin(isSuper);

        if (isSuper) {
          const allAuths = await getAllAuthorities(undefined, true);
          const stored = typeof window !== 'undefined'
            ? localStorage.getItem('admin_selected_authority_id') : null;
          const target = (stored && allAuths.find(a => a.id === stored)) ?? allAuths[0];
          if (target) aId = target.id;
        } else {
          const auths = await getAuthoritiesByManager(user.uid);
          if (auths.length > 0) aId = aId ?? auths[0].id;
        }

        if (!aId) { setPageError('לא נמצאה רשות מקושרת'); setPageLoading(false); return; }
        setAuthorityId(aId);
      } catch (err) {
        console.error('[ReportsPage] auth check failed:', err);
        setPageError('שגיאה בטעינת הרשאות');
      } finally {
        setPageLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // ── Load infrastructure reports ────────────────────────────────────
  const loadInfraReports = useCallback(async () => {
    if (!authorityId) return;
    setInfraLoading(true);
    try {
      const reports = await getReportsByAuthority(authorityId);
      setInfraReports(reports);
    } catch (err) {
      console.error('[ReportsPage] infra load failed:', err);
    } finally {
      setInfraLoading(false);
    }
  }, [authorityId]);

  // ── Load community reports ─────────────────────────────────────────
  const loadCommunityReports = useCallback(async () => {
    setCommunityLoading(true);
    try {
      const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setCommunityReports(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CommunityReport)));
    } catch (err) {
      console.error('[ReportsPage] community load failed:', err);
    } finally {
      setCommunityLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authorityId) {
      loadInfraReports();
      loadCommunityReports();
    }
  }, [authorityId, loadInfraReports, loadCommunityReports]);

  // ── Filtered data ──────────────────────────────────────────────────
  const filteredInfraReports = useMemo(() => {
    if (infraFilter === 'all') return infraReports;
    return infraReports.filter(r => r.status === infraFilter);
  }, [infraReports, infraFilter]);

  const pendingCommunity = communityReports.filter(r => r.status === 'pending');
  const reviewedCommunity = communityReports.filter(r => r.status !== 'pending');

  // ── Tab counts ─────────────────────────────────────────────────────
  const infraOpen = infraReports.filter(r => r.status === 'reported' || r.status === 'in_review').length;
  const infraInProgress = infraReports.filter(r => r.status === 'in_progress').length;
  const infraResolved = infraReports.filter(r => r.status === 'resolved').length;

  // ── Community report handlers ──────────────────────────────────────
  const handleDismiss = async (reportId: string) => {
    setActionId(reportId);
    try {
      await updateDoc(doc(db, 'reports', reportId), { status: 'dismissed', reviewedAt: serverTimestamp() });
      setCommunityReports(prev => prev.map(r => r.id === reportId ? { ...r, status: 'dismissed' } : r));
    } catch (err) {
      console.error('[ReportsPage] dismiss failed:', err);
    } finally {
      setActionId(null);
    }
  };

  const handleDeleteContent = async (report: CommunityReport) => {
    if (!confirm(`האם למחוק לצמיתות את "${report.targetName}"?\nפעולה זו אינה ניתנת לביטול.`)) return;
    setActionId(report.id);
    try {
      if (report.targetType === 'group') await deleteGroup(report.targetId);
      else await deleteEvent(report.targetId);
      await Promise.all(
        communityReports.filter(r => r.targetId === report.targetId).map(r => deleteDoc(doc(db, 'reports', r.id)))
      );
      setCommunityReports(prev => prev.filter(r => r.targetId !== report.targetId));
    } catch (err) {
      console.error('[ReportsPage] delete failed:', err);
    } finally {
      setActionId(null);
    }
  };

  const handleInspect = (report: CommunityReport) => {
    router.push(report.targetType === 'group'
      ? `/admin/authority-manager?tab=groups&inspect=${report.targetId}`
      : `/admin/authority-manager?tab=events&inspect=${report.targetId}`);
  };

  const handleViewSessions = (report: CommunityReport) => {
    router.push(`/admin/authority-manager?tab=groups&subtab=sessions&groupId=${report.targetId}`);
  };

  const handleViewChat = async (report: CommunityReport) => {
    setChatModal({ targetId: report.targetId, targetName: report.targetName });
    setChatLoading(true);
    setChatMessages([]);
    try {
      const chatId = `group_${report.targetId}`;
      const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('sentAt', 'desc'), limit(50));
      const snap = await getDocs(q);
      setChatMessages(snap.docs.map(d => ({
        id: d.id, senderName: d.data().senderName ?? 'משתמש', text: d.data().text ?? '',
        sentAt: d.data().sentAt, type: d.data().type,
      })).reverse());
    } catch (err) {
      console.error('[ReportsPage] chat load failed:', err);
    } finally {
      setChatLoading(false);
    }
  };

  // ── Refresh ────────────────────────────────────────────────────────
  const handleRefresh = () => {
    if (activeTab === 'infrastructure') loadInfraReports();
    else loadCommunityReports();
  };

  const isRefreshing = activeTab === 'infrastructure' ? infraLoading : communityLoading;

  // ── Loading / Error ────────────────────────────────────────────────

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

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <Link href="/admin/authority-manager" className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm font-medium mb-2 transition-colors">
            <ArrowRight size={14} />
            חזור לניהול
          </Link>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Flag className="w-6 h-6 text-red-500" />
            תחזוקה וקהילה
          </h1>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold transition-all disabled:opacity-50"
        >
          <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
          רענן
        </button>
      </div>

      {/* ── 2-Tab Switcher ──────────────────────────────────────── */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl mb-6">
        {([
          { id: 'infrastructure' as TabId, label: 'תשתית ותחזוקה', icon: Wrench, count: infraOpen },
          { id: 'community' as TabId, label: 'קהילה ומשתמשים', icon: ShieldAlert, count: pendingCommunity.length },
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-black transition-all ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{tab.label}</span>
            {tab.count > 0 && (
              <span className={`text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center ${
                tab.id === 'community' ? 'bg-red-500 text-white' : 'bg-amber-400 text-white'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ━━━ TAB 1: INFRASTRUCTURE ━━━ */}
      {activeTab === 'infrastructure' && (
        <div>
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-amber-700">{infraOpen}</p>
              <p className="text-[11px] text-amber-500 font-bold">פתוחים</p>
            </div>
            <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-cyan-700">{infraInProgress}</p>
              <p className="text-[11px] text-cyan-500 font-bold">בטיפול</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-emerald-700">{infraResolved}</p>
              <p className="text-[11px] text-emerald-500 font-bold">טופלו</p>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="text-xs text-slate-400 font-bold">סינון:</span>
            {([['all', 'הכל'], ['reported', 'דווח'], ['in_review', 'בבדיקה'], ['in_progress', 'בטיפול'], ['resolved', 'טופל'], ['dismissed', 'נדחה']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setInfraFilter(key)}
                className={`text-[11px] font-bold px-3 py-1.5 rounded-full transition-all ${
                  infraFilter === key ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {label}
                {key !== 'all' && (() => {
                  const count = infraReports.filter(r => r.status === key).length;
                  return count > 0 ? ` (${count})` : '';
                })()}
              </button>
            ))}
          </div>

          {infraLoading && <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>}

          {!infraLoading && filteredInfraReports.length === 0 && (
            <div className="text-center py-16">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <p className="text-lg font-bold text-slate-700">{infraFilter === 'all' ? 'אין דיווחי תשתית' : 'אין דיווחים בסטטוס זה'}</p>
            </div>
          )}

          {!infraLoading && (
            <div className="space-y-3">
              {filteredInfraReports.map(report => (
                <InfraReportCard
                  key={report.id}
                  report={report}
                  onParkClick={(parkId) => setDetailParkId(parkId)}
                  onStatusChange={async (id, status, notes) => {
                    try {
                      await updateReportStatus(id, status, auth.currentUser?.uid, notes);
                      setInfraReports(prev =>
                        prev.map(r => r.id === id ? { ...r, status, notes: notes ?? r.notes, resolvedAt: status === 'resolved' ? new Date() : r.resolvedAt } : r)
                      );
                    } catch (err) {
                      alert('שגיאה בעדכון הסטטוס');
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ━━━ TAB 2: COMMUNITY ━━━ */}
      {activeTab === 'community' && (
        <div>
          {communityLoading && <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>}

          {!communityLoading && communityReports.length === 0 && (
            <div className="text-center py-20">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <p className="text-lg font-bold text-slate-700">אין דיווחים פעילים</p>
              <p className="text-sm text-slate-400 mt-1">הקהילה נקייה</p>
            </div>
          )}

          {pendingCommunity.length > 0 && (
            <section className="mb-8">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                ממתינים לבדיקה ({pendingCommunity.length})
              </h2>
              <div className="space-y-3">
                {pendingCommunity.map(report => (
                  <CommunityReportCard key={report.id} report={report} actionId={actionId}
                    onDismiss={handleDismiss} onDeleteContent={handleDeleteContent}
                    onInspect={handleInspect} onViewChat={handleViewChat} onViewSessions={handleViewSessions} />
                ))}
              </div>
            </section>
          )}

          {reviewedCommunity.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                טופלו ({reviewedCommunity.length})
              </h2>
              <div className="space-y-3">
                {reviewedCommunity.map(report => (
                  <CommunityReportCard key={report.id} report={report} actionId={actionId}
                    onDismiss={handleDismiss} onDeleteContent={handleDeleteContent}
                    onInspect={handleInspect} onViewChat={handleViewChat} onViewSessions={handleViewSessions} dimmed />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── Chat Inspector Modal ─────────────────────────────────── */}
      {chatModal && (
        <>
          <div className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm" onClick={() => setChatModal(null)} />
          <div className="fixed inset-x-4 top-[10%] bottom-[10%] sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[480px] z-[81] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden" dir="rtl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/50">
              <div className="flex items-center gap-2.5">
                <MessageCircle className="w-5 h-5 text-cyan-500" />
                <div>
                  <h3 className="text-sm font-black text-gray-900">צ&apos;אט הקהילה</h3>
                  <p className="text-[11px] text-gray-400">{chatModal.targetName}</p>
                </div>
              </div>
              <button onClick={() => setChatModal(null)} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
                <X size={16} className="text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {chatLoading ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
              ) : chatMessages.length === 0 ? (
                <div className="text-center py-16">
                  <MessageCircle className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400 font-bold">אין הודעות</p>
                </div>
              ) : (
                chatMessages.map(msg => (
                  <div key={msg.id} className="flex gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-[10px] text-white font-black">{msg.senderName?.charAt(0) ?? '?'}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-bold text-gray-800">{msg.senderName}</span>
                        <span className="text-[10px] text-gray-300">{formatMsgTime(msg.sentAt)}</span>
                      </div>
                      <p className={`text-sm text-gray-600 mt-0.5 break-words ${msg.type === 'high_five' ? 'italic text-amber-600' : ''}`}>
                        {msg.type === 'high_five' ? '🙏 High Five!' : msg.text}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 text-center">
              <p className="text-[10px] text-gray-400">מציג עד 50 הודעות אחרונות · לקריאה בלבד</p>
            </div>
          </div>
        </>
      )}

      {/* ── Park Detail Drawer ──────────────────────────────────── */}
      <ParkDetailDrawer
        parkId={detailParkId}
        onClose={() => setDetailParkId(null)}
      />
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── Infrastructure Report Card ────────────────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function InfraReportCard({
  report,
  onStatusChange,
  onParkClick,
}: {
  report: MaintenanceReport;
  onStatusChange: (id: string, status: MaintenanceStatus, notes?: string) => Promise<void>;
  onParkClick: (parkId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<MaintenanceStatus>(report.status);
  const [notes, setNotes] = useState(report.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [photoExpanded, setPhotoExpanded] = useState(false);

  const statusCfg = STATUS_CONFIG[report.status];
  const StatusIcon = statusCfg.icon;
  const isTerminal = report.status === 'resolved' || report.status === 'dismissed';

  const handleSave = async () => {
    if (selectedStatus === report.status && notes === (report.notes ?? '')) return;
    setSaving(true);
    try {
      await onStatusChange(report.id, selectedStatus, notes || undefined);
      setExpanded(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className={`bg-white border rounded-2xl shadow-sm transition-all ${PRIORITY_COLORS[report.priority] ?? ''} ${isTerminal ? 'opacity-60' : ''}`}>
        <div className="p-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
                <Wrench className="w-4 h-4 text-orange-500" />
              </div>
              <div className="min-w-0">
                <button
                  onClick={(e) => { e.stopPropagation(); onParkClick(report.parkId); }}
                  className="text-sm font-black text-slate-900 leading-tight truncate hover:text-cyan-600 transition-colors text-right"
                >
                  {report.parkName || report.parkId.slice(0, 12) + '…'}
                </button>
                {report.equipmentName && <p className="text-[11px] text-slate-400 truncate">{report.equipmentName}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full ${statusCfg.color}`}>
                <StatusIcon className="w-3 h-3" />{statusCfg.label}
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${ISSUE_TYPE_COLORS[report.issueType]}`}>{ISSUE_TYPE_LABELS[report.issueType]}</span>
            <span className="text-[11px] text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" />{formatDate(report.reportedAt)}</span>
            {report.photoUrl && <span className="text-[11px] text-violet-500 font-bold flex items-center gap-1"><Camera className="w-3 h-3" />תמונה</span>}
          </div>
        </div>

        {expanded && (
          <div className="border-t border-slate-100 p-4 space-y-4">
            <div>
              <p className="text-xs font-bold text-slate-400 mb-1">תיאור הבעיה</p>
              <p className="text-sm text-slate-700">{report.description || '—'}</p>
            </div>
            {report.photoUrl && (
              <div>
                <p className="text-xs font-bold text-slate-400 mb-1.5">תמונת נזק</p>
                <div className="relative w-full max-w-xs rounded-xl overflow-hidden border border-slate-200 cursor-pointer group" onClick={() => setPhotoExpanded(true)}>
                  <Image src={report.photoUrl} alt="damage photo" width={320} height={240} className="object-cover w-full h-48 group-hover:scale-105 transition-transform" />
                </div>
              </div>
            )}
            <div className="flex items-center gap-4 text-[11px] text-slate-400">
              <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{report.parkName || report.parkId}</span>
              {report.resolvedAt && <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-500" />טופל: {formatDate(report.resolvedAt)}</span>}
            </div>
            <div className="bg-slate-50 rounded-xl p-4 space-y-3">
              <p className="text-xs font-black text-slate-600 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" />עדכון סטטוס</p>
              <div className="flex items-center gap-2 flex-wrap">
                {(Object.keys(STATUS_CONFIG) as MaintenanceStatus[]).map(s => {
                  const cfg = STATUS_CONFIG[s]; const Icon = cfg.icon;
                  return (
                    <button key={s} onClick={() => setSelectedStatus(s)}
                      className={`inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-full transition-all ${
                        selectedStatus === s ? 'ring-2 ring-offset-1 ring-slate-400 ' + cfg.color : 'bg-white border border-slate-200 text-slate-400 hover:border-slate-300'
                      }`}>
                      <Icon className="w-3 h-3" />{cfg.label}
                    </button>
                  );
                })}
              </div>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="הוסף הערה..." rows={2}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-300 resize-none" />
              <button onClick={handleSave} disabled={saving || (selectedStatus === report.status && notes === (report.notes ?? ''))}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500 text-white text-xs font-black hover:bg-cyan-600 transition-all disabled:opacity-40 active:scale-95">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}שמור שינויים
              </button>
            </div>
          </div>
        )}
      </div>
      {photoExpanded && report.photoUrl && (
        <>
          <div className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm" onClick={() => setPhotoExpanded(false)} />
          <div className="fixed inset-4 z-[91] flex items-center justify-center" onClick={() => setPhotoExpanded(false)}>
            <div className="relative max-w-2xl w-full" onClick={e => e.stopPropagation()}>
              <Image src={report.photoUrl} alt="damage photo full" width={800} height={600} className="rounded-2xl object-contain w-full max-h-[80vh] shadow-2xl" />
              <button onClick={() => setPhotoExpanded(false)} className="absolute top-3 left-3 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center"><X size={16} /></button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── Community Report Card ─────────────────────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function CommunityReportCard({
  report, actionId, onDismiss, onDeleteContent, onInspect, onViewChat, onViewSessions, dimmed = false,
}: {
  report: CommunityReport; actionId: string | null;
  onDismiss: (id: string) => void; onDeleteContent: (r: CommunityReport) => void;
  onInspect: (r: CommunityReport) => void; onViewChat: (r: CommunityReport) => void;
  onViewSessions: (r: CommunityReport) => void; dimmed?: boolean;
}) {
  const isActing = actionId === report.id;
  return (
    <div className={`bg-white border rounded-2xl p-4 shadow-sm transition-opacity ${dimmed ? 'opacity-50' : 'border-red-100'}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          {report.targetType === 'group' ? <Users className="w-4 h-4 text-cyan-500" /> : <CalendarHeart className="w-4 h-4 text-violet-500" />}
          <div>
            <p className="text-sm font-black text-slate-900 leading-tight">{report.targetName}</p>
            <p className="text-[11px] text-slate-400">{report.targetType === 'group' ? 'קבוצה' : 'אירוע'} · {report.targetId.slice(0, 8)}…</p>
          </div>
        </div>
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${report.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
          {report.status === 'pending' ? 'ממתין' : 'טופל'}
        </span>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs bg-red-50 text-red-600 font-bold px-2.5 py-1 rounded-full">{REASON_LABELS[report.reason] ?? report.reason}</span>
        <span className="text-[11px] text-slate-400">{formatDate(report.createdAt)}</span>
      </div>
      <p className="text-[11px] text-slate-400 mb-3">מדווח: <span className="font-mono">{report.reporterId.slice(0, 12)}…</span></p>
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        <button onClick={() => onInspect(report)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-cyan-50 text-cyan-700 text-[11px] font-bold hover:bg-cyan-100 transition-colors"><Search className="w-3 h-3" />צפה בפריט</button>
        {report.targetType === 'group' && (
          <>
            <button onClick={() => onViewChat(report)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-50 text-violet-700 text-[11px] font-bold hover:bg-violet-100 transition-colors"><MessageCircle className="w-3 h-3" />הצג צ&apos;אט</button>
            <button onClick={() => onViewSessions(report)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold hover:bg-emerald-100 transition-colors"><CalendarCheck className="w-3 h-3" />מפגשים</button>
          </>
        )}
      </div>
      {report.status === 'pending' && (
        <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
          <button disabled={!!actionId} onClick={() => onDeleteContent(report)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500 text-white text-xs font-black hover:bg-red-600 disabled:opacity-50 active:scale-95 transition-all">
            {isActing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}מחק פריט
          </button>
          <button disabled={!!actionId} onClick={() => onDismiss(report.id)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 disabled:opacity-50 active:scale-95 transition-all">
            <CheckCircle2 className="w-3.5 h-3.5" />דחה דיווח
          </button>
        </div>
      )}
    </div>
  );
}
