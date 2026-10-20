'use client';

/**
 * ContinuousRunCardV2 — the white card at the bottom of the v2 continuous
 * player (free run · planned easy / tempo / long): labelled swipe pages
 * (ContinuousPages), the "הבא" strip with the skip pill when there is a
 * next block, and the control row (lap · pause · hold-to-stop).
 * Layout only — the containers feed it.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import { Timer } from 'lucide-react';
import { PlayerControls } from '../../../../shared/v2';
import { clampPage, continuousPages, swipePage, type ContinuousPage } from '../../../lib/continuous-run';
import { rateLabels } from '../../../lib/aerobic-activity';
import { DistancePage, MainPage, PacePage, type ContinuousCardData } from './ContinuousPages';

export interface NextBlockInfo {
  /** "ריצה קלה". */
  label: string;
  /** "35:00" / "5 ק״מ". */
  meta: string;
  color: string;
}

export interface ContinuousRunCardV2Props {
  data: ContinuousCardData;
  next?: NextBlockInfo | null;
  canSkip?: boolean;
  onSkip?: () => void;
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onLap: () => void;
  onStop: () => void;
}

const PAGE_LABEL: Record<ContinuousPage, string> = { main: 'ראשי', pace: 'קצב', distance: 'מרחק' };

function pageLabel(p: ContinuousPage, data: ContinuousCardData): string {
  return p === 'pace' ? rateLabels(data.metric ?? 'pace').page : PAGE_LABEL[p];
}

export default function ContinuousRunCardV2({ data, next, canSkip, onSkip, isPaused, onPause, onResume, onLap, onStop }: ContinuousRunCardV2Props) {
  const pages = continuousPages(data.showLivePace);
  const [rawPage, setPage] = useState(0);
  const page = clampPage(rawPage, pages.length);
  const current = pages[page];

  const [lapToast, setLapToast] = useState(false);
  const lapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (lapTimer.current) clearTimeout(lapTimer.current);
  }, []);
  const handleLap = useCallback(() => {
    onLap();
    setLapToast(true);
    if (lapTimer.current) clearTimeout(lapTimer.current);
    lapTimer.current = setTimeout(() => setLapToast(false), 1600);
  }, [onLap]);

  const onDragEnd = (_: unknown, info: PanInfo) => setPage(swipePage(page, pages.length, info.offset.x, info.velocity.x));

  return (
    <div className="pointer-events-auto flex flex-col items-center" dir="rtl">
      <AnimatePresence>
        {lapToast && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mb-2 inline-flex h-9 items-center gap-1.5 rounded-full bg-v2-ink px-4 text-[13px] font-extrabold text-white"
            role="status"
          >
            <Timer size={14} strokeWidth={2.5} aria-hidden />
            הקפה נרשמה
          </motion.div>
        )}
      </AnimatePresence>

      <div className="w-full rounded-[28px] bg-white px-[18px] pb-3 pt-3 shadow-v2-float">
        {/* Page tabs — the labels double as the page dots. */}
        <div className="mb-1.5 flex justify-center gap-1" role="tablist" aria-label="עמודי הנגן · החליקו לצד">
          {pages.map((p, i) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={page === i}
              onClick={() => setPage(i)}
              className={`h-7 whitespace-nowrap rounded-full px-3 text-[12.5px] font-extrabold transition-colors duration-150 ease-v2 ${
                page === i ? 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40' : 'text-v2-muted'
              }`}
            >
              {pageLabel(p, data)}
            </button>
          ))}
        </div>

        <motion.div
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.15}
          dragDirectionLock
          onDragEnd={onDragEnd}
          style={{ touchAction: 'pan-y' }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={current}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            >
              {current === 'main' && <MainPage d={data} />}
              {current === 'pace' && <PacePage d={data} />}
              {current === 'distance' && <DistancePage d={data} />}
            </motion.div>
          </AnimatePresence>
        </motion.div>

        {next && (
          <div className="mt-3 flex items-center gap-2.5 rounded-[16px] bg-v2-surface px-3 py-2 ring-1 ring-inset ring-v2-hairline">
            <span className="h-8 w-8 shrink-0 rounded-[10px]" style={{ background: next.color }} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block whitespace-nowrap text-[11.5px] font-extrabold text-v2-muted">הבא</span>
              <span className="block truncate whitespace-nowrap text-[14.5px] font-black text-v2-ink">
                {next.meta ? `${next.label} · ${next.meta}` : next.label}
              </span>
            </span>
            {canSkip && onSkip && (
              <button
                type="button"
                onClick={onSkip}
                className="h-11 shrink-0 whitespace-nowrap rounded-full bg-white px-4 text-[13px] font-extrabold text-v2-ink shadow-v2-ring active:scale-[0.97] transition-transform duration-150 ease-v2"
              >
                דלג לבא
              </button>
            )}
          </div>
        )}

        {/* data-coach (inert): the route-player tip's target (enable_entry_whatnow_v1). */}
        <div className="mt-3" data-coach="route-player-controls">
          <PlayerControls isPaused={isPaused} onPause={onPause} onResume={onResume} onLap={handleLap} onStop={onStop} />
        </div>
      </div>
    </div>
  );
}
