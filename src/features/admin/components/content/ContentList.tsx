'use client';

import type { ContentItem, ContentType, ContentStatus } from '@/lib/content-items/types';
import { AUDIENCE_LABEL, STATUS_LABEL, TYPE_LABEL } from './content-client';

export interface ListFilter {
  type: ContentType | 'all';
  audience: 'users' | 'authorities' | 'all';
  status: ContentStatus | 'all';
  topic: string;
  text: string;
}

export function applyFilter(items: ContentItem[], f: ListFilter): ContentItem[] {
  const t = f.text.trim().toLowerCase();
  return items.filter((i) =>
    (f.type === 'all' || i.type === f.type) &&
    (f.audience === 'all' || i.audience === f.audience) &&
    (f.status === 'all' || i.status === f.status) &&
    (!f.topic || i.topic === f.topic) &&
    (!t || (i.type === 'article' ? `${i.title} ${i.excerpt}` : `${i.q} ${i.a.join(' ')}`).toLowerCase().includes(t)),
  );
}

const sel = 'h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm';

export function ContentFilters({ value, onChange, topics }: { value: ListFilter; onChange: (f: ListFilter) => void; topics: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input value={value.text} onChange={(e) => onChange({ ...value, text: e.target.value })} placeholder="חיפוש בטקסט" className={`${sel} w-44`} aria-label="חיפוש בטקסט" />
      <select aria-label="סוג" className={sel} value={value.type} onChange={(e) => onChange({ ...value, type: e.target.value as ListFilter['type'] })}>
        <option value="all">כל הסוגים</option>
        {(Object.keys(TYPE_LABEL) as ContentType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
      </select>
      <select aria-label="קהל" className={sel} value={value.audience} onChange={(e) => onChange({ ...value, audience: e.target.value as ListFilter['audience'] })}>
        <option value="all">כל הקהלים</option>
        <option value="users">{AUDIENCE_LABEL.users}</option>
        <option value="authorities">{AUDIENCE_LABEL.authorities}</option>
      </select>
      <select aria-label="נושא" className={sel} value={value.topic} onChange={(e) => onChange({ ...value, topic: e.target.value })}>
        <option value="">כל הנושאים</option>
        {topics.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <select aria-label="סטטוס" className={sel} value={value.status} onChange={(e) => onChange({ ...value, status: e.target.value as ListFilter['status'] })}>
        <option value="all">כל הסטטוסים</option>
        <option value="published">{STATUS_LABEL.published}</option>
        <option value="draft">{STATUS_LABEL.draft}</option>
      </select>
    </div>
  );
}

export default function ContentList({ items, selectedId, onSelect }: { items: ContentItem[]; selectedId: string | null; onSelect: (i: ContentItem) => void }) {
  if (!items.length) return <p className="py-8 text-center text-sm text-gray-500">אין פריטים. אם האוסף ריק — הריצו את scripts/seed-content-items.ts</p>;
  return (
    <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
      {items.map((i) => (
        <li key={i.id}>
          <button type="button" onClick={() => onSelect(i)} className={`flex w-full items-start gap-2 px-3 py-2.5 text-start hover:bg-gray-50 ${selectedId === i.id ? 'bg-cyan-50' : ''}`}>
            <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${i.status === 'published' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{STATUS_LABEL[i.status]}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-gray-900">{i.type === 'article' ? i.title : i.q || '(ללא שאלה)'}</span>
              <span className="block truncate text-xs text-gray-500">{TYPE_LABEL[i.type]} · {AUDIENCE_LABEL[i.audience]} · {i.topic} · {i.locale}{i.updatedBy && i.updatedBy !== 'seed-content-items' ? ' · נערך בניהול' : ''}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
