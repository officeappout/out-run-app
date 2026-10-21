'use client';

/**
 * "עזרה" (Help board): the short tour, the "איך משתמשים" chapters (same as the help hub), every
 * app tour (ai_coach_round4),
 * the FAQ ("אותן שאלות כמו באתר") and the help answers; the query filters both.
 */
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { PlayCircle } from 'lucide-react';
import { BrandCard, BRAND_GRADIENT } from '@/components/ui/v2';
import { HELP_CHAPTERS, type HelpChapter } from '@/lib/app-help/chapters';
import { requestTourReplay } from '@/features/user/onboarding/services/tour-replay';
import TourList from '@/features/help/components/TourList';
import QaRow from '../cards/QaRow';
import SectionHead from '../SectionHead';
import { RowSkeleton } from '../Skeletons';
import { rankQa, type ContentCorpus } from '../../providers/content';
import { useT } from '@/hooks/useT';
import { library } from '@/messages/ns/library';

const CHAPTER_DOT = ['#ccfbf1', '#e0f2fe', '#fef9c3', '#c7f3ee', '#f1f5f9', '#ede9fe'];

export default function HelpTab({ query, corpus, toursOn = false }: {
  query: string;
  corpus: ContentCorpus | null;
  /** ai_coach_round4: list every app tour (TourList). Off → today's tab, unchanged. */
  toursOn?: boolean;
}) {
  const t = useT(library);
  const router = useRouter();
  const show = (c: HelpChapter) => {
    if (c.tour) router.push(requestTourReplay(c.tour.id, c.tour.step));
    else if (c.href) router.push(c.href);
  };
  const help = useMemo(() => (corpus ? (query ? rankQa(corpus.help, query, 'help') : corpus.help.map((h) => ({ ...h, key: `help:${h.id}` }))) : []), [corpus, query]);
  const faq = useMemo(() => (corpus ? (query ? rankQa(corpus.faq, query, 'faq') : corpus.faq.map((h) => ({ ...h, key: `faq:${h.id}` }))) : []), [corpus, query]);

  if (!corpus) return <div className="flex flex-col gap-2"><RowSkeleton /><RowSkeleton /><RowSkeleton /></div>;
  return (
    <div className="flex flex-col gap-[18px]">
      {!query && (
        <>
          <BrandCard as="button" radius={18} onClick={() => router.push(requestTourReplay('home', 0))} className="flex items-center gap-3 p-3.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: BRAND_GRADIENT }} aria-hidden>
              <PlayCircle size={20} className="text-[#04222b]" />
            </span>
            <span className="flex flex-col">
              <span className="text-[15px] font-bold text-[#171717]">{t('search.help.tour.title')}</span>
              <span className="text-[12px] text-[#6b7280]">{t('search.help.tour.sub')}</span>
            </span>
          </BrandCard>
          <section aria-labelledby="help-chapters" className="flex flex-col gap-2">
            <SectionHead id="help-chapters" tone="ink" title={t('search.help.chapters')} />
            <div className="grid grid-cols-2 gap-2">
              {HELP_CHAPTERS.map((c, i) => (
                <button key={c.id} type="button" onClick={() => show(c)} disabled={!c.tour && !c.href} className="flex items-center gap-2 rounded-2xl bg-white p-2.5 text-start text-[13px] font-bold text-[#171717] shadow-[0_0_0_1px_rgba(14,27,42,0.06)] active:scale-[0.98] disabled:opacity-70">
                  <span className="h-[26px] w-[26px] shrink-0 rounded-[9px]" style={{ background: CHAPTER_DOT[i % CHAPTER_DOT.length] }} aria-hidden />
                  {c.title}
                </button>
              ))}
            </div>
          </section>
          {toursOn && <TourList title={t('search.help.tours')} headingId="help-tours" />}
        </>
      )}
      {faq.length > 0 && (
        <section aria-labelledby="help-faq" className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h2 id="help-faq" className="m-0 text-[15px] font-bold text-[#171717]">{t('search.help.faq.title')}</h2>
            <span className="text-[12px] text-[#6b7280]">{t('search.help.faq.sub')}</span>
          </div>
          {faq.map((f) => <QaRow key={f.key} q={f.q} a={f.a} query={query} />)}
        </section>
      )}
      {help.length > 0 && (
        <section aria-labelledby="help-answers" className="flex flex-col gap-2">
          <h2 id="help-answers" className="m-0 text-[15px] font-bold text-[#171717]">{t('search.help.answers')}</h2>
          {help.map((h) => <QaRow key={h.key} q={h.q} a={h.a} query={query} />)}
        </section>
      )}
      {query && !faq.length && !help.length && <p className="py-8 text-center text-[14px] text-[#6b7280]">{t('search.help.none')}</p>}
    </div>
  );
}
