'use client';

/**
 * "למה?" (boards S-2c…S-2g footer): the engine's notes on this week, then the few rules the
 * week was built by — short, so the user knows why a drop snapped back.
 */
import { Check, Info } from 'lucide-react';
import { Sheet } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { schedule, type ScheduleKey } from '@/messages/ns/schedule';
import type { WbTrack } from '../types';

const RULES: ReadonlyArray<{ key: ScheduleKey; needs: WbTrack[] }> = [
  { key: 'weekBuilder.rule.recovery', needs: ['strength'] },
  { key: 'weekBuilder.rule.quality', needs: ['run'] },
  { key: 'weekBuilder.rule.longRun', needs: ['run'] },
  { key: 'weekBuilder.rule.order', needs: ['run', 'strength'] },
];

export interface WhySheetProps {
  open: boolean;
  onClose: () => void;
  notesHe: string[];
  tracks: WbTrack[];
}

export default function WhySheet({ open, onClose, notesHe, tracks }: WhySheetProps) {
  const t = useT(schedule);
  const rules = RULES.filter((r) => r.needs.every((n) => tracks.includes(n)));
  return (
    <Sheet open={open} onClose={onClose} title={t('weekBuilder.whySheet.title')} ariaLabel={t('weekBuilder.whySheet.title')}>
      <div dir="rtl" className="flex flex-col gap-3 px-5 pb-6 font-simpler text-v2-ink">
        {notesHe.map((n) => (
          <p key={n} className="flex items-start gap-2 rounded-[14px] bg-v2-tint px-3.5 py-2.5 text-[13.5px] font-bold leading-snug">
            <Info size={16} strokeWidth={2.2} aria-hidden className="mt-0.5 shrink-0 text-v2-deep" />
            <span className="min-w-0">{n}</span>
          </p>
        ))}
        {rules.length > 0 && (
          <section>
            <p className="mb-2 text-[13px] font-extrabold text-v2-muted">{t('weekBuilder.whySheet.rules')}</p>
            <ul className="flex flex-col gap-2">
              {rules.map((r) => (
                <li key={r.key} className="flex items-start gap-2 text-[14px] font-bold leading-snug">
                  <Check size={16} strokeWidth={2.4} aria-hidden className="mt-0.5 shrink-0 text-v2-deep" />
                  <span className="min-w-0">{t(r.key)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Sheet>
  );
}
