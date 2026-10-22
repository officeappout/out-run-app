'use client';

/**
 * "או לספר לקלי מה השתנה" (planner v2, enable_week_builder_v1; board PL2-kelly #3) — Kelly's
 * entry inside "סידור השבוע": a tinted row with a composer-looking field. Tapping anywhere opens
 * the same Kelly chat as the planner's star (KellyWeekLauncher) over the week on screen.
 */
import { Sparkles } from 'lucide-react';
import { BRAND_GRADIENT } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { schedule } from '@/messages/ns/schedule';

export default function TellKellyRow({ onPress }: { onPress: () => void }) {
  const t = useT(schedule);
  return (
    <button
      type="button"
      onClick={onPress}
      className="mb-3 flex w-full flex-col gap-2.5 rounded-[18px] bg-v2-tint p-3 text-start transition-transform duration-150 ease-v2 active:scale-[0.99]"
    >
      <span className="flex items-center gap-2 text-[15px] font-extrabold text-v2-ink">
        <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-v2-ink" style={{ background: BRAND_GRADIENT }}>
          <Sparkles size={14} strokeWidth={2.4} />
        </span>
        {t('planner.tellKelly.title')}
      </span>
      <span className="flex h-[46px] w-full items-center rounded-[14px] bg-white px-3 text-[14px] font-bold text-v2-muted ring-1 ring-inset ring-v2-accent/25">
        {t('planner.tellKelly.placeholder')}
      </span>
    </button>
  );
}
