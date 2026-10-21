'use client';

/**
 * PlannedSessionListV2 — the layer BEHIND the v2 planned-run player (board
 * F-1e), revealed by dragging the player down or tapping the cart icon. Not
 * a sheet: the whole session as sections (warm-up · main set · cool-down);
 * in the main set every rep is a row with its result box (time, target,
 * in-range / slow by N s, avg pace). Upcoming rows can be jumped to.
 */

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, Check, ChevronDown } from 'lucide-react';
import type { RunBlock } from '../../../types/run-block.type';
import {
  V2_BLOCK_COLORS,
  blockDisplayLabel,
  fmtBand,
  fmtClock,
  fmtDistance,
  fmtPace,
  isRestBlock,
  isShortLeg,
  isWorkBlock,
  paceClassText,
  planSections,
  recordClass,
  repSummary,
  v2BlockColor,
  type PlannedBlockRecord,
  type TargetResolver,
} from '../../../lib/planned-rep-results';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';

interface Props {
  title: string;
  blocks: RunBlock[];
  currentBlockIndex: number;
  records: Map<number, PlannedBlockRecord>;
  reps: { byIndex: Map<number, number>; total: number };
  resolveTarget: TargetResolver;
  showNumbers: boolean;
  /** Remaining of the current block ("0:54" / "212 מ׳"). */
  currentRemaining: string;
  totals: { durationSec: number; distanceKm: number };
  onJumpToBlock: (index: number) => void;
  onClose: () => void;
}

const OFF = { fg: '#f59e0b', text: '#b45309' };
const IN = { fg: '#10b981', text: '#047857' };

export default function PlannedSessionListV2({
  title,
  blocks,
  currentBlockIndex,
  records,
  reps,
  resolveTarget,
  showNumbers,
  currentRemaining,
  totals,
  onJumpToBlock,
  onClose,
}: Props) {
  const t = useT(player);
  const [jumpTarget, setJumpTarget] = useState<number | null>(null);
  const sections = planSections(blocks);
  const current = blocks[currentBlockIndex] ?? null;
  // During a recovery inside the main set, the NEXT rep row carries the countdown.
  const focusIndex =
    current && isRestBlock(current) && sections.main.includes(currentBlockIndex)
      ? sections.main.find((i) => i > currentBlockIndex && isWorkBlock(blocks[i])) ?? currentBlockIndex
      : currentBlockIndex;
  const hasReps = reps.total > 0;

  const repRecords = Array.from(records.values()).filter((r) => r.rep > 0);
  const summary = repSummary(repRecords);
  const recoveries = sections.main.map((i) => blocks[i]).filter((b) => isRestBlock(b));
  const sameRest =
    recoveries.length > 0 && recoveries.every((b) => b.durationSeconds && b.durationSeconds === recoveries[0].durationSeconds)
      ? recoveries[0].durationSeconds ?? 0
      : 0;

  const avgPaceSec = totals.distanceKm > 0.05 ? totals.durationSec / totals.distanceKm : 0;

  const row = (i: number) => {
    const b = blocks[i];
    const rep = reps.byIndex.get(i) ?? 0;
    const isRep = rep > 0 && reps.total > 1;
    const done = i < currentBlockIndex;
    const isFocus = i === focusIndex;
    const upcoming = i > currentBlockIndex && !isFocus;
    const rec = records.get(i);
    const c = rec ? recordClass(rec) : null;
    const color = v2BlockColor(b);
    const tgt = !isShortLeg(b) ? resolveTarget(b) : { min: 0, max: 0 };
    const band = showNumbers && tgt.min > 0 ? fmtBand(tgt.min, tgt.max) : '';
    const planned = b.distanceMeters ? fmtDistance(b.distanceMeters) : b.durationSeconds ? fmtClock(b.durationSeconds) : '';

    const name = isRep ? t('run.session.repN', { rep: String(rep) }) : blockDisplayLabel(b);
    const titleText = done && rec ? `${name} · ${fmtClock(rec.durationSeconds)}` : isRep ? name : `${name}${planned ? ` · ${planned}` : ''}`;
    const sub = band ? t('run.session.target', { band }) : isRep ? planned : '';

    let status = '';
    let statusColor = '#64748b';
    if (done && c) {
      status = paceClassText(c);
      statusColor = c.band === 'in' ? IN.text : OFF.text;
    } else if (isFocus) {
      status = i === currentBlockIndex ? t('run.session.status.now') : t('run.session.status.upNext');
      statusColor = '#c0392b';
    }

    const value = done
      ? rec?.avgPaceSec
        ? fmtPace(rec.avgPaceSec)
        : rec
          ? fmtClock(rec.durationSeconds)
          : '–'
      : isFocus
        ? currentRemaining
        : '–';

    const circleStyle: React.CSSProperties = done
      ? { background: c ? (c.band === 'in' ? IN.fg : OFF.fg) : isRep ? '#94a3b8' : color, color: '#fff' }
      : isFocus
        ? { background: '#fff', color, boxShadow: `inset 0 0 0 2px ${color}` }
        : { background: '#f6fbfd', color: '#64748b', boxShadow: 'inset 0 0 0 1px #e6edf2' };

    return (
      <div
        key={b.id ?? i}
        role={upcoming ? 'button' : undefined}
        tabIndex={upcoming ? 0 : undefined}
        onClick={upcoming ? () => setJumpTarget(i) : undefined}
        onKeyDown={upcoming ? (e) => e.key === 'Enter' && setJumpTarget(i) : undefined}
        className={`flex min-h-[52px] items-center gap-3 px-3 py-2 ${isFocus ? 'rounded-[14px] bg-[#fdf2f2]' : ''} ${upcoming ? 'active:bg-v2-surface' : ''}`}
      >
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-black tabular-nums"
          style={circleStyle}
          aria-hidden
        >
          {isRep ? rep : done ? <Check size={15} strokeWidth={3} /> : <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate whitespace-nowrap text-[14.5px] font-black text-v2-ink">{titleText}</span>
          {sub && <span className="block truncate whitespace-nowrap text-[12px] font-bold text-v2-muted">{sub}</span>}
        </span>
        {status && (
          <span className="shrink-0 whitespace-nowrap text-[12.5px] font-extrabold" style={{ color: statusColor }}>
            {status}
          </span>
        )}
        <span dir="ltr" className="w-14 shrink-0 text-left text-[17px] font-black tabular-nums text-v2-ink">
          {value}
        </span>
      </div>
    );
  };

  const sectionHead = (label: string, color: string, meta: string, side?: string) => (
    <div className="mb-1.5 mt-4 flex items-center gap-1.5 px-1">
      <Activity size={16} strokeWidth={2.6} color={color} aria-hidden />
      <span className="whitespace-nowrap text-[15px] font-black" style={{ color: color === V2_BLOCK_COLORS.wrapper ? '#65a30d' : color }}>
        {label}
      </span>
      <span className="truncate whitespace-nowrap text-[12.5px] font-bold text-v2-muted">{meta}</span>
      {side && <span className="ms-auto shrink-0 whitespace-nowrap text-[12.5px] font-extrabold text-v2-ink-2">{side}</span>}
    </div>
  );

  const card = (indices: number[], active: boolean) => (
    <div
      className={`overflow-hidden rounded-[20px] bg-white p-1 ${active ? 'shadow-v2-card ring-2 ring-v2-accent' : 'shadow-v2-ring'}`}
    >
      {indices.map(row)}
    </div>
  );

  const inSection = (idx: number[]) => idx.includes(focusIndex);
  const mainRows = hasReps ? sections.main.filter((i) => !isRestBlock(blocks[i])) : sections.main;
  const mainColor = hasReps ? v2BlockColor(blocks[mainRows[0]]) : V2_BLOCK_COLORS.easy;
  const blocksMeta = (n: number) => t('run.session.blocksMeta', { n });

  return (
    <div className="h-full overflow-y-auto bg-v2-surface px-4 pb-32" dir="rtl" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-[22px] font-black !tracking-[-0.02em] text-v2-ink">{t('run.session.title')}</h2>
          <p className="truncate text-[13px] font-bold text-v2-muted">{title}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('run.session.backToPlayer')}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white shadow-v2-ring active:scale-[0.97] transition-transform duration-150 ease-v2"
        >
          <ChevronDown size={20} strokeWidth={2.4} className="rotate-180 text-v2-ink" aria-hidden />
        </button>
      </div>

      {sections.warmup.length > 0 && (
        <>
          {sectionHead(t('run.session.section.warmup'), V2_BLOCK_COLORS.wrapper, blocksMeta(sections.warmup.length))}
          {card(sections.warmup, inSection(sections.warmup))}
        </>
      )}

      {mainRows.length > 0 && (
        <>
          {sectionHead(
            hasReps ? t('run.session.section.main') : t('run.session.section.workout'),
            mainColor,
            hasReps
              ? sameRest
                ? t('run.session.repsMetaRest', { n: reps.total, rest: String(sameRest) })
                : t('run.session.repsMeta', { n: reps.total })
              : blocksMeta(mainRows.length),
            summary.scored > 0 ? t('run.session.inRange', { inRange: String(summary.inRange), scored: String(summary.scored) }) : undefined,
          )}
          {card(mainRows, inSection(sections.main))}
        </>
      )}

      {sections.cooldown.length > 0 && (
        <>
          {sectionHead(t('run.session.section.cooldown'), V2_BLOCK_COLORS.wrapper, blocksMeta(sections.cooldown.length))}
          {card(sections.cooldown, inSection(sections.cooldown))}
        </>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 rounded-[20px] bg-white px-4 py-3 shadow-v2-ring">
        <span className="whitespace-nowrap text-[14px] font-black text-v2-ink">{t('run.session.soFar')}</span>
        <span dir="ltr" className="truncate whitespace-nowrap text-[13.5px] font-extrabold tabular-nums text-v2-ink-2">
          {avgPaceSec > 0
            ? t('run.session.totalsAvg', { time: fmtClock(totals.durationSec), km: totals.distanceKm.toFixed(1), pace: fmtPace(avgPaceSec) })
            : t('run.session.totals', { time: fmtClock(totals.durationSec), km: totals.distanceKm.toFixed(1) })}
        </span>
      </div>

      <AnimatePresence>
        {jumpTarget !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-6"
            onClick={() => setJumpTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-v2-card bg-white p-5 text-center shadow-v2-card"
              dir="rtl"
            >
              <p className="text-[17px] font-black text-v2-ink">
                {t('run.session.jump.title', {
                  name: (reps.byIndex.get(jumpTarget) ?? 0) > 0 && reps.total > 1
                    ? t('run.session.repN', { rep: String(reps.byIndex.get(jumpTarget)) })
                    : blockDisplayLabel(blocks[jumpTarget]),
                })}
              </p>
              <p className="mt-1 text-[14px] font-semibold text-v2-ink-2">{t('run.session.jump.body')}</p>
              <div className="mt-4 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setJumpTarget(null)}
                  className="h-12 flex-1 rounded-full bg-white text-[15px] font-extrabold text-v2-ink shadow-v2-ring active:scale-[0.97] transition-transform duration-150 ease-v2"
                >
                  {t('run.session.jump.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onJumpToBlock(jumpTarget);
                    setJumpTarget(null);
                  }}
                  className="h-12 flex-1 rounded-full bg-v2-cta text-[15px] font-extrabold text-v2-on-cta shadow-v2-cta active:scale-[0.97] transition-transform duration-150 ease-v2"
                >
                  {t('run.session.jump.confirm')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
