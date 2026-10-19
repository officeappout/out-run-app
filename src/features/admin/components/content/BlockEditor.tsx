'use client';

/** Article body blocks: p · h2 · list · tip · exercises (ids). Add / edit / reorder / delete. */
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import type { ArticleBlock } from '@/lib/content-items/types';

const LABEL: Record<ArticleBlock['type'], string> = { p: 'פסקה', h2: 'כותרת', list: 'רשימה', tip: 'טיפ', exercises: 'תרגילים (מזהים)' };

function emptyBlock(type: ArticleBlock['type']): ArticleBlock {
  if (type === 'list') return { type, items: [''] };
  if (type === 'exercises') return { type, ids: [] };
  return { type, text: '' };
}

const area = 'w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm leading-relaxed';

export default function BlockEditor({ blocks, onChange }: { blocks: ArticleBlock[]; onChange: (b: ArticleBlock[]) => void }) {
  const set = (i: number, b: ArticleBlock) => onChange(blocks.map((x, j) => (j === i ? b : x)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-2">
      {blocks.map((b, i) => (
        <div key={i} className="rounded-xl border border-gray-200 bg-gray-50 p-2.5">
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="text-xs font-bold text-gray-600">{LABEL[b.type]}</span>
            <span className="flex-1" />
            <button type="button" aria-label="הזזה למעלה" onClick={() => move(i, -1)} className="rounded p-1 hover:bg-gray-200"><ArrowUp size={14} /></button>
            <button type="button" aria-label="הזזה למטה" onClick={() => move(i, 1)} className="rounded p-1 hover:bg-gray-200"><ArrowDown size={14} /></button>
            <button type="button" aria-label="מחיקת הבלוק" onClick={() => onChange(blocks.filter((_, j) => j !== i))} className="rounded p-1 text-red-600 hover:bg-red-50"><Trash2 size={14} /></button>
          </div>
          {b.type === 'list' ? (
            <textarea className={area} rows={Math.max(3, b.items.length)} value={b.items.join('\n')} onChange={(e) => set(i, { type: 'list', items: e.target.value.split('\n') })} placeholder="פריט בכל שורה" aria-label="פריטי הרשימה" />
          ) : b.type === 'exercises' ? (
            <input className={area} value={b.ids.join(', ')} onChange={(e) => set(i, { type: 'exercises', ids: e.target.value.split(/[\s,]+/).filter(Boolean) })} placeholder="מזהי תרגילים, מופרדים בפסיק" aria-label="מזהי תרגילים" dir="ltr" />
          ) : (
            <textarea className={area} rows={b.type === 'h2' ? 1 : 3} value={b.text} onChange={(e) => set(i, { ...b, text: e.target.value })} aria-label={LABEL[b.type]} />
          )}
        </div>
      ))}
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(LABEL) as ArticleBlock['type'][]).map((t) => (
          <button key={t} type="button" onClick={() => onChange([...blocks, emptyBlock(t)])} className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold hover:bg-gray-50">
            + {LABEL[t]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Drop empty list lines / empty text before saving. */
export function cleanBlocks(blocks: ArticleBlock[]): ArticleBlock[] {
  return blocks
    .map((b) => (b.type === 'list' ? { ...b, items: b.items.map((x) => x.trim()).filter(Boolean) } : b))
    .filter((b) => (b.type === 'list' ? b.items.length > 0 : b.type === 'exercises' ? b.ids.length > 0 : b.text.trim().length > 0));
}
