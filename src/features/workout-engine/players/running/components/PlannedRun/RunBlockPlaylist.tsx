'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import RunBlockBriefingCard from '../RunBlockBriefingCard';
import { computeZones, formatPaceSeconds } from '@/features/workout-engine/core/services/running-engine.service';
import { useRunningConfigStore } from '@/features/workout-engine/core/store/useRunningConfigStore';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import type { RunBlock } from '../../types/run-block.type';
import type { RunZoneType, RunnerProfileType } from '@/features/workout-engine/core/types/running.types';

interface RunBlockPlaylistProps {
  blocks: RunBlock[];
  currentBlockIndex: number;
  onJumpToBlock: (index: number) => void;
}

function fmtBlockDur(s: number): string {
  if (s < 60) return `${s} שנ'`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return sec > 0 ? `${m}:${sec.toString().padStart(2, '0')} דק'` : `${m} דק'`;
}

function fmtBlockDist(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} ק"מ`;
  return `${m} מ'`;
}

export default function RunBlockPlaylist({
  blocks,
  currentBlockIndex,
  onJumpToBlock,
}: RunBlockPlaylistProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const [jumpTarget, setJumpTarget] = useState<number | null>(null);

  const profile = useUserStore((s) => s.profile);
  const config = useRunningConfigStore((s) => s.config);
  const paceProfile = profile?.running?.paceProfile;
  const basePace = paceProfile?.basePace ?? 0;
  const profileType: RunnerProfileType = paceProfile?.profileType ?? 3;
  const showNumbers = profileType !== 3;

  const zones = React.useMemo(() => {
    if (basePace <= 0) return null;
    return computeZones(basePace, profileType, config);
  }, [basePace, profileType, config]);

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentBlockIndex]);

  function getPaceLabel(block: RunBlock): string {
    if (!showNumbers || basePace <= 0) return '';
    if (block.zoneType && zones) {
      const z = zones[block.zoneType];
      return `${formatPaceSeconds(z.minPace)}–${formatPaceSeconds(z.maxPace)}`;
    }
    if (block.targetPacePercentage) {
      const min = Math.round(basePace * block.targetPacePercentage.min / 100);
      const max = Math.round(basePace * block.targetPacePercentage.max / 100);
      return `${formatPaceSeconds(min)}–${formatPaceSeconds(max)}`;
    }
    return '';
  }

  function getMetaLabel(block: RunBlock): string {
    if (block.durationSeconds) return fmtBlockDur(block.durationSeconds);
    if (block.distanceMeters) return fmtBlockDist(block.distanceMeters);
    return '';
  }

  const handleBlockTap = (index: number) => {
    if (index <= currentBlockIndex) return;
    setJumpTarget(index);
  };

  const confirmJump = () => {
    if (jumpTarget !== null) {
      onJumpToBlock(jumpTarget);
      setJumpTarget(null);
    }
  };

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto bg-slate-50 pt-2 pb-32"
      dir="rtl"
      style={{ fontFamily: 'var(--font-simpler)' }}
    >
      <h3 className="text-sm font-bold text-slate-700 px-4 mb-2">רשימת בלוקים</h3>

      <div className="divide-y divide-slate-100">
        {blocks.map((block, index) => {
          const isCompleted = index < currentBlockIndex;
          const isActive = index === currentBlockIndex;
          const isUpcoming = index > currentBlockIndex;

          return (
            <div
              key={block.id ?? index}
              ref={isActive ? activeRef : undefined}
              className={`relative ${isCompleted ? 'opacity-50' : ''}`}
              onClick={isUpcoming ? () => handleBlockTap(index) : undefined}
              role={isUpcoming ? 'button' : undefined}
              tabIndex={isUpcoming ? 0 : undefined}
            >
              {isActive && (
                <div
                  className="absolute right-0 top-0 bottom-0 w-1 rounded-l-full"
                  style={{ backgroundColor: block.colorHex || '#00ADEF' }}
                />
              )}

              {isCompleted && (
                <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
                  <Check size={14} className="text-emerald-500" />
                </div>
              )}

              <RunBlockBriefingCard
                block={block}
                index={index}
                paceLabel={getPaceLabel(block)}
                metaLabel={getMetaLabel(block)}
              />
            </div>
          );
        })}
      </div>

      {/* Jump confirmation dialog */}
      <AnimatePresence>
        {jumpTarget !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40"
            onClick={() => setJumpTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 mx-6 shadow-2xl max-w-sm w-full text-center"
              dir="rtl"
            >
              <p className="text-base font-bold text-slate-900 mb-1">
                דלגו ל{blocks[jumpTarget]?.label}?
              </p>
              <p className="text-sm text-slate-500 mb-5">
                הבלוקים שביניהם ידולגו
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setJumpTarget(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-700"
                >
                  ביטול
                </button>
                <button
                  onClick={confirmJump}
                  className="flex-1 py-2.5 rounded-xl bg-[#00ADEF] text-sm font-bold text-white"
                >
                  דלגו
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
