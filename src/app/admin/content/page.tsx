'use client';

export const dynamic = 'force-dynamic';

/**
 * /admin/content — "תוכן ושאלות": the ONE source for the website FAQ, the articles and the in-app
 * help (site_content). List / filter, edit Q&A and articles (block editor), publish / unpublish,
 * preview, and the "הצע להוסיף" suggestions from search. Super admin only (the page checks the
 * role for the UX; the real boundary is requireSuperAdminApi on /api/admin/content/**).
 * Published items reach the app and the website through GET /api/content within ~5 minutes.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { Loader2, Plus, ShieldAlert } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import type { ContentInput } from '@/lib/content-items/schema';
import type { ContentItem, ContentType } from '@/lib/content-items/types';
import ContentList, { ContentFilters, applyFilter, type ListFilter } from '@/features/admin/components/content/ContentList';
import ItemEditor from '@/features/admin/components/content/ItemEditor';
import SuggestionsPanel from '@/features/admin/components/content/SuggestionsPanel';
import { contentFetch, newItem, readError, toInput } from '@/features/admin/components/content/content-client';

type Selection = { id: string; input: ContentInput; isNew: boolean } | null;

export default function AdminContentPage() {
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [items, setItems] = useState<ContentItem[] | null>(null);
  const [filter, setFilter] = useState<ListFilter>({ type: 'all', audience: 'all', status: 'all', topic: '', text: '' });
  const [sel, setSel] = useState<Selection>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<'content' | 'suggestions'>('content');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setChecking(false); return; }
      try { setAllowed((await checkUserRole(user.uid)).isSuperAdmin); } catch { setAllowed(false); }
      setChecking(false);
    });
    return () => unsub();
  }, []);

  const load = useCallback(async () => {
    setError(null);
    const res = await contentFetch('/api/admin/content');
    if (!res.ok) { setError(await readError(res)); setItems([]); return; }
    setItems(((await res.json()) as { items: ContentItem[] }).items);
  }, []);
  useEffect(() => { if (allowed) void load(); }, [allowed, load]);

  const shown = useMemo(() => applyFilter(items ?? [], filter), [items, filter]);
  const topics = useMemo(() => Array.from(new Set((items ?? []).map((i) => i.topic))).sort(), [items]);

  const save = async (input: ContentInput) => {
    if (!sel) return;
    setSaving(true); setError(null); setNotice(null);
    const res = await contentFetch(`/api/admin/content/${encodeURIComponent(sel.id)}`, { method: 'PUT', body: JSON.stringify(input) });
    setSaving(false);
    if (!res.ok) { setError(await readError(res)); return; }
    setNotice('נשמר. באפליקציה ובאתר תוך כ־5 דקות.');
    setSel({ id: sel.id, input, isNew: false });
    void load();
  };

  const setStatus = async (status: 'draft' | 'published') => {
    if (!sel) return;
    setSaving(true); setError(null); setNotice(null);
    const res = await contentFetch(`/api/admin/content/${encodeURIComponent(sel.id)}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    setSaving(false);
    if (!res.ok) { setError(await readError(res)); return; }
    setNotice(status === 'published' ? 'פורסם.' : 'הורד מפרסום.');
    setSel({ ...sel, input: { ...sel.input, status } });
    void load();
  };

  const create = (type: ContentType) => {
    const { id, input } = newItem(type);
    setSel({ id, input, isNew: true });
  };

  if (checking) return <div className="grid min-h-[40vh] place-items-center"><Loader2 className="animate-spin text-gray-400" /></div>;
  if (!allowed) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-gray-600" dir="rtl">
        <ShieldAlert /> <p>העמוד הזה למנהלי־על בלבד.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4" dir="rtl">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="m-0 text-xl font-black text-gray-900">תוכן ושאלות</h1>
        <span className="text-sm text-gray-500">שאלות נפוצות לאתר, מאמרים ועזרה באפליקציה — מקור אחד</span>
        <span className="flex-1" />
        <div role="tablist" className="flex rounded-lg bg-gray-100 p-0.5">
          {(['content', 'suggestions'] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1 text-sm font-semibold ${tab === t ? 'bg-white shadow-sm' : 'text-gray-600'}`}>
              {t === 'content' ? 'תוכן' : 'הצעות מהחיפוש'}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="m-0 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {notice && <p className="m-0 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-700">{notice}</p>}

      {tab === 'suggestions' ? <SuggestionsPanel /> : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div className="flex flex-col gap-3">
            <ContentFilters value={filter} onChange={setFilter} topics={topics} />
            <div className="flex flex-wrap gap-1.5">
              {(['faq', 'help', 'article'] as const).map((t) => (
                <button key={t} type="button" onClick={() => create(t)} className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold hover:bg-gray-50">
                  <Plus size={12} /> {t === 'faq' ? 'שאלה לאתר' : t === 'help' ? 'עזרה באפליקציה' : 'מאמר'}
                </button>
              ))}
              <span className="ms-auto self-center text-xs text-gray-500">{items ? `${shown.length} מתוך ${items.length}` : ''}</span>
            </div>
            {items ? <ContentList items={shown} selectedId={sel?.id ?? null} onSelect={(i) => setSel({ id: i.id, input: toInput(i), isNew: false })} /> : <Loader2 className="mx-auto animate-spin text-gray-400" />}
          </div>
          <div>
            {sel ? (
              <ItemEditor id={sel.id} initial={sel.input} isNew={sel.isNew} saving={saving} onSave={save} onStatus={setStatus} />
            ) : (
              <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">בחרו פריט מהרשימה או צרו חדש</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
