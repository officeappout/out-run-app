'use client';

import clsx from 'clsx';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import type { ProgressItem } from './quiz-v3-model';

interface QuizProgressRowProps {
  items: ProgressItem[];
  /** lg = transition screen (48px + labels), sm = slider (38px, icons only). */
  size?: 'lg' | 'sm';
  /** A single icon instead of the groups (skill slider, board SliderSkill). */
  single?: { icon: string; label: string };
}

function CheckBadge() {
  return (
    <span className="absolute -top-1 -end-1 grid h-5 w-5 place-items-center rounded-full bg-[#00a99f]" aria-hidden>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
}

/** Push / pull / legs / core: current = blue ring, done = teal + check, upcoming = grey. */
export default function QuizProgressRow({ items, size = 'lg', single }: QuizProgressRowProps) {
  const t = useT(onboarding);
  const lg = size === 'lg';
  const circle = lg ? 'h-12 w-12' : 'h-[38px] w-[38px]';
  const img = lg ? 'w-7' : 'w-[22px]';

  if (single) {
    return (
      <div className="flex justify-center" role="img" aria-label={t('quiz.v3.progress.item', { name: single.label, state: 'current' })}>
        <span className={clsx('grid place-items-center rounded-full bg-white shadow-[0_0_0_2.5px_#00baf7]', circle)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={single.icon} alt="" className="w-[26px]" />
        </span>
      </div>
    );
  }

  return (
    <ol className="flex justify-center gap-3.5" aria-label={t('quiz.v3.progress.aria')} data-quiz-v3-progress>
      {items.map((item) => {
        const name = t('quiz.v3.group.name', { group: item.group });
        return (
          <li
            key={item.group}
            className="flex flex-col items-center gap-1"
            data-state={item.state}
            aria-label={t('quiz.v3.progress.item', { name, state: item.state })}
            aria-current={item.state === 'current' ? 'step' : undefined}
          >
            <span
              className={clsx(
                'relative grid place-items-center rounded-full',
                circle,
                item.state === 'current' && 'bg-white shadow-[0_0_0_2.5px_#00baf7,0_10px_22px_-12px_rgba(0,186,247,0.7)]',
                item.state === 'done' && 'bg-[#e7fbf9] shadow-[0_0_0_2px_#00dcd0]',
                item.state === 'upcoming' && 'bg-[#eef2f5]',
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.icon} alt="" className={clsx(img, item.state === 'upcoming' && 'opacity-45')} />
              {item.state === 'done' && <CheckBadge />}
            </span>
            {lg && (
              <span
                className={clsx(
                  'text-[12px]',
                  item.state === 'upcoming' ? 'font-bold text-v2-muted' : 'text-v2-ink',
                  item.state === 'current' ? 'font-black' : item.state === 'done' && 'font-extrabold',
                )}
                aria-hidden
              >
                {name}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
