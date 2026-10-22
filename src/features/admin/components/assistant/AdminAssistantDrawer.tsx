'use client';

/**
 * "שאל את OUT" — the admin-panel assistant drawer (docs/admin/ADMIN-AI-ASSISTANT-PLAN.md §9).
 *
 * The input is also the navigation: while typing, matching pages show below it (local fuzzy
 * search, no model, $0). Enter:
 *   one clear page            → navigates (and logs a local-nav count, no text)
 *   2-3 close pages           → "התכוונת ל…" buttons
 *   a data question / nothing → the server (Haiku router → chip / buttons / Sonnet answer)
 * Six quick-answer chips sit under the input (Firestore only, no model).
 *
 * RTL: the sidebar is on the right, so the drawer docks LEFT, 400px on desktop, full screen
 * under 768px. z-[70] — registered in .cursorrules' "Admin panel" z-index table (above the
 * phone sidebar 60 / scrim 55, below the panel's modals 80/81).
 * Rendered only for root / super admins with admin_ai_assistant_v1 on (layout.tsx); the server
 * re-checks both on every request.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2, Send, Sparkles, X } from 'lucide-react';
import { pagesVisibleTo, type AdminAssistantRole } from '@/lib/admin-nav/page-map';
import { decideLocalNav, isDataQuestion, searchAdminPages, SUGGEST_MIN_SCORE } from '@/lib/admin-nav/fuzzy-search';
import { useAdminAssistantStore, type AssistantMessage } from './useAdminAssistantStore';
import { AssistantMessageView } from './AssistantMessageView';
import { applyAssistantEvent } from './assistant-events';
import { QUICK_CHIPS } from './quick-chips';
import { fetchQuickCard, fetchThread, reportLocalNav, sendFeedback, streamQuestion } from './assistant-api';

let seq = 0;
const newId = (p: string) => `${p}-${Date.now()}-${++seq}`;

export function AdminAssistantDrawer({ role }: { role: AdminAssistantRole }) {
  const { open, setOpen, messages, push, patch, busy, setBusy, loadedHistory, setHistory } = useAdminAssistantStore();
  const [input, setInput] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const pages = useMemo(() => pagesVisibleTo(role).filter((p) => p.params.length === 0), [role]);

  const suggestions = useMemo(() => {
    const q = input.trim();
    if (q.length < 2 || isDataQuestion(q)) return [];
    return searchAdminPages(q, pages, 5).filter((s) => s.score >= SUGGEST_MIN_SCORE);
  }, [input, pages]);

  useEffect(() => setActive(0), [input]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    if (!loadedHistory) {
      void fetchThread().then((rows) =>
        setHistory(rows.map((r) => ({ id: r.id, role: r.role, text: r.text, links: r.links ?? [], unverified: r.unverified, auditId: r.auditId ?? null }))),
      );
    }
  }, [open, loadedHistory, setHistory]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  const closeOnMobile = useCallback(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) setOpen(false);
  }, [setOpen]);

  const go = useCallback(
    (href: string) => {
      router.push(href);
      closeOnMobile();
    },
    [router, closeOnMobile],
  );

  const askServer = useCallback(
    async (question: string, localKind: 'data_question' | 'no_match' | 'empty' | 'forced') => {
      const answerId = newId('a');
      push({ id: answerId, role: 'assistant', text: '', links: [], pending: true });
      setBusy(true);
      try {
        await streamQuestion({ question, localKind, currentPath: pathname ?? null }, (ev) => patch(answerId, (m) => applyAssistantEvent(m, ev)));
        patch(answerId, (m) => (m.pending ? { pending: false, running: [] } : {}));
      } catch (err) {
        patch(answerId, { pending: false, running: [], error: err instanceof Error ? err.message : 'העוזר לא זמין כרגע.' });
      } finally {
        setBusy(false);
      }
    },
    [patch, push, setBusy, pathname],
  );

  const submit = useCallback(
    (raw: string) => {
      const question = raw.trim();
      if (!question || busy) return;
      setInput('');
      push({ id: newId('u'), role: 'user', text: question, links: [] });
      const d = decideLocalNav(question, pages);
      if (d.kind === 'go') {
        push({ id: newId('a'), role: 'assistant', text: '', links: [{ href: d.page.href, title: d.page.title, pageId: d.page.id }] });
        reportLocalNav();
        go(d.page.href);
        return;
      }
      if (d.kind === 'did_you_mean') {
        push({ id: newId('a'), role: 'assistant', text: 'התכוונת ל…', links: d.pages.map((p) => ({ href: p.page.href, title: p.page.title, pageId: p.page.id })) });
        reportLocalNav();
        return;
      }
      void askServer(question, d.reason);
    },
    [busy, pages, push, go, askServer],
  );

  const runChip = useCallback(
    async (metric: string, label: string) => {
      if (busy) return;
      push({ id: newId('u'), role: 'user', text: label, links: [] });
      const id = newId('a');
      push({ id, role: 'assistant', text: '', links: [], pending: true });
      try {
        const card = await fetchQuickCard(metric);
        patch(id, { pending: false, card, costUsd: 0 });
      } catch (err) {
        patch(id, { pending: false, error: err instanceof Error ? err.message : 'לא הצלחנו להביא את המספר.' });
      }
    },
    [busy, patch, push],
  );

  const rate = useCallback(
    async (m: AssistantMessage, rating: 'up' | 'down') => {
      if (!m.auditId) return;
      patch(m.id, { rating });
      if (!(await sendFeedback(m.auditId, rating))) patch(m.id, { rating: undefined });
    },
    [patch],
  );

  if (!open) return null;

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-label="שאל את OUT"
      dir="rtl"
      className="fixed inset-0 z-[70] flex flex-col bg-white shadow-2xl md:inset-y-0 md:left-0 md:right-auto md:w-[400px] md:border-r md:border-slate-200"
    >
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900">
          <Sparkles size={16} className="text-cyan-600" aria-hidden /> שאל את OUT
        </h2>
        <button type="button" onClick={() => setOpen(false)} aria-label="סגור" className="rounded p-1.5 text-slate-500 hover:bg-slate-100">
          <X size={18} />
        </button>
      </header>

      <div className="border-b border-slate-100 px-4 pb-3 pt-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (suggestions[active] && input.trim() && !isDataQuestion(input) && active > 0) {
              go(suggestions[active].page.href);
              reportLocalNav();
              setInput('');
              return;
            }
            submit(input);
          }}
          className="relative"
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (!suggestions.length) return;
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, suggestions.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              }
            }}
            placeholder="חיפוש עמוד או שאלה על הנתונים…"
            aria-label="חיפוש עמוד או שאלה"
            className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-[16px] text-slate-900 outline-none focus:border-cyan-500 md:text-[14px]"
            maxLength={1000}
            disabled={busy}
          />
          <button type="submit" aria-label="שלח" disabled={busy || !input.trim()} className="absolute left-1.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-cyan-700 disabled:text-slate-300">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} className="-scale-x-100" />}
          </button>
        </form>

        {suggestions.length > 0 && (
          <ul className="mt-2 overflow-hidden rounded-xl border border-slate-200" role="listbox" aria-label="עמודים מתאימים">
            {suggestions.map((s, i) => (
              <li key={s.page.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => {
                    reportLocalNav();
                    setInput('');
                    go(s.page.href);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-right text-[13px] ${i === active ? 'bg-cyan-50' : 'bg-white'}`}
                >
                  <span className="font-medium text-slate-900">{s.page.title}</span>
                  <span className="text-[11px] text-slate-500">{s.page.sectionLabel ?? ''}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="תשובות מהירות">
          {QUICK_CHIPS.filter((c) => !c.rootOnly || role === 'root').map((c) => (
            <button
              key={c.metric}
              type="button"
              disabled={busy}
              onClick={() => void runChip(c.metric, c.label)}
              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[12px] text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="space-y-2 text-[13px] leading-6 text-slate-500">
            <p>אפשר לחפש עמוד (&quot;איפה טבלת כל הערים&quot;) או לשאול על הנתונים (&quot;כמה ממתינים לאישור?&quot;).</p>
          </div>
        )}
        {messages.map((m) => (
          <AssistantMessageView key={m.id} message={m} onRate={rate} onNavigate={closeOnMobile} />
        ))}
      </div>
      <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">קריאה בלבד · כל מספר מגיע מכלי · שיחות נשמרות 90 יום</p>
    </section>
  );
}
