'use client';

/**
 * PlannedLiveCardV2 — the white card floating over the map on the v2
 * planned-run player (boards F-1c / F-1c2 / F-1d). Two swipe pages:
 *   1. the current block — ONE huge number (≥ 96 px) chosen by the block:
 *      pace vs the target band (+ the fast ↔ slow scale) on reps and runs,
 *      a countdown + next-rep card on recoveries, distance left + time on
 *      legs under 400 m (no pace — owner rule), remaining on effort blocks;
 *   2. "נתונים כלליים" — total km huge + avg pace · time · kcal.
 * Controls: flag (finish this block) · black pause (hold = end) · stopwatch (lap).
 * The pace state is always icon + words, never colour alone.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import { Check, ChevronsDown, ChevronsUp, Flag, Flame, Heart, Timer, Zap } from 'lucide-react';
import type { RunBlock } from '../../../types/run-block.type';
import type { PlannedRunEngine } from '../../../hooks/usePlannedRunEngine';
import HoldToEndPauseButton from './HoldToEndPauseButton';
import PaceRangeScale from './PaceRangeScale';
import {
  PACE_BAND_COLORS,
  blockDisplayLabel,
  classifyPace,
  fmtBand,
  fmtClock,
  fmtDistance,
  fmtPace,
  isShortLeg,
  isWorkBlock,
  liveCardMode,
  paceClassText,
  recordClass,
  resolveBlockTargetPace,
  v2BlockColor,
  type PaceClass,
  type PlannedBlockRecord,
} from '../../../lib/planned-rep-results';

export interface PlannedLiveCardV2Props {
  engine: PlannedRunEngine;
  blocks: RunBlock[];
  /** index → 1-based rep number, and the number of reps. */
  reps: { byIndex: Map<number, number>; total: number };
  lastRep: PlannedBlockRecord | null;
  blockElapsedSeconds: number;
  totals: { durationSec: number; distanceKm: number; calories: number };
  canSkip: boolean;
  onSkip: () => void;
  onPause: () => void;
  onEnd: () => void;
  onLap: () => void;
}

const ICON_STROKE = 2.5;

function BandIcon({ c, size = 14 }: { c: PaceClass; size?: number }) {
  const color = PACE_BAND_COLORS[c.band].text;
  if (c.band === 'in') return <Check size={size} strokeWidth={ICON_STROKE} color={color} aria-hidden />;
  return c.band === 'fast' ? (
    <ChevronsUp size={size} strokeWidth={ICON_STROKE} color={color} aria-hidden />
  ) : (
    <ChevronsDown size={size} strokeWidth={ICON_STROKE} color={color} aria-hidden />
  );
}

function Pill({ bg, color, children }: { bg: string; color: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex h-[30px] min-w-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[13px] font-extrabold"
      style={{ background: bg, color }}
    >
      {children}
    </span>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0 flex-1 text-center">
      <div dir="ltr" className="truncate whitespace-nowrap text-[24px] font-black leading-tight tracking-[-0.02em] tabular-nums text-v2-ink">
        {value}
      </div>
      <div className="truncate whitespace-nowrap text-[12px] font-bold text-v2-muted">{label}</div>
    </div>
  );
}

function Hero({ value, color, label }: { value: string; color?: string; label: string }) {
  return (
    <>
      <div
        dir="ltr"
        className="mt-1 whitespace-nowrap text-center text-[96px] font-black leading-none tracking-[-0.04em] tabular-nums"
        style={{ color: color ?? '#0e1419' }}
      >
        {value}
      </div>
      <div className="mt-1 truncate whitespace-nowrap text-center text-[13.5px] font-extrabold text-v2-ink-2">{label}</div>
    </>
  );
}

function RoundControl({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-v2-surface ring-1 ring-inset ring-v2-hairline active:scale-[0.97] transition-transform duration-150 ease-v2 disabled:opacity-35"
    >
      {children}
    </button>
  );
}

export default function PlannedLiveCardV2({
  engine,
  blocks,
  reps,
  lastRep,
  blockElapsedSeconds,
  totals,
  canSkip,
  onSkip,
  onPause,
  onEnd,
  onLap,
}: PlannedLiveCardV2Props) {
  const [page, setPage] = useState(0);
  const [lapToast, setLapToast] = useState<string | null>(null);
  const lapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (lapTimer.current) clearTimeout(lapTimer.current);
  }, []);

  const {
    currentBlock: block,
    currentBlockIndex,
    blockTimeRemaining,
    blockDistanceRemaining,
    currentPaceSeconds,
    targetMinPace,
    targetMaxPace,
    showNumbers,
    effortLabel,
    targetZoneLabel,
    basePace,
    zones,
  } = engine;

  const handleLap = useCallback(() => {
    onLap();
    setLapToast('הקפה נרשמה');
    if (lapTimer.current) clearTimeout(lapTimer.current);
    lapTimer.current = setTimeout(() => setLapToast(null), 1600);
  }, [onLap]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    // Page 2 sits to the LEFT (RTL): dragging the card rightwards reveals it.
    if (info.offset.x > 50 || info.velocity.x > 500) setPage(1);
    else if (info.offset.x < -50 || info.velocity.x < -500) setPage(0);
  };

  const hasTarget = targetMinPace > 0 && targetMaxPace > 0;
  const mode = liveCardMode(block, hasTarget);
  const live = mode === 'pace' ? classifyPace(currentPaceSeconds, targetMinPace, targetMaxPace) : null;
  const blockColor = block ? v2BlockColor(block) : '#a9b7c2';
  const rep = reps.byIndex.get(currentBlockIndex) ?? 0;
  const isRep = isWorkBlock(block) && reps.total > 1;

  const plannedMeta = (b: RunBlock) =>
    b.distanceMeters ? fmtDistance(b.distanceMeters) : b.durationSeconds ? fmtClock(b.durationSeconds) : '';
  const remaining = !block
    ? '--'
    : block.durationSeconds && block.durationSeconds > 0
      ? fmtClock(blockTimeRemaining)
      : block.distanceMeters && block.distanceMeters > 0
        ? fmtDistance(blockDistanceRemaining)
        : fmtClock(blockElapsedSeconds);
  const where = isRep ? 'בחזרה' : 'בבלוק';
  const avgPaceSec = totals.distanceKm > 0.05 ? totals.durationSec / totals.distanceKm : 0;
  const nowPace = currentPaceSeconds > 0 ? fmtPace(currentPaceSeconds) : '--:--';

  // ── Chips row ──────────────────────────────────────────────────────────
  const blockChip = block ? (
    <Pill bg={`${blockColor}26`} color="#0e1419">
      {mode === 'recovery' ? (
        <Heart size={13} strokeWidth={ICON_STROKE} aria-hidden />
      ) : (
        <Zap size={13} strokeWidth={ICON_STROKE} color={blockColor} aria-hidden />
      )}
      <span className="truncate">
        {isRep
          ? `חזרה ${rep} מתוך ${reps.total}${plannedMeta(block) ? ` · ${plannedMeta(block)}` : ''}`
          : blockDisplayLabel(block)}
      </span>
    </Pill>
  ) : null;

  let sideChip: React.ReactNode = null;
  if (mode === 'pace' && live) {
    const t = PACE_BAND_COLORS[live.band];
    sideChip = (
      <Pill bg={t.bg} color={t.text}>
        <BandIcon c={live} size={13} />
        {paceClassText(live)}
      </Pill>
    );
  } else if (mode === 'effort') {
    sideChip = (
      <Pill bg="#fff7ed" color="#c2410c">
        <Flame size={13} strokeWidth={ICON_STROKE} aria-hidden />
        {effortLabel || 'מאמץ'}
      </Pill>
    );
  } else if (mode === 'recovery' && lastRep) {
    const c = recordClass(lastRep);
    const t = c ? PACE_BAND_COLORS[c.band] : null;
    sideChip = (
      <Pill bg={t ? t.bg : '#eef8fc'} color={t ? t.text : '#0284c7'}>
        {c ? <BandIcon c={c} size={13} /> : <Timer size={13} strokeWidth={ICON_STROKE} aria-hidden />}
        {`אחרי חזרה ${lastRep.rep} · ${lastRep.avgPaceSec ? fmtPace(lastRep.avgPaceSec) : fmtClock(lastRep.durationSeconds)}`}
      </Pill>
    );
  }

  // ── Page 1 body by mode ────────────────────────────────────────────────
  const next = blocks[currentBlockIndex + 1] ?? null;
  const nextRep = next ? reps.byIndex.get(currentBlockIndex + 1) ?? 0 : 0;
  const nextName = next ? (isWorkBlock(next) && reps.total > 1 ? `חזרה ${nextRep}` : blockDisplayLabel(next)) : '';

  let body: React.ReactNode = null;
  if (mode === 'pace' || mode === 'pace_free') {
    const color = live ? PACE_BAND_COLORS[live.band].fg : undefined;
    body = (
      <>
        <Hero value={nowPace} color={color} label="קצב עכשיו · דק׳ לק״מ" />
        {mode === 'pace' && (
          <PaceRangeScale
            minSec={targetMinPace}
            maxSec={targetMaxPace}
            currentSec={currentPaceSeconds}
            markerColor={color ?? '#a9b7c2'}
            targetLabel={showNumbers ? `יעד ${fmtBand(targetMinPace, targetMaxPace)}` : `יעד · ${targetZoneLabel}`}
          />
        )}
        <div className="mt-3 flex border-t border-v2-hairline pt-2.5">
          <Stat value={remaining} label={`נותרו ${where}`} />
          <Stat value={fmtClock(blockElapsedSeconds)} label={`זמן ${where}`} />
        </div>
      </>
    );
  } else if (mode === 'short' || mode === 'effort') {
    body = (
      <>
        <Hero value={remaining} label={`נותרו ${where}`} />
        <div className="mt-3 flex border-t border-v2-hairline pt-2.5">
          <Stat value={fmtClock(blockElapsedSeconds)} label={`זמן ${where}`} />
          <Stat value={totals.distanceKm.toFixed(2)} label="ק״מ סה״כ" />
        </div>
      </>
    );
  } else if (mode === 'recovery') {
    const nt = next && !isShortLeg(next) ? resolveBlockTargetPace(next, basePace, zones) : { min: 0, max: 0 };
    const nextBand = showNumbers && nt.min > 0 ? fmtBand(nt.min, nt.max) : '';
    const nextColor = next ? v2BlockColor(next) : '#a9b7c2';
    body = (
      <>
        <Hero
          value={remaining}
          label={next ? `עד ${nextName}${block?.durationSeconds ? ' · מתחילה לבד' : ''}` : 'עד סוף האימון'}
        />
        {next && (
          <div
            className="mt-3 flex items-center gap-2.5 rounded-[18px] px-3 py-2.5"
            style={{ background: `${nextColor}1f` }}
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-white">
              <Zap size={18} strokeWidth={ICON_STROKE} color={nextColor} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-extrabold text-v2-ink-2">{`הבא · ${nextName}`}</span>
              <span className="block truncate text-[16px] font-black text-v2-ink">
                {[plannedMeta(next), nextBand && `ב-${nextBand}`].filter(Boolean).join(' ')}
              </span>
            </span>
            {canSkip && (
              <button
                type="button"
                onClick={onSkip}
                className="h-11 shrink-0 whitespace-nowrap rounded-full bg-white px-4 text-[13px] font-extrabold text-v2-ink shadow-v2-ring active:scale-[0.97] transition-transform duration-150 ease-v2"
              >
                דלג
              </button>
            )}
          </div>
        )}
        <div className="mt-3 flex border-t border-v2-hairline pt-2.5">
          <Stat value={nowPace} label="קצב עכשיו" />
          <Stat value={totals.distanceKm.toFixed(1)} label="ק״מ סה״כ" />
          <Stat value={fmtClock(totals.durationSec)} label="זמן" />
        </div>
      </>
    );
  }

  const general = (
    <>
      <div className="text-center text-[13px] font-extrabold text-v2-muted">נתונים כלליים</div>
      <Hero value={totals.distanceKm.toFixed(2)} label="קילומטר" />
      <div className="mt-3 flex border-t border-v2-hairline pt-2.5">
        <Stat value={avgPaceSec > 0 ? fmtPace(avgPaceSec) : '--:--'} label="קצב ממוצע" />
        <Stat value={fmtClock(totals.durationSec)} label="זמן" />
        <Stat value={String(Math.round(totals.calories || 0))} label="קק״ל" />
      </div>
    </>
  );

  // Page 2 keeps the current rep in view ("חזרה 3 מתוך 6 · 4:51 · בטווח").
  const repPeek =
    page === 1 && block && (mode === 'pace' || mode === 'recovery') ? (
      <div className="mx-auto mb-2 inline-flex h-9 max-w-full items-center gap-2 whitespace-nowrap rounded-full bg-white px-3.5 text-[13px] font-extrabold text-v2-ink shadow-v2-card">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: blockColor }} aria-hidden />
        <span className="truncate">{isRep ? `חזרה ${rep} מתוך ${reps.total}` : blockDisplayLabel(block)}</span>
        {mode === 'pace' && (
          <>
            <span dir="ltr" className="tabular-nums">{nowPace}</span>
            {live && (
              <span className="inline-flex items-center gap-1" style={{ color: PACE_BAND_COLORS[live.band].text }}>
                <BandIcon c={live} size={13} />
                {paceClassText(live)}
              </span>
            )}
          </>
        )}
        {mode === 'recovery' && <span dir="ltr" className="tabular-nums">{remaining}</span>}
      </div>
    ) : null;

  return (
    <div className="pointer-events-auto flex flex-col items-center">
      {repPeek}
      <AnimatePresence>
        {lapToast && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mb-2 inline-flex h-9 items-center gap-1.5 rounded-full bg-v2-ink px-4 text-[13px] font-extrabold text-white"
          >
            <Timer size={14} strokeWidth={ICON_STROKE} aria-hidden />
            {lapToast}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="w-full rounded-[30px] bg-white px-[18px] pb-3.5 pt-3.5 shadow-v2-float" dir="rtl">
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
              key={page === 0 ? `blk-${currentBlockIndex}` : 'general'}
              initial={{ opacity: 0, x: page === 0 ? -24 : 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            >
              {page === 0 ? (
                <>
                  <div className="mb-0.5 flex min-w-0 items-center justify-between gap-2">
                    {blockChip}
                    {sideChip}
                  </div>
                  {body}
                </>
              ) : (
                general
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>

        {/* Page dots (page 1 on the right, RTL) — tappable too. */}
        <div className="mt-2.5 flex justify-center gap-1.5" role="tablist" aria-label={`עמוד ${page + 1} מתוך 2 · החליקו לצד`}>
          {[0, 1].map((i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={page === i}
              aria-label={i === 0 ? 'הבלוק הנוכחי' : 'נתונים כלליים'}
              onClick={() => setPage(i)}
              className="grid h-6 place-items-center px-0.5"
            >
              <span
                className="block h-1.5 rounded-full transition-all duration-200 ease-v2"
                style={{ width: page === i ? 16 : 6, background: page === i ? '#0e1419' : '#cbd5e1' }}
              />
            </button>
          ))}
        </div>

        {/* Controls: flag (right) · pause / hold to end · stopwatch (left). */}
        <div className="mt-1.5 flex items-center justify-center gap-7">
          <RoundControl label="סיום הבלוק · מעבר לבא" onClick={onSkip} disabled={!canSkip}>
            <Flag size={21} strokeWidth={2.2} color="#0e1419" aria-hidden />
          </RoundControl>
          <HoldToEndPauseButton onTap={onPause} onHoldComplete={onEnd} />
          <RoundControl label="הקפה" onClick={handleLap}>
            <Timer size={22} strokeWidth={2.2} color="#0e1419" aria-hidden />
          </RoundControl>
        </div>
      </div>
    </div>
  );
}
