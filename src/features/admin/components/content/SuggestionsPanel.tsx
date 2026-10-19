'use client';

/** "הצעות מהחיפוש": what users searched, found nothing for, and asked to add. */
import { useCallback, useEffect, useState } from 'react';
import type { ContentSuggestion } from '@/lib/content-items/types';
import { contentFetch, readError } from './content-client';

export default function SuggestionsPanel() {
  const [list, setList] = useState<ContentSuggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    const res = await contentFetch('/api/admin/content/suggestions');
    if (!res.ok) { setError(await readError(res)); setList([]); return; }
    setList(((await res.json()) as { suggestions: ContentSuggestion[] }).suggestions);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const toggle = async (s: ContentSuggestion) => {
    const res = await contentFetch('/api/admin/content/suggestions', { method: 'PATCH', body: JSON.stringify({ id: s.id, handled: s.status !== 'handled' }) });
    if (res.ok) setList((l) => l?.map((x) => (x.id === s.id ? { ...x, status: x.status === 'handled' ? 'new' : 'handled' } : x)) ?? null);
    else setError(await readError(res));
  };

  if (!list) return <p className="text-sm text-gray-500">טוען…</p>;
  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!list.length ? <p className="text-sm text-gray-500">עוד אין הצעות.</p> : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {list.map((s) => (
            <li key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className={`flex-1 ${s.status === 'handled' ? 'text-gray-400 line-through' : 'font-semibold text-gray-900'}`}>״{s.query}״</span>
              <span className="text-xs text-gray-500">{s.category}</span>
              <span className="text-xs text-gray-400">{s.createdAt ? new Date(s.createdAt).toLocaleDateString('he-IL') : ''}</span>
              <button type="button" onClick={() => toggle(s)} className="rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold hover:bg-gray-50">
                {s.status === 'handled' ? 'החזרה' : 'טופל'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
