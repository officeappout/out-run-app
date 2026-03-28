'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { db } from '@/lib/firebase';
import { deleteGroup, deleteEvent } from '@/features/admin/services/community.service';
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
} from 'lucide-react';

interface Report {
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

const REASON_LABELS: Record<string, string> = {
  spam: 'ספאם / תוכן מסחרי',
  inappropriate: 'תוכן לא ראוי',
  harassment: 'הטרדה או אלימות',
  misinformation: 'מידע מטעה',
  other: 'אחר',
};

function formatDate(ts: any): string {
  if (!ts) return '—';
  const d = typeof ts?.toDate === 'function' ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatMsgTime(ts: any): string {
  if (!ts) return '';
  const d = typeof ts?.toDate === 'function' ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

export default function ReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  // Chat modal state
  const [chatModal, setChatModal] = useState<{ targetId: string; targetName: string } | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Report)));
    } catch (err) {
      console.error('[ReportsPage] load failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadReports(); }, [loadReports]);

  const handleDismiss = async (reportId: string) => {
    setActionId(reportId);
    try {
      await updateDoc(doc(db, 'reports', reportId), {
        status: 'dismissed',
        reviewedAt: serverTimestamp(),
      });
      setReports((prev) =>
        prev.map((r) => r.id === reportId ? { ...r, status: 'dismissed' } : r)
      );
    } catch (err) {
      console.error('[ReportsPage] dismiss failed:', err);
    } finally {
      setActionId(null);
    }
  };

  const handleDeleteContent = async (report: Report) => {
    if (!confirm(`האם למחוק לצמיתות את "${report.targetName}"?\nפעולה זו אינה ניתנת לביטול.`)) return;
    setActionId(report.id);
    try {
      if (report.targetType === 'group') {
        await deleteGroup(report.targetId);
      } else {
        await deleteEvent(report.targetId);
      }
      await Promise.all(
        reports
          .filter((r) => r.targetId === report.targetId)
          .map((r) => deleteDoc(doc(db, 'reports', r.id)))
      );
      setReports((prev) => prev.filter((r) => r.targetId !== report.targetId));
    } catch (err) {
      console.error('[ReportsPage] delete failed:', err);
    } finally {
      setActionId(null);
    }
  };

  const handleInspect = (report: Report) => {
    if (report.targetType === 'group') {
      router.push(`/admin/authority-manager?tab=groups&inspect=${report.targetId}`);
    } else {
      router.push(`/admin/authority-manager?tab=events&inspect=${report.targetId}`);
    }
  };

  const handleViewSessions = (report: Report) => {
    router.push(`/admin/authority-manager?tab=groups&subtab=sessions&groupId=${report.targetId}`);
  };

  const handleViewChat = async (report: Report) => {
    setChatModal({ targetId: report.targetId, targetName: report.targetName });
    setChatLoading(true);
    setChatMessages([]);
    try {
      const chatId = `group_${report.targetId}`;
      const q = query(
        collection(db, 'chats', chatId, 'messages'),
        orderBy('sentAt', 'desc'),
        limit(50),
      );
      const snap = await getDocs(q);
      const msgs: ChatMsg[] = snap.docs.map((d) => ({
        id: d.id,
        senderName: d.data().senderName ?? 'משתמש',
        text: d.data().text ?? '',
        sentAt: d.data().sentAt,
        type: d.data().type,
      })).reverse();
      setChatMessages(msgs);
    } catch (err) {
      console.error('[ReportsPage] chat load failed:', err);
    } finally {
      setChatLoading(false);
    }
  };

  const pendingReports = reports.filter((r) => r.status === 'pending');
  const reviewedReports = reports.filter((r) => r.status !== 'pending');

  return (
    <div className="max-w-3xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <Link
            href="/admin/authority-manager"
            className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm font-medium mb-2 transition-colors"
          >
            <ArrowRight size={14} />
            חזור לניהול
          </Link>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Flag className="w-6 h-6 text-red-500" />
            ניהול דיווחים
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {pendingReports.length} דיווחים ממתינים לבדיקה
          </p>
        </div>
        <button
          onClick={loadReports}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold transition-all disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          רענן
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      )}

      {!loading && reports.length === 0 && (
        <div className="text-center py-20">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
          <p className="text-lg font-bold text-slate-700">אין דיווחים פעילים</p>
          <p className="text-sm text-slate-400 mt-1">הקהילה נקייה</p>
        </div>
      )}

      {/* Pending reports */}
      {pendingReports.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            ממתינים לבדיקה ({pendingReports.length})
          </h2>
          <div className="space-y-3">
            {pendingReports.map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                actionId={actionId}
                onDismiss={handleDismiss}
                onDeleteContent={handleDeleteContent}
                onInspect={handleInspect}
                onViewChat={handleViewChat}
                onViewSessions={handleViewSessions}
              />
            ))}
          </div>
        </section>
      )}

      {/* Reviewed / dismissed */}
      {reviewedReports.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            טופלו ({reviewedReports.length})
          </h2>
          <div className="space-y-3">
            {reviewedReports.map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                actionId={actionId}
                onDismiss={handleDismiss}
                onDeleteContent={handleDeleteContent}
                onInspect={handleInspect}
                onViewChat={handleViewChat}
                onViewSessions={handleViewSessions}
                dimmed
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Chat Inspector Modal ─────────────────────────────────── */}
      {chatModal && (
        <>
          <div
            className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm"
            onClick={() => setChatModal(null)}
          />
          <div className="fixed inset-x-4 top-[10%] bottom-[10%] sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[480px] z-[81] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden" dir="rtl">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/50">
              <div className="flex items-center gap-2.5">
                <MessageCircle className="w-5 h-5 text-cyan-500" />
                <div>
                  <h3 className="text-sm font-black text-gray-900">צ&apos;אט הקהילה</h3>
                  <p className="text-[11px] text-gray-400">{chatModal.targetName}</p>
                </div>
              </div>
              <button
                onClick={() => setChatModal(null)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
              >
                <X size={16} className="text-gray-500" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {chatLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
                </div>
              ) : chatMessages.length === 0 ? (
                <div className="text-center py-16">
                  <MessageCircle className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400 font-bold">אין הודעות בצ&apos;אט</p>
                  <p className="text-xs text-gray-300 mt-1">ייתכן שהצ&apos;אט טרם הופעל או שאין הודעות</p>
                </div>
              ) : (
                chatMessages.map((msg) => (
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

            {/* Modal footer */}
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 text-center">
              <p className="text-[10px] text-gray-400">מציג עד 50 הודעות אחרונות · לקריאה בלבד</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── ReportCard sub-component ──────────────────────────────────────────────────

function ReportCard({
  report,
  actionId,
  onDismiss,
  onDeleteContent,
  onInspect,
  onViewChat,
  onViewSessions,
  dimmed = false,
}: {
  report: Report;
  actionId: string | null;
  onDismiss: (id: string) => void;
  onDeleteContent: (r: Report) => void;
  onInspect: (r: Report) => void;
  onViewChat: (r: Report) => void;
  onViewSessions: (r: Report) => void;
  dimmed?: boolean;
}) {
  const isActing = actionId === report.id;

  return (
    <div className={`bg-white border rounded-2xl p-4 shadow-sm transition-opacity ${dimmed ? 'opacity-50' : 'border-red-100'}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          {report.targetType === 'group'
            ? <Users className="w-4 h-4 text-cyan-500 flex-shrink-0" />
            : <CalendarHeart className="w-4 h-4 text-violet-500 flex-shrink-0" />
          }
          <div>
            <p className="text-sm font-black text-slate-900 leading-tight">{report.targetName}</p>
            <p className="text-[11px] text-slate-400">
              {report.targetType === 'group' ? 'קבוצה' : 'אירוע'} · מזהה: {report.targetId.slice(0, 8)}…
            </p>
          </div>
        </div>
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${
          report.status === 'pending'
            ? 'bg-amber-100 text-amber-700'
            : 'bg-slate-100 text-slate-500'
        }`}>
          {report.status === 'pending' ? 'ממתין' : 'טופל'}
        </span>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs bg-red-50 text-red-600 font-bold px-2.5 py-1 rounded-full">
          {REASON_LABELS[report.reason] ?? report.reason}
        </span>
        <span className="text-[11px] text-slate-400">{formatDate(report.createdAt)}</span>
      </div>

      <p className="text-[11px] text-slate-400 mb-3">
        מדווח: <span className="font-mono">{report.reporterId.slice(0, 12)}…</span>
      </p>

      {/* ── Inspector Actions ─────────────────────────────────── */}
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        <button
          onClick={() => onInspect(report)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-cyan-50 text-cyan-700 text-[11px] font-bold hover:bg-cyan-100 transition-colors"
        >
          <Search className="w-3 h-3" />
          צפה בפריט
        </button>
        {report.targetType === 'group' && (
          <>
            <button
              onClick={() => onViewChat(report)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-50 text-violet-700 text-[11px] font-bold hover:bg-violet-100 transition-colors"
            >
              <MessageCircle className="w-3 h-3" />
              הצג צ&apos;אט
            </button>
            <button
              onClick={() => onViewSessions(report)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold hover:bg-emerald-100 transition-colors"
            >
              <CalendarCheck className="w-3 h-3" />
              מפגשים
            </button>
          </>
        )}
      </div>

      {/* ── Moderation Actions ────────────────────────────────── */}
      {report.status === 'pending' && (
        <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
          <button
            disabled={!!actionId}
            onClick={() => onDeleteContent(report)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500 text-white text-xs font-black hover:bg-red-600 transition-all disabled:opacity-50 active:scale-95"
          >
            {isActing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            מחק פריט מדווח
          </button>
          <button
            disabled={!!actionId}
            onClick={() => onDismiss(report.id)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 transition-all disabled:opacity-50 active:scale-95"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            דחה דיווח
          </button>
        </div>
      )}
    </div>
  );
}
