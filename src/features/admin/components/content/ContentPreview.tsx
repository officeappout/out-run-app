'use client';

/** A phone-width preview of the item as the app shows it (light, RTL). */
import type { ContentInput } from '@/lib/content-items/schema';
import { ARTICLE_CATEGORY_LABELS } from '@/lib/content-items/types';
import { BRAND_BORDER_BG, BRAND_TILE_BG } from '@/components/ui/v2';

export default function ContentPreview({ input }: { input: ContentInput }) {
  return (
    <div className="mx-auto w-full max-w-[390px] rounded-[28px] border border-gray-200 bg-[#f8fafc] p-4" dir="rtl" aria-label="תצוגה מקדימה">
      {input.type === 'article' ? (
        <div className="flex flex-col gap-3">
          <div className="aspect-[16/10] w-full rounded-[20px]" style={{ background: BRAND_TILE_BG }} />
          <div className="text-xs font-bold text-[#0369a1]">{ARTICLE_CATEGORY_LABELS[input.category]} · {input.readMin} דק׳ קריאה</div>
          <h3 className="m-0 text-[22px] font-black leading-tight">{input.title || 'כותרת'}</h3>
          <p className="m-0 text-sm text-gray-600">{input.excerpt}</p>
          {input.body.map((b, i) =>
            b.type === 'p' ? <p key={i} className="m-0 text-sm leading-relaxed">{b.text}</p>
              : b.type === 'h2' ? <h4 key={i} className="m-0 text-base font-black">{b.text}</h4>
                : b.type === 'list' ? <ul key={i} className="m-0 list-disc ps-5 text-sm">{b.items.map((x, j) => <li key={j}>{x}</li>)}</ul>
                  : b.type === 'tip' ? <div key={i} className="rounded-xl bg-[#ecfeff] p-2.5 text-sm text-[#155e75]">{b.text}</div>
                    : <div key={i} className="rounded-xl border border-dashed border-cyan-300 p-2 text-xs text-cyan-700">{b.ids.length} כרטיסי תרגיל</div>,
          )}
        </div>
      ) : (
        <div className="rounded-2xl border-[1.5px] border-transparent p-3" style={{ background: BRAND_BORDER_BG }}>
          <div className="text-sm font-bold">{input.q || 'השאלה'}</div>
          {input.a.map((p, i) => <p key={i} className="m-0 mt-2 text-[13px] leading-relaxed text-slate-700">{p}</p>)}
        </div>
      )}
    </div>
  );
}
