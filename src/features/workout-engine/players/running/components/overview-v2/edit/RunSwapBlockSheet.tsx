'use client';

/**
 * "החלף מקטע" (board M-7b, enable_home_v2) — like the strength "החלפת
 * תרגיל": whole main sets (reps + recovery together) grouped easier / same /
 * harder with the strength swap's level marks, each with a mini intensity
 * bar and its time delta or "אותו נפח"; the current one is tagged. One CTA
 * "החלף ל-…". Candidates: run-swap-alternatives.ts.
 */

import { useEffect, useState } from 'react';
import { Repeat2 } from 'lucide-react';
import { Button, LevelCompareIcon, Sheet, SheetHeader, SHEET_Z } from '@/components/ui/v2';
import { swapDeltaText, type SwapAlternative, type SwapGroup, type SwapLevel } from '../../../utils/run-overview/run-swap-alternatives';

const LEVEL_TITLE: Record<SwapLevel, string> = { lower: 'קל יותר', same: 'דומה', higher: 'קשה יותר' };
const WORK = '#e5484d';
const REST = '#dfe7ed';

export function SwapMiniBars({ alt, color = WORK }: { alt: SwapAlternative; color?: string }) {
  return (
    <div aria-hidden className="flex h-6 w-16 shrink-0 items-end gap-px">
      {alt.bars.map((b, i) => (
        <div key={i} className="min-w-[2px] rounded-[3px]"
          style={{ flex: b.flex, height: `${b.height}%`, background: b.tone === 'work' ? color : REST }} />
      ))}
    </div>
  );
}

export interface RunSwapBlockSheetProps {
  open: boolean;
  groups: readonly SwapGroup[];
  /** The main set's work colour (the bars). */
  color?: string;
  onSwap: (key: string) => void;
  onClose: () => void;
}

export default function RunSwapBlockSheet({ open, groups, color, onSwap, onClose }: RunSwapBlockSheetProps) {
  const all = groups.flatMap((g) => g.items);
  const current = all.find((a) => a.current) ?? null;
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => { if (open) setPicked(null); }, [open]);
  const choice = all.find((a) => a.key === picked) ?? null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      zIndex={SHEET_Z.freeRunGoalPanel}
      backdropZIndex={SHEET_Z.freeRunGoal}
      ariaLabel="החלף מקטע"
      closeOnEscape
      className="max-h-[86vh]"
      header={(
        <SheetHeader
          onClose={onClose}
          className="flex items-start justify-between gap-2.5 px-5 pb-1"
          title={(
            <>
              החלף מקטע
              <span className="block truncate whitespace-nowrap text-[13px] font-bold !tracking-normal text-v2-muted">העיקר כולו — חזרות והתאוששות יחד · הקצב נשאר שלך</span>
            </>
          )}
        />
      )}
      bodyClassName="px-5"
      footer={(
        <div className="px-5 pt-3.5">
          <Button variant="cta" block disabled={!choice || choice.current} onClick={() => choice && onSwap(choice.key)}>
            <Repeat2 size={17} strokeWidth={2.4} aria-hidden />
            {choice && !choice.current ? `החלף ל-${choice.title}` : 'החלף'}
          </Button>
        </div>
      )}
    >
      <div dir="rtl" className="pb-1">
        {groups.map((g) => (
          <section key={g.level} aria-label={LEVEL_TITLE[g.level]}>
            <div className="mt-4 flex items-center gap-2">
              <span className="whitespace-nowrap text-[14px] font-black text-v2-ink">{LEVEL_TITLE[g.level]}</span>
              <LevelCompareIcon level={g.level} size={16} />
            </div>
            {g.items.map((a) => {
              const selected = a.key === picked && !a.current;
              return (
                <button key={a.key} type="button" onClick={() => setPicked(a.key)} aria-pressed={selected}
                  className={`mt-2 flex w-full items-center gap-2.5 rounded-2xl bg-white px-3 py-2.5 text-start transition-transform duration-150 ease-v2 active:scale-[0.98] ${
                    selected ? 'shadow-v2-card ring-2 ring-v2-accent' : 'shadow-v2-ring'
                  }`}>
                  <SwapMiniBars alt={a} color={color} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate whitespace-nowrap text-[14px] font-black text-v2-ink">{a.title}</span>
                      {a.current && (
                        <span className="shrink-0 whitespace-nowrap rounded-full bg-v2-surface px-2 py-0.5 text-[11px] font-extrabold text-v2-muted ring-1 ring-inset ring-v2-accent/35">נוכחי</span>
                      )}
                    </span>
                    <span className="block truncate whitespace-nowrap text-[12px] font-bold text-v2-muted">{a.sub}</span>
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-[12px] font-extrabold text-v2-ink-2">{swapDeltaText(a)}</span>
                </button>
              );
            })}
          </section>
        ))}
        {current == null && all.length === 0 && (
          <p className="mt-4 text-[13px] font-bold text-v2-muted">אין חלופות לאימון הזה</p>
        )}
      </div>
    </Sheet>
  );
}
