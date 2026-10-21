'use client';

/** "יעדי קצב" (enable_home_v2 plan summary, jr/J2-11) — zones from paceTargetRows. */
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import { Card } from '@/components/ui/v2';
import type { PaceTargetRow } from '../../../utils/running-plan-shape';

export default function PaceTargetsTile({ rows }: { rows: PaceTargetRow[] }) {
  const t = useT(onboarding);
  return (
    <Card padding="none" className="px-4 pb-1.5 pt-3.5">
      <div className="flex items-baseline justify-between">
        <h2 className="whitespace-nowrap text-[15px] font-black">{t('signup.runSummary.pace.title')}</h2>
        <span className="whitespace-nowrap text-[12px] font-extrabold text-v2-muted">{t('signup.runSummary.pace.updates')}</span>
      </div>
      {rows.map((r, i) => (
        <div key={r.label} className={`flex items-center justify-between gap-3 py-2.5 ${i > 0 ? 'border-t border-v2-hairline' : ''}`}>
          <span className="truncate whitespace-nowrap text-[14px] font-extrabold">{r.label}</span>
          <span className="shrink-0 whitespace-nowrap text-[13.5px] font-black tabular-nums text-v2-ink-2" dir="ltr">
            {t('signup.runSummary.pace.range', { range: r.range })}
          </span>
        </div>
      ))}
    </Card>
  );
}
