/**
 * Master Evolution Sync Service
 *
 * Fills programLevelSettings with tiered incentive data:
 * - baseGain: 8/6/4/2% by level tier
 * - firstSessionBonus: 3/1.5/0.5% by tier
 * - maxSets, minSets, persistenceBonusConfig, rpeBonusConfig
 * - Master programs: baseGain = 0
 * - Grandchild (OAP, etc.): parentLevelMapping for 10-to-1
 */

import { getAllPrograms } from '@/features/content/programs/core/program.service';
import {
  getProgramLevelSetting,
  saveProgramLevelSettings,
} from '@/features/content/programs/core/programLevelSettings.service';
import type { Program } from '@/features/content/programs/core/program.types';

const PERSISTENCE_BONUS = { '2': 1, '5': 2, '7': 3, '8': 3, '9': 3, '10': 3 };
const RPE_BONUS = {
  '1': 2, '2': 2, '3': 2, '4': 2, '5': 2,
  '6': 1, '7': 1,
  '8': 0, '9': 0, '10': 0,
};

function getBaseGain(level: number, isMaster: boolean): number {
  if (isMaster) return 0;
  if (level <= 5) return 8;
  if (level <= 13) return 6;
  if (level <= 19) return 4;
  return 2;
}

function getFirstSessionBonus(level: number, isMaster: boolean): number {
  if (isMaster) return 0;
  if (level <= 13) return 3;
  if (level <= 19) return 1.5;
  return 0.5;
}

function getMaxSets(level: number): number {
  if (level <= 5) return 20;
  if (level <= 12) return 24;
  if (level <= 19) return 30;
  return 35;
}

function getMinSets(level: number): number {
  if (level <= 5) return 4;
  if (level <= 15) return 6;
  return 8;
}

/** Grandchild programs and their level mapping to parent. OAP L1 → Pull L10, etc. */
const GRANDCHILD_PARENT_MAPPING: Record<string, Record<string, number>> = {
  oap: { '1': 10, '2': 11, '3': 12, '4': 13, '5': 14, '6': 15, '7': 16, '8': 17, '9': 18, '10': 19 },
  planche: { '1': 10, '2': 11, '3': 12, '4': 13, '5': 14, '6': 15, '7': 16, '8': 17, '9': 18, '10': 19 },
  front_lever: { '1': 10, '2': 11, '3': 12, '4': 13, '5': 14, '6': 15, '7': 16, '8': 17, '9': 18, '10': 19 },
};

export interface MasterEvolutionSyncResult {
  programsProcessed: number;
  levelsUpdated: number;
  errors: string[];
}

const BATCH_SIZE = 5;

export async function runMasterEvolutionSync(): Promise<MasterEvolutionSyncResult> {
  const result: MasterEvolutionSyncResult = {
    programsProcessed: 0,
    levelsUpdated: 0,
    errors: [],
  };

  const programs = await getAllPrograms();
  const maxLevels = 25;

  for (const program of programs) {
    const programName = program.name || program.id;
    console.log(`[MasterEvolutionSync] Processing ${programName}...`);

    try {
      const isMaster = program.isMaster === true;
      const parentMapping = GRANDCHILD_PARENT_MAPPING[program.id.toLowerCase()];

      // Process levels in batches of 5 to avoid Firestore overload
      for (let batchStart = 1; batchStart <= maxLevels; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, maxLevels);
        const batchPromises: Promise<void>[] = [];

        for (let level = batchStart; level <= batchEnd; level++) {
          batchPromises.push(
            (async () => {
              try {
                const existing = await getProgramLevelSetting(program.id, level);

                const baseGain = getBaseGain(level, isMaster);
                const firstSessionBonus = getFirstSessionBonus(level, isMaster);
                const maxSets = getMaxSets(level);
                const minSets = getMinSets(level);

                const payload = {
                  programId: program.id,
                  levelNumber: level,
                  levelDescription: existing?.levelDescription ?? `Level ${level}`,
                  progressionWeight: existing?.progressionWeight ?? 1.0,
                  intensityModifier: existing?.intensityModifier ?? 1.0,
                  restMultiplier: existing?.restMultiplier ?? 1.0,
                  volumeAdjustment: existing?.volumeAdjustment ?? 0,
                  targetGoals: existing?.targetGoals ?? [],
                  weeklyVolumeTarget: existing?.weeklyVolumeTarget,
                  maxIntenseWorkoutsPerWeek: existing?.maxIntenseWorkoutsPerWeek,
                  straightArmRatio: existing?.straightArmRatio,
                  maxSets,
                  minSets,
                  baseGain,
                  firstSessionBonus,
                  persistenceBonusConfig: PERSISTENCE_BONUS,
                  rpeBonusConfig: RPE_BONUS,
                  ...(parentMapping && parentMapping[String(level)] != null
                    ? { parentLevelMapping: { [String(level)]: parentMapping[String(level)] } }
                    : {}),
                };

                await saveProgramLevelSettings(payload);
                result.levelsUpdated++;
              } catch (err) {
                result.errors.push(`${program.id} L${level}: ${(err as Error).message}`);
              }
            })()
          );
        }

        await Promise.all(batchPromises);
      }

      result.programsProcessed++;
      console.log(`[MasterEvolutionSync] Done ${programName} (${result.levelsUpdated} levels so far)`);
    } catch (err) {
      result.errors.push(`${program.id}: ${(err as Error).message}`);
      console.error(`[MasterEvolutionSync] Error ${programName}:`, err);
    }
  }

  return result;
}
