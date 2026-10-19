'use client';

/**
 * In-app article page (the website's /learn article, phone-sized): cover, category + read time,
 * title (900), and the body blocks. An `exercises` block shows the library's ExerciseImageCard
 * for each id, opening the same exercise sheet.
 */
import { useEffect, useState } from 'react';
import { ArrowRight, Lightbulb } from 'lucide-react';
import ExerciseImageCard from '@/features/content/exercises/client/components/ExerciseImageCard';
import { useExerciseLibraryStore } from '@/features/content/exercises/client/store/useExerciseLibraryStore';
import { getAllExercisesCached } from '@/features/content/exercises/core/exercise.service';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import type { ArticleBlock, ArticleItem } from '@/lib/content-items/types';
import ArticleCover from './cards/ArticleCover';
import { ArticleMeta } from './cards/ArticleCard';

function ExercisesBlock({ ids }: { ids: string[] }) {
  const [list, setList] = useState<Exercise[]>([]);
  const openDetail = useExerciseLibraryStore((s) => s.openDetail);
  useEffect(() => {
    let alive = true;
    getAllExercisesCached()
      .then((all) => {
        const byId = new Map(all.map((e) => [e.id, e]));
        if (alive) setList(ids.map((id) => byId.get(id)).filter((e): e is Exercise => !!e));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [ids]);
  if (!list.length) return null;
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {list.map((ex) => <ExerciseImageCard key={ex.id} exercise={ex} onClick={() => openDetail(ex)} />)}
    </div>
  );
}

function Block({ b }: { b: ArticleBlock }) {
  switch (b.type) {
    case 'p':
      return <p className="m-0 text-[15.5px] leading-[1.65] text-[#1f2937]">{b.text}</p>;
    case 'h2':
      return <h2 className="m-0 mt-2 text-[19px] font-black leading-tight text-[#0e1419]">{b.text}</h2>;
    case 'list':
      return (
        <ul className="m-0 flex list-disc flex-col gap-1.5 ps-5 text-[15px] leading-[1.6] text-[#1f2937]">
          {b.items.map((x, i) => <li key={i}>{x}</li>)}
        </ul>
      );
    case 'tip':
      return (
        <div className="flex gap-2.5 rounded-2xl bg-[#ecfeff] p-3.5 text-[14.5px] leading-[1.55] text-[#155e75]">
          <Lightbulb size={18} className="mt-0.5 shrink-0" aria-hidden />
          <span>{b.text}</span>
        </div>
      );
    case 'exercises':
      return <ExercisesBlock ids={b.ids} />;
    default:
      return null;
  }
}

export default function ArticleReader({ article, onClose }: { article: ArticleItem; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="article-title" dir="rtl" className="fixed inset-0 z-[56] flex flex-col bg-[#f8fafc]" style={{ colorScheme: 'light' }}>
      <div className="flex items-center gap-3 bg-white/90 px-4 pb-2.5 backdrop-blur" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)' }}>
        <button type="button" onClick={onClose} aria-label="חזרה לחיפוש" className="grid h-10 w-10 place-items-center rounded-full bg-[#f1f5f9] active:scale-95">
          <ArrowRight size={20} className="text-[#374151]" aria-hidden />
        </button>
        <span className="truncate text-[14px] font-bold text-[#6b7280]">מאמר</span>
      </div>
      <article className="flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+28px)] pt-3">
        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[20px]"><ArticleCover cover={article.cover} big /></div>
        <div className="mt-4 flex flex-col gap-2.5">
          <ArticleMeta article={article} />
          <h1 id="article-title" className="m-0 text-[26px] font-black leading-[1.15] text-[#0e1419]">{article.title}</h1>
          <p className="m-0 text-[15.5px] leading-[1.55] text-[#475569]">{article.excerpt}</p>
          <span className="text-[12px] font-bold text-[#94a3b8]">{article.author}</span>
        </div>
        <div className="mt-5 flex flex-col gap-3.5">
          {article.body.map((b, i) => <Block key={i} b={b} />)}
        </div>
      </article>
    </div>
  );
}
