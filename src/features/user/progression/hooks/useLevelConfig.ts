'use client';

/**
 * useLevelConfig — Firestore-first level configuration
 *
 * Reads XP thresholds and target goals from the `levels` Firestore collection
 * managed by the admin panel at /admin/levels.
 *
 * Falls back to GLOBAL_LEVEL_THRESHOLDS (xp-rules.ts) when Firestore is
 * unavailable or returns no data, so the UI always has something to render.
 *
 * Hebrew level names always come from LEVEL_STAGES (lemur-stages.ts) because
 * the admin panel stores English names only.
 */

import { useState, useEffect, useCallback } from 'react';
import { getAllLevels } from '@/features/content/programs/core/level.service';
import type { Level } from '@/features/content/programs/core/program.types';
import { GLOBAL_LEVEL_THRESHOLDS } from '../config/xp-rules';
import { LEVEL_STAGES } from '../config/lemur-stages';
import type { LevelGoal } from '@/types/workout';

export interface LevelConfigEntry {
  /** 1-based level number (maps to `order` in the Firestore `levels` collection) */
  level: number;
  /** Minimum XP required to reach this level — admin panel is source of truth */
  minXP: number;
  /** Maximum XP ceiling before the next level begins */
  maxXP: number;
  /** Gendered Hebrew name — from lemur-stages.ts (admin stores English only) */
  nameMale: string;
  nameFemale: string;
  /** Admin-defined exercise targets for this global XP level */
  targetGoals: LevelGoal[];
}

interface UseLevelConfigResult {
  levels: LevelConfigEntry[];
  loading: boolean;
  /** Returns the LevelConfigEntry for the current XP amount */
  getLevelForXP: (xp: number) => LevelConfigEntry;
  /** Returns the threshold entry for a specific level number.
   *  Falls back to a synthesised entry from GLOBAL_LEVEL_THRESHOLDS when the
   *  Firestore `levels` collection doesn't have that level yet — so the UI
   *  always has a real minXP value to show, never 0. */
  getEntry: (level: number) => LevelConfigEntry;
  /** The XP amount needed to START the next level from the user's current level.
   *  Uses nextLevel.minXP when available, then current.maxXP, then the hardcoded
   *  fallback — guarantees a positive, non-zero denominator. */
  getNextThreshold: (currentLevel: number) => number;
  /** Progress % (0-100) from currentLevel minXP to nextLevel minXP */
  calcProgress: (xp: number, currentLevel: number) => number;
}

function buildFallback(): LevelConfigEntry[] {
  return GLOBAL_LEVEL_THRESHOLDS.map((t, i) => {
    const stage = LEVEL_STAGES.find(s => s.level === t.level) ?? LEVEL_STAGES[0];
    const nextMinXP = GLOBAL_LEVEL_THRESHOLDS[i + 1]?.minXP ?? t.minXP + 50_000;
    return {
      level: t.level,
      minXP: t.minXP,
      maxXP: nextMinXP,
      nameMale: stage.nameMale,
      nameFemale: stage.nameFemale,
      targetGoals: [],
    };
  });
}

function mapFirestoreLevel(doc: Level, index: number, allDocs: Level[]): LevelConfigEntry {
  const levelNum = doc.order ?? index + 1;
  const stage = LEVEL_STAGES.find(s => s.level === levelNum) ?? LEVEL_STAGES[0];
  const nextDoc = allDocs[index + 1];
  const maxXP = nextDoc?.minXP ?? (doc.maxXP ?? (doc.minXP ?? 0) + 50_000);

  return {
    level: levelNum,
    minXP: doc.minXP ?? GLOBAL_LEVEL_THRESHOLDS[index]?.minXP ?? 0,
    maxXP: maxXP,
    nameMale: stage.nameMale,
    nameFemale: stage.nameFemale,
    targetGoals: (doc.targetGoals ?? []) as LevelGoal[],
  };
}

/** Build a synthetic LevelConfigEntry for a level not present in Firestore,
 *  using GLOBAL_LEVEL_THRESHOLDS as the authoritative fallback. */
function buildSyntheticEntry(level: number): LevelConfigEntry {
  const clampedLevel = Math.max(1, Math.min(10, level));
  const threshold = GLOBAL_LEVEL_THRESHOLDS.find(t => t.level === clampedLevel)
    ?? GLOBAL_LEVEL_THRESHOLDS[0];
  const nextThreshold = GLOBAL_LEVEL_THRESHOLDS.find(t => t.level === clampedLevel + 1);
  const stage = LEVEL_STAGES.find(s => s.level === clampedLevel) ?? LEVEL_STAGES[0];
  return {
    level: clampedLevel,
    minXP: threshold.minXP,
    maxXP: nextThreshold?.minXP ?? threshold.minXP + 50_000,
    nameMale: stage.nameMale,
    nameFemale: stage.nameFemale,
    targetGoals: [],
  };
}

export function useLevelConfig(): UseLevelConfigResult {
  const [levels, setLevels] = useState<LevelConfigEntry[]>(() => buildFallback());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') { setLoading(false); return; }
    if (typeof navigator !== 'undefined' && !navigator.onLine) { setLoading(false); return; }

    getAllLevels()
      .then((docs) => {
        if (docs.length === 0) return; // keep fallback
        const sorted = [...docs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setLevels(sorted.map((d, i, arr) => mapFirestoreLevel(d, i, arr)));
      })
      .catch(() => {
        // Fallback already set in useState — silently ignore
      })
      .finally(() => setLoading(false));
  }, []);

  const getLevelForXP = (xp: number): LevelConfigEntry => {
    let current = levels[0];
    for (const entry of levels) {
      if (xp >= entry.minXP) current = entry;
      else break;
    }
    return current;
  };

  /** Resolves a level entry robustly:
   *  1. Firestore-loaded levels (admin panel is source of truth)
   *  2. Synthetic entry built from GLOBAL_LEVEL_THRESHOLDS fallback
   *  Never returns an entry for the wrong level number. */
  const getEntry = useCallback((level: number): LevelConfigEntry => {
    const found = levels.find(l => l.level === level);
    if (found) return found;
    // Don't fall back to levels[0] — that would return minXP=0 for ANY missing
    // level, causing "81 / 0 XP" when only level 1 is configured in Firestore.
    return buildSyntheticEntry(level);
  }, [levels]);

  /** Returns the XP needed to START the next level — always a positive number.
   *  Priority: nextLevel.minXP → current.maxXP → hardcoded fallback. */
  const getNextThreshold = useCallback((currentLevel: number): number => {
    if (currentLevel >= 10) return Infinity;
    const next = getEntry(currentLevel + 1);
    if (next.minXP > 0) return next.minXP;
    // next.minXP is 0 only when it's a fresh level-1 fallback — use current's maxXP instead
    const current = getEntry(currentLevel);
    if (current.maxXP > current.minXP) return current.maxXP;
    // Hard fallback from GLOBAL_LEVEL_THRESHOLDS
    const hardcoded = GLOBAL_LEVEL_THRESHOLDS.find(t => t.level === currentLevel + 1);
    return hardcoded?.minXP ?? current.minXP + 300;
  }, [getEntry]);

  const calcProgress = useCallback((xp: number, currentLevel: number): number => {
    if (currentLevel >= 10) return 100;
    const current = getEntry(currentLevel);
    const nextXP = getNextThreshold(currentLevel);
    const range = nextXP - current.minXP;
    // Division-by-zero guard — always return a valid number
    if (range <= 0) return xp >= current.minXP ? 100 : 0;
    return Math.min(100, Math.max(0, Math.round(((xp - current.minXP) / range) * 100)));
  }, [getEntry, getNextThreshold]);

  return { levels, loading, getLevelForXP, getEntry, getNextThreshold, calcProgress };
}
