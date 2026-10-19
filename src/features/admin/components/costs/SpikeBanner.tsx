'use client';

import { TrendingUp } from 'lucide-react';
import type { Spike } from '@/lib/costs/aggregate';
import { fmtIls } from './costs-client';

export default function SpikeBanner({ spikes, isCurrentMonth }: { spikes: Spike[]; isCurrentMonth: boolean }) {
  if (spikes.length === 0) return null;
  return (
    <div role="alert" className="flex gap-3 items-start bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3">
      <TrendingUp size={18} className="mt-0.5 shrink-0" aria-hidden />
      <div className="text-sm space-y-0.5">
        <p className="font-bold">קפיצה בעלות {isCurrentMonth ? '(לפי הצפי לסוף החודש)' : ''}</p>
        {spikes.map((s) => (
          <p key={s.key} className="tabular-nums">
            {s.label}: {fmtIls(s.currentIls)} — פי {s.ratio} מהממוצע של 3 החודשים הקודמים ({fmtIls(s.avgIls)})
          </p>
        ))}
      </div>
    </div>
  );
}
