'use client';

import { Play } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';

/** v2: "צא לריצה / צא להליכה" for a scheduled solo run — the screen's one gradient CTA. */
export default function StartScheduledRunButton({ activity, onStart }: { activity: 'running' | 'walking' | null; onStart: () => void }) {
  const t = useT(community);
  return (
    <button
      type="button"
      onClick={onStart}
      className="flex h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-v2-cta text-[16px] font-extrabold text-v2-on-cta shadow-v2-cta transition-transform duration-150 ease-v2 active:scale-[0.97]"
    >
      <Play className="h-[18px] w-[18px]" fill="currentColor" />
      {t('group.run.start', { activity: activity ?? '' })}
    </button>
  );
}
