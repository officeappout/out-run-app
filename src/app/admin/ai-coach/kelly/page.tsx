'use client';

export const dynamic = 'force-dynamic';

/**
 * /admin/ai-coach/kelly — "קלי · ממתינים למענה": the team's side of unified Kelly
 * (flag kelly_unified_v1). The queue (threads with needsHuman, newest request first), the
 * full conversation of every source (user, AI, team, system) for context, and a reply box.
 * A reply lands in the user's Kelly conversation as "קלי · צוות OUT" and is pushed to them.
 *
 * Super / root admin only: this gate is UX; the real boundary is requireKellyTeamAdmin on
 * /api/admin/ai-coach/kelly/**.
 */
import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { CheckCircle2, Inbox, Loader2, RefreshCw, Send, ShieldAlert, Sparkles, Users } from 'lucide-react';
import type { KellyAdminMessage, KellyThreadRow } from '@/lib/ai/coach/kelly-admin';
import { NEEDS_HUMAN_REASON_LABEL } from '@/lib/ai/coach/ai-pause';
import { KELLY_TEAM_REPLY_MAX_CHARS, KELLY_TEAM_SENDER_NAME } from '@/lib/ai/coach/unified-thread';

type View = 'queue' | 'recent';

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await auth.currentUser?.getIdToken();
  return fetch(path, {
    ...init,
    headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
  });
}

function when(ms: number): string {
  if (!ms) return '';
  const diff = (Date.now() - ms) / 1000;
  if (diff < 60) return 'עכשיו';
  if (diff < 3600) return `לפני ${Math.floor(diff / 60)} דק׳`;
  if (diff < 86400) return `לפני ${Math.floor(diff / 3600)} שע׳`;
  return new Date(ms).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
}

const GENDER_LABEL: Record<string, string> = { male: 'זכר', female: 'נקבה' };

const SOURCE_LABEL: Record<KellyAdminMessage['source'], string> = {
  user: 'משתמש',
  ai: 'קלי AI',
  human: KELLY_TEAM_SENDER_NAME,
  system: 'הודעת מערכת',
};

function MessageBubble({ m }: { m: KellyAdminMessage }) {
  const mine = m.source === 'user';
  const tone =
    m.source === 'user'
      ? 'bg-white border-slate-200'
      : m.source === 'human'
        ? 'bg-emerald-50 border-emerald-200'
        : m.source === 'system'
          ? 'bg-slate-50 border-slate-200'
          : 'bg-cyan-50 border-cyan-100';
  return (
    <div className={`flex flex-col ${mine ? 'items-start' : 'items-end'}`}>
      <span className="mb-0.5 px-1 text-[11px] font-bold text-slate-500">
        {m.senderName && m.source === 'human' ? m.senderName : SOURCE_LABEL[m.source]} · {when(m.createdAtMs)}
        {m.migrated ? ' · מהצ׳אט הישן' : ''}
      </span>
      <div className={`max-w-[85%] whitespace-pre-line rounded-2xl border px-3.5 py-2.5 text-sm leading-snug text-slate-900 ${tone}`}>
        {m.text || <span className="text-slate-400">(ללא טקסט)</span>}
        {m.cards.length > 0 && (
          <div className="mt-1.5 text-[12px] font-semibold text-cyan-800">
            {m.cards.map((c, i) => (
              <div key={i}>כרטיס אימון: {c.title} · {c.minutes} דק׳</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function KellyTeamQueuePage() {
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [view, setView] = useState<View>('queue');
  const [rows, setRows] = useState<KellyThreadRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [thread, setThread] = useState<{ thread: KellyThreadRow; messages: KellyAdminMessage[] } | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setChecking(false);
        return;
      }
      try {
        const role = await checkUserRole(user.uid);
        setAllowed(role.isSuperAdmin || role.isRootAdmin);
      } catch {
        setAllowed(false);
      }
      setChecking(false);
    });
    return () => unsub();
  }, []);

  const loadList = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/admin/ai-coach/kelly?view=${view}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      setRows(((await res.json()) as { rows: KellyThreadRow[] }).rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינה');
    } finally {
      setLoading(false);
    }
  };

  const loadThread = async (uid: string) => {
    setThreadLoading(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/admin/ai-coach/kelly/thread?uid=${encodeURIComponent(uid)}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      setThread((await res.json()) as { thread: KellyThreadRow; messages: KellyAdminMessage[] });
    } catch (err) {
      setThread(null);
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת השיחה');
    } finally {
      setThreadLoading(false);
    }
  };

  useEffect(() => {
    if (allowed) loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, view]);

  useEffect(() => {
    if (allowed && selected) loadThread(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, selected]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [thread]);

  const act = async (body: Record<string, unknown>, okNotice: string) => {
    if (!selected) return;
    setSending(true);
    setNotice(null);
    setError(null);
    try {
      const res = await authedFetch('/api/admin/ai-coach/kelly/reply', { method: 'POST', body: JSON.stringify({ uid: selected, ...body }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error === 'flag_off' ? 'הדגל kelly_unified_v1 כבוי — אי אפשר לשלוח תשובה עדיין.' : (data.error ?? `HTTP ${res.status}`));
      }
      setNotice(okNotice);
      setReply('');
      await Promise.all([loadThread(selected), loadList()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשליחה');
    } finally {
      setSending(false);
    }
  };

  if (checking) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400" dir="rtl">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (!allowed) {
    return (
      <div className="mx-auto max-w-md py-24 text-center text-slate-600" dir="rtl">
        <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-slate-400" />
        <p className="font-bold">העמוד הזה פתוח לסופר-אדמין בלבד.</p>
      </div>
    );
  }

  const t = thread?.thread;

  return (
    <div className="min-h-screen bg-slate-50 p-4 text-slate-900 md:p-6" dir="rtl" style={{ colorScheme: 'light' }}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900">קלי · ממתינים למענה</h1>
          <p className="text-sm text-slate-500">
            שיחה אחת עם קלי לכל משתמש: AI, הצוות והודעות מערכת. תשובה מכאן מגיעה למשתמש בשם &quot;{KELLY_TEAM_SENDER_NAME}&quot; עם התראה.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            loadList();
            if (selected) loadThread(selected);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> רענון
        </button>
      </div>

      {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {notice && <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</div>}

      <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
        {/* List */}
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex gap-1 border-b border-slate-100 p-2">
            {(['queue', 'recent'] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-bold ${view === v ? 'bg-cyan-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {v === 'queue' ? `ממתינים${view === 'queue' && rows.length ? ` (${rows.length})` : ''}` : 'שיחות אחרונות'}
              </button>
            ))}
          </div>
          <div className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
            {loading && rows.length === 0 && <p className="p-6 text-center text-sm text-slate-400">טוען...</p>}
            {!loading && rows.length === 0 && (
              <div className="p-8 text-center text-sm text-slate-400">
                <Inbox className="mx-auto mb-2 h-6 w-6" />
                {view === 'queue' ? 'אין שיחות שממתינות לצוות' : 'אין שיחות'}
              </div>
            )}
            {rows.map((r) => (
              <button
                key={r.uid}
                type="button"
                onClick={() => setSelected(r.uid)}
                className={`block w-full px-3 py-3 text-right hover:bg-slate-50 ${selected === r.uid ? 'bg-cyan-50' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-black text-slate-900">
                    {r.firstName}
                    {r.ageGroup === 'minor' && <span className="rounded bg-amber-100 px-1.5 text-[10px] font-black text-amber-800">קטין</span>}
                    {r.needsHuman && <span className="rounded bg-rose-100 px-1.5 text-[10px] font-black text-rose-700">ממתין</span>}
                    {r.needsHuman && r.needsHumanReason && (
                      <span className="rounded bg-slate-100 px-1.5 text-[10px] font-black text-slate-600">{NEEDS_HUMAN_REASON_LABEL[r.needsHumanReason]}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-400">{when(r.needsHumanAtMs || r.lastMessageAtMs)}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{r.needsHumanSummary || r.lastMessagePreview || '—'}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Thread */}
        <div className="flex min-h-[60vh] flex-col rounded-2xl border border-slate-200 bg-white">
          {!selected ? (
            <div className="m-auto p-8 text-center text-sm text-slate-400">
              <Users className="mx-auto mb-2 h-6 w-6" />
              בחרו שיחה מהרשימה
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                <div>
                  <div className="flex items-center gap-2 text-base font-black text-slate-900">
                    {t?.firstName ?? '...'}
                    {t?.gender && GENDER_LABEL[t.gender] && (
                      <span className="rounded bg-slate-100 px-1.5 text-[11px] font-bold text-slate-600">{GENDER_LABEL[t.gender]}</span>
                    )}
                    {t?.ageGroup === 'minor' && <span className="rounded bg-amber-100 px-1.5 text-[11px] font-black text-amber-800">קטין</span>}
                  </div>
                  {t?.needsHumanSummary && (
                    <p className="mt-0.5 flex items-start gap-1 text-xs text-slate-500">
                      <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-cyan-500" /> סיכום מקלי AI: {t.needsHumanSummary}
                    </p>
                  )}
                </div>
                {t?.needsHuman && (
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => act({ action: 'resolve' }, 'השיחה הוסרה מהתור.')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" /> טופל בלי תשובה
                  </button>
                )}
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 px-4 py-4" style={{ maxHeight: '60vh' }}>
                {threadLoading && !thread && <p className="py-8 text-center text-sm text-slate-400">טוען שיחה...</p>}
                {thread?.messages.map((m) => <MessageBubble key={m.id} m={m} />)}
                <div ref={bottomRef} />
              </div>

              <div className="border-t border-slate-100 p-3">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value.slice(0, KELLY_TEAM_REPLY_MAX_CHARS))}
                  rows={3}
                  placeholder={`תשובה בשם "${KELLY_TEAM_SENDER_NAME}". כדאי לפנות למשתמש בלשון ${t?.gender === 'female' ? 'נקבה' : t?.gender === 'male' ? 'זכר' : 'ניטרלית'}.`}
                  className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-400"
                />
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">
                    {reply.length}/{KELLY_TEAM_REPLY_MAX_CHARS} · המשתמש יקבל התראה (לפי ההגדרות שלו, שעות שקט ושבת)
                  </span>
                  <button
                    type="button"
                    disabled={sending || !reply.trim()}
                    onClick={() => act({ text: reply }, 'התשובה נשלחה.')}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-black text-white hover:bg-cyan-600 disabled:opacity-50"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} שליחה
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
