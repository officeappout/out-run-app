'use client';

import type { ReactNode } from 'react';
import { Dumbbell, Footprints, Home, type LucideIcon } from 'lucide-react';
import { Button, IconTile } from '@/components/ui/v2';
import type { ContinuationKind, ContinuationOption } from './finish-continue.util';

/** What a summary needs to render the G7.1 footer (absent = today's footer). */
export interface FinishContinuation {
  options: ContinuationOption[];
  onSelect: (kind: ContinuationKind) => void;
}

/** Extra peek height the continuation row adds to the collapsed drawer. */
export const FINISH_CONTINUE_EXTRA_PX = 96;

const ICONS: Record<ContinuationKind, LucideIcon> = {
  keep_walking: Footprints,
  park_strength: Dumbbell,
  run_home: Home,
};

interface Props {
  continuation: FinishContinuation;
  onFinish: () => void;
  /** Secondary actions kept beside the finish button (share / delete). */
  leading?: ReactNode;
}

/**
 * G7.1 pinned footer for the post-workout summary drawer: 2–3 "continue"
 * suggestions above one large, explicit "סיים אימון". Lives in the drawer's
 * pinned footer (SummaryDrawerShell) so it shows on every tab and at peek.
 */
export default function FinishAndContinueFooter({ continuation, onFinish, leading }: Props) {
  const { options, onSelect } = continuation;
  return (
    <div className="px-4 pt-3 pb-3" data-finish-continue>
      <div className="mb-2 text-[12px] font-extrabold text-v2-muted">רוצים להמשיך?</div>
      <div
        className="mb-2.5 grid gap-2"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, options.length)}, minmax(0, 1fr))` }}
      >
        {options.map((opt) => (
          <button
            key={opt.kind}
            type="button"
            data-continue-kind={opt.kind}
            onClick={() => onSelect(opt.kind)}
            className="flex min-w-0 flex-col items-center gap-1 rounded-v2-card bg-v2-tint px-2 py-2 text-center active:scale-[0.97] transition-transform duration-200 ease-v2"
          >
            <IconTile icon={ICONS[opt.kind]} tone="accent" size="sm" className="!bg-white" />
            <span className="w-full truncate text-[12px] font-extrabold text-v2-ink">{opt.title}</span>
            <span className="w-full truncate text-[11px] font-semibold text-v2-muted">{opt.subtitle}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2.5">
        {leading}
        <Button variant="primary" size="lg" onClick={onFinish} className="flex-[1.4]" block={!leading}>
          סיים אימון
        </Button>
      </div>
    </div>
  );
}
