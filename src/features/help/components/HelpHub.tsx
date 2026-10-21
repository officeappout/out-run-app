'use client';

/**
 * "איך משתמשים ושאלות נפוצות" — the help hub (Kelly round 4, flag ai_coach_round4).
 *
 * Chapters replay the app's own first-run tours (tour-replay.ts) or open the right screen; the
 * questions and answers are the SAME entries Kelly answers from (lib/app-help/loader.ts), with
 * the same Hebrew search. Light, RTL, phone-first.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Search, Sparkles } from 'lucide-react';
import { HELP_CHAPTERS, type HelpChapter } from '@/lib/app-help/chapters';
import { loadHelpEntries } from '@/lib/app-help/loader';
import { searchHelp } from '@/lib/app-help/search';
import type { HelpQA } from '@/lib/app-help/types';
import { requestTourReplay } from '@/features/user/onboarding/services/tour-replay';
import HelpChapterCard from './HelpChapterCard';
import HelpQAItem from './HelpQAItem';
import TourList from './TourList';

export default function HelpHub({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [entries, setEntries] = useState<HelpQA[]>([]);
  const [query, setQuery] = useState('');
  const [chapter, setChapter] = useState<HelpChapter['id'] | null>(null);

  useEffect(() => {
    let alive = true;
    void loadHelpEntries().then((e) => alive && setEntries(e));
    return () => {
      alive = false;
    };
  }, []);

  const shown = useMemo(() => {
    if (query.trim().length >= 2) return searchHelp(entries, query);
    if (!chapter) return entries;
    const ids = HELP_CHAPTERS.find((c) => c.id === chapter)?.entryIds ?? [];
    return ids.map((id) => entries.find((e) => e.id === id)).filter((e): e is HelpQA => !!e);
  }, [entries, query, chapter]);

  const show = (c: HelpChapter) => {
    if (c.tour) router.push(requestTourReplay(c.tour.id, c.tour.step));
    else if (c.href) router.push(c.href);
  };

  return (
    <div className="fixed inset-0 z-[56] flex flex-col bg-[#F8FAFC] text-gray-900" style={{ colorScheme: 'light' }} dir="rtl">
      <div className="flex items-center gap-3 border-b border-gray-100 bg-white px-4 pb-3" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
        <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-gray-100 active:bg-gray-200" aria-label="חזור">
          <ArrowRight className="h-5 w-5 text-gray-700" />
        </button>
        <h1 className="flex-1 text-base font-black text-gray-900">איך משתמשים ושאלות נפוצות</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] pt-4">
        <label className="flex h-11 items-center gap-2 rounded-full bg-white px-4 shadow-[0_0_0_1px_rgba(14,27,42,0.08)]">
          <Search className="h-4 w-4 shrink-0 text-v2-muted" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value.slice(0, 80))}
            placeholder="חיפוש: לו״ז, צעדים, פארק..."
            className="min-w-0 flex-1 bg-transparent text-[16px] text-gray-900 outline-none placeholder:text-gray-400"
            style={{ color: '#111827', WebkitTextFillColor: '#111827' }}
            aria-label="חיפוש בשאלות"
          />
        </label>

        {query.trim().length < 2 && (
          <>
            <h2 className="mb-2 mt-5 text-[13px] font-black text-v2-muted">סיור באפליקציה</h2>
            <div className="grid grid-cols-2 gap-2.5">
              {HELP_CHAPTERS.map((c) => (
                <HelpChapterCard
                  key={c.id}
                  chapter={c}
                  selected={chapter === c.id}
                  onSelect={() => setChapter((cur) => (cur === c.id ? null : c.id))}
                  onShow={c.tour || c.href ? () => show(c) : undefined}
                />
              ))}
            </div>
            <div className="mt-5">
              <TourList title="סיורים באפליקציה" />
            </div>
          </>
        )}

        <h2 className="mb-2 mt-5 text-[13px] font-black text-v2-muted">
          {query.trim().length >= 2 ? 'תוצאות' : chapter ? HELP_CHAPTERS.find((c) => c.id === chapter)?.title : 'שאלות נפוצות'}
        </h2>
        <div className="overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgba(14,27,42,0.06)]">
          {shown.map((e) => (
            <HelpQAItem key={e.id} entry={e} defaultOpen={shown.length === 1} />
          ))}
          {shown.length === 0 && entries.length > 0 && (
            <p className="px-4 py-5 text-center text-[13px] font-semibold text-v2-muted">לא מצאנו תשובה. אפשר לשאול את קלי.</p>
          )}
        </div>

        <button
          type="button"
          onClick={() => router.push('/ai-coach')}
          className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-white text-[13.5px] font-extrabold text-v2-deep shadow-[0_0_0_1px_rgba(14,27,42,0.08)] active:scale-[0.98]"
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          לשאול את קלי
        </button>
      </div>
    </div>
  );
}
