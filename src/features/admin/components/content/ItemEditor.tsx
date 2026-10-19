'use client';

/** Edit one content item (FAQ / help Q&A or an article) + save / publish / unpublish + preview. */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { ContentInput } from '@/lib/content-items/schema';
import { ARTICLE_CATEGORIES, ARTICLE_CATEGORY_LABELS, type ArticleCategory } from '@/lib/content-items/types';
import BlockEditor, { cleanBlocks } from './BlockEditor';
import ContentPreview from './ContentPreview';
import { AUDIENCE_LABEL, TYPE_LABEL } from './content-client';

const inp = 'h-9 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-sm';
const area = 'w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm leading-relaxed';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-bold text-gray-600">
      {label}
      {children}
    </label>
  );
}

interface Props {
  id: string;
  initial: ContentInput;
  isNew: boolean;
  saving: boolean;
  onSave: (input: ContentInput) => void;
  onStatus: (status: 'draft' | 'published') => void;
}

export function cleanInput(v: ContentInput): ContentInput {
  const tags = v.tags.map((t) => t.trim()).filter(Boolean);
  if (v.type === 'article') return { ...v, tags, body: cleanBlocks(v.body) };
  return { ...v, tags, a: v.a.map((p) => p.trim()).filter(Boolean) };
}

export default function ItemEditor({ id, initial, isNew, saving, onSave, onStatus }: Props) {
  const [v, setV] = useState<ContentInput>(initial);
  const [preview, setPreview] = useState(false);
  useEffect(() => setV(initial), [id, initial]);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-bold text-gray-700">{TYPE_LABEL[v.type]}</span>
        <code className="text-[11px] text-gray-400" dir="ltr">{id}</code>
        <span className="flex-1" />
        <button type="button" onClick={() => setPreview((p) => !p)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold hover:bg-gray-50">
          {preview ? 'חזרה לעריכה' : 'תצוגה מקדימה'}
        </button>
        {!isNew && !dirty && (
          <button type="button" disabled={saving} onClick={() => onStatus(v.status === 'published' ? 'draft' : 'published')} className={`rounded-lg px-3 py-1.5 text-sm font-bold ${v.status === 'published' ? 'border border-amber-300 text-amber-700' : 'bg-emerald-600 text-white'} disabled:opacity-50`}>
            {v.status === 'published' ? 'הורדה מפרסום' : 'פרסום'}
          </button>
        )}
        <button type="button" disabled={saving || (!dirty && !isNew)} onClick={() => onSave(cleanInput(v))} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50">
          {saving && <Loader2 size={14} className="animate-spin" />} שמירה
        </button>
      </div>

      {preview ? <ContentPreview input={cleanInput(v)} /> : (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Field label="קהל">
              <select className={inp} value={v.audience} onChange={(e) => setV({ ...v, audience: e.target.value as 'users' | 'authorities' })}>
                <option value="users">{AUDIENCE_LABEL.users}</option>
                <option value="authorities">{AUDIENCE_LABEL.authorities}</option>
              </select>
            </Field>
            <Field label="נושא"><input className={inp} value={v.topic} onChange={(e) => setV({ ...v, topic: e.target.value })} /></Field>
            <Field label="שפה">
              <select className={inp} value={v.locale} onChange={(e) => setV({ ...v, locale: e.target.value as 'he' | 'en' })}>
                <option value="he">עברית</option>
                <option value="en">English</option>
              </select>
            </Field>
            <Field label="סדר"><input type="number" className={inp} value={v.order} onChange={(e) => setV({ ...v, order: Number(e.target.value) || 0 })} /></Field>
          </div>
          <Field label="מילות חיפוש (מופרדות בפסיק)">
            <input className={inp} value={v.tags.join(', ')} onChange={(e) => setV({ ...v, tags: e.target.value.split(',') })} />
          </Field>

          {v.type === 'article' ? (
            <>
              <Field label="כותרת"><input className={inp} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></Field>
              <Field label="תקציר"><textarea className={area} rows={2} value={v.excerpt} onChange={(e) => setV({ ...v, excerpt: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <Field label="קטגוריה">
                  <select className={inp} value={v.category} onChange={(e) => setV({ ...v, category: e.target.value as ArticleCategory, topic: e.target.value })}>
                    {ARTICLE_CATEGORIES.map((c) => <option key={c} value={c}>{ARTICLE_CATEGORY_LABELS[c]}</option>)}
                  </select>
                </Field>
                <Field label="דקות קריאה"><input type="number" min={1} className={inp} value={v.readMin} onChange={(e) => setV({ ...v, readMin: Number(e.target.value) || 1 })} /></Field>
                <Field label="תאריך"><input type="date" className={inp} value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></Field>
                <Field label="כותב/ת"><input className={inp} value={v.author} onChange={(e) => setV({ ...v, author: e.target.value })} /></Field>
              </div>
              <Field label="כריכה: מזהה סרטון מהספרייה (ריק = איור)">
                <div className="flex gap-2">
                  <input
                    className={inp}
                    dir="ltr"
                    value={'video' in v.cover ? v.cover.video : ''}
                    onChange={(e) => setV({ ...v, cover: e.target.value.trim() ? { video: e.target.value.trim() } : { illustration: 'map' } })}
                  />
                  {!('video' in v.cover) && (
                    <select className={inp} value={v.cover.illustration} onChange={(e) => setV({ ...v, cover: { illustration: e.target.value as 'map' | 'nutrition' } })}>
                      <option value="map">איור מפה</option>
                      <option value="nutrition">איור תזונה</option>
                    </select>
                  )}
                </div>
              </Field>
              <div className="text-xs font-bold text-gray-600">גוף המאמר</div>
              <BlockEditor blocks={v.body} onChange={(body) => setV({ ...v, body })} />
            </>
          ) : (
            <>
              <Field label="שאלה"><input className={inp} value={v.q} onChange={(e) => setV({ ...v, q: e.target.value })} /></Field>
              <Field label="תשובה (פסקה בכל שורה ריקה)">
                <textarea className={area} rows={6} value={v.a.join('\n\n')} onChange={(e) => setV({ ...v, a: e.target.value.split(/\n{2,}/) })} />
              </Field>
            </>
          )}
          {isNew && <p className="m-0 text-xs text-gray-500">פריט חדש נשמר כטיוטה. אחרי השמירה אפשר לפרסם.</p>}
        </>
      )}
    </div>
  );
}
