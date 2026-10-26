'use client';

/**
 * The welcome screen's push ladder: push-ups at 45° (push 2) → push-ups (push 5) → decline push-ups
 * (push 10). Each tile shows the exercise's still; the videos play one after another, easy to hard.
 * Reduced motion: stills only, the middle tile highlighted (as on the board).
 */
import { useCallback, useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import { Card } from '@/components/ui/v2';
import {
  LADDER_CLIP_MAX_MS,
  LADDER_STATIC_INDEX,
  LADDER_STILL_MS,
  PUSH_LADDER,
  nextLadderIndex,
  type LadderTone,
} from './quiz-v3-entry';
import { usePushLadderMedia } from './usePushLadderMedia';

const CHIP_TONE: Record<LadderTone, string> = {
  easy: 'bg-[#e3f7ec] text-[#0b6b45]',
  mid: 'bg-v2-tint text-v2-deep',
  hard: 'bg-[#fff1db] text-[#8a4b00]',
};

export default function PushLadderCard() {
  const t = useT(onboarding);
  const reduce = useReducedMotion();
  const media = usePushLadderMedia();
  const [active, setActive] = useState(0);
  const advance = useCallback(() => setActive((i) => nextLadderIndex(i, PUSH_LADDER.length)), []);

  const activeItem = PUSH_LADDER[active];
  const activeVideo = media[activeItem.exerciseId]?.videoUrl ?? null;
  const loaded = Object.keys(media).length > 0;

  // Hand-over safety net: a tile without a video, or a clip that never ends, still moves on.
  useEffect(() => {
    if (reduce || !loaded) return;
    const timer = setTimeout(advance, activeVideo ? LADDER_CLIP_MAX_MS : LADDER_STILL_MS);
    return () => clearTimeout(timer);
  }, [reduce, loaded, active, activeVideo, advance]);

  const highlighted = reduce ? LADDER_STATIC_INDEX : active;

  return (
    <Card padding="none" className="rounded-v2-card-lg p-3.5 flex flex-col gap-2.5">
      <ol className="grid grid-cols-3 gap-2 text-center list-none m-0 p-0" aria-label={t('quizV3.welcome.ladder.label')}>
        {PUSH_LADDER.map((item, i) => {
          const m = media[item.exerciseId];
          const playing = !reduce && i === active && !!m?.videoUrl;
          return (
            <li key={item.exerciseId} className="flex flex-col items-center gap-1.5 min-w-0">
              <span
                className={`relative w-full aspect-[3/4] rounded-2xl bg-v2-pill-border overflow-hidden transition-shadow duration-300 ${
                  i === highlighted ? 'ring-[2.5px] ring-v2-accent' : ''
                }`}
              >
                {m?.imageUrl && (
                  <img src={m.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                )}
                {playing && (
                  <video
                    key={m.videoUrl!}
                    src={m.videoUrl!}
                    poster={m.imageUrl ?? undefined}
                    className="absolute inset-0 w-full h-full object-cover"
                    autoPlay
                    muted
                    playsInline
                    preload="auto"
                    onEnded={advance}
                    onError={advance}
                    aria-hidden="true"
                  />
                )}
              </span>
              <span className="text-[12.5px] leading-[17px] font-extrabold">{t(item.nameKey)}</span>
              <span className={`text-[11.5px] font-bold rounded-full px-2 py-0.5 ${CHIP_TONE[item.tone]}`}>
                {t('quizV3.welcome.ladder.chip', { level: String(item.level) })}
              </span>
            </li>
          );
        })}
      </ol>

      <span className="self-center flex items-center gap-1.5 bg-v2-surface rounded-full px-2.5 py-1 text-[12px] font-extrabold text-v2-ink-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
        </svg>
        {t('quizV3.welcome.ladder.homeAndPark')}
      </span>

      <div className="flex items-center gap-1.5" aria-hidden="true">
        <span className="text-[11.5px] font-extrabold text-[#0b6b45]">{t('quizV3.welcome.ladder.easy')}</span>
        <span className="flex-1 h-1 rounded-full bg-gradient-to-r ltr:bg-gradient-to-l from-v2-amber via-v2-accent to-v2-up" />
        <span className="text-[11.5px] font-extrabold text-[#8a4b00]">{t('quizV3.welcome.ladder.hard')}</span>
      </div>
    </Card>
  );
}
