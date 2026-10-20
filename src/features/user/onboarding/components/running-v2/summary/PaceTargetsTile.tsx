'use client';

/** "יעדי קצב" (enable_home_v2 plan summary, jr/J2-11) — zones from paceTargetRows. */
import { Card } from '@/components/ui/v2';
import type { PaceTargetRow } from '../../../utils/running-plan-shape';

export default function PaceTargetsTile({ rows }: { rows: PaceTargetRow[] }) {
  return (
    <Card padding="none" className="px-4 pb-1.5 pt-3.5">
      <div className="flex items-baseline justify-between">
        <h2 className="whitespace-nowrap text-[15px] font-black">יעדי קצב</h2>
        <span className="whitespace-nowrap text-[12px] font-extrabold text-v2-muted">מתעדכן לפי הריצות</span>
      </div>
      {rows.map((r, i) => (
        <div key={r.label} className={`flex items-center justify-between gap-3 py-2.5 ${i > 0 ? 'border-t border-v2-hairline' : ''}`}>
          <span className="truncate whitespace-nowrap text-[14px] font-extrabold">{r.label}</span>
          <span className="shrink-0 whitespace-nowrap text-[13.5px] font-black tabular-nums text-v2-ink-2" dir="ltr">
            {r.range} /ק״מ
          </span>
        </div>
      ))}
    </Card>
  );
}
