'use client';

/**
 * "מבנה האימון" — numbered structure blocks (boards R1-prop-intervals /
 * R1-prop-tempo): a numbered circle + rail per step, rows with a colour
 * pill, the text and the pace band; the main set carries a "6 ×" badge.
 */

import { Play, Repeat } from 'lucide-react';
import type { StructureStep } from '../../utils/run-preview/run-structure';

interface RunStructureStepsProps {
  steps: readonly StructureStep[];
  /** Tap on a row whose block has a technique drill (video). */
  onDrillTap?: (blockIndex: number) => void;
}

export default function RunStructureSteps({ steps, onDrillTap }: RunStructureStepsProps) {
  return (
    <ol>
      {steps.map((st, i) => (
        <li key={st.key} className="flex items-stretch gap-2.5">
          <div className="flex w-[26px] shrink-0 flex-col items-center" aria-hidden>
            <span
              className="grid h-[26px] w-[26px] place-items-center rounded-full text-[12.5px] font-black text-white"
              style={{ background: st.color }}
            >
              {i + 1}
            </span>
            {i < steps.length - 1 && (
              <span className="mt-1 w-[3px] flex-1 rounded-full opacity-35" style={{ background: st.color }} />
            )}
          </div>
          <div className="min-w-0 flex-1 pb-3">
            <h4 className="mt-[3px] text-[15px] font-black text-v2-ink">{st.title}</h4>
            {st.repeat && (
              <div className="mb-2 mt-0.5 flex items-center gap-1.5">
                <span
                  className="inline-flex h-7 items-center gap-1 rounded-[10px] px-2.5 text-[15px] font-black text-white"
                  style={{ background: st.color }}
                >
                  <Repeat size={14} strokeWidth={2.6} aria-hidden />
                  <span dir="ltr">{st.repeat} ×</span>
                </span>
                <span className="whitespace-nowrap text-[12.5px] font-extrabold text-v2-ink-2">חזרות</span>
              </div>
            )}
            {st.rows.map((r) => {
              const tappable = r.hasDrill && !!onDrillTap;
              const Row = tappable ? 'button' : 'div';
              return (
                <Row
                  key={r.key}
                  {...(tappable ? { type: 'button' as const, onClick: () => onDrillTap?.(r.blockIndex) } : {})}
                  className={`mt-1.5 flex w-full items-center gap-2.5 rounded-[14px] bg-v2-surface px-2.5 py-2 text-start ${tappable ? 'transition-transform duration-150 ease-v2 active:scale-[0.97]' : ''}`}
                >
                  <span className="h-[30px] w-2 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden />
                  <span className={`min-w-0 flex-1 truncate whitespace-nowrap text-[14px] font-extrabold ${r.isRest ? 'text-v2-ink-2' : 'text-v2-ink'}`}>
                    {r.text}
                  </span>
                  {tappable && <Play size={13} strokeWidth={2.6} className="shrink-0 text-v2-deep" fill="currentColor" aria-label="צפה בסרטון" />}
                  {r.side && (
                    <span
                      dir={r.sideIsPace ? 'ltr' : undefined}
                      className={`shrink-0 whitespace-nowrap text-[13px] font-black ${r.sideIsPace ? 'text-v2-deep' : 'text-v2-muted'}`}
                    >
                      {r.side}
                    </span>
                  )}
                </Row>
              );
            })}
          </div>
        </li>
      ))}
    </ol>
  );
}
