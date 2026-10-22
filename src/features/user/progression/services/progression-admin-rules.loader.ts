/**
 * progression-admin-rules.loader — the Firestore reads behind the admin-rules
 * progression path (flag `progression_rules_from_admin`). The decisions live in
 * progression-admin-rules.ts (pure); this file only fetches.
 *
 * Reads only — no writes, no rules/functions changes.
 */
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PROGRESSION_RULES_FROM_ADMIN_V1 } from '@/config/feature-flags';
import { readFeatureFlagOnce } from '@/lib/feature-flag-once';
import { getProgramLevelSetting } from '@/features/content/programs/core/programLevelSettings.service';
import type { ProgramLevelSettings } from '@/features/content/programs/core/program.types';
import {
  resolveAdminRule,
  type AdminLevelSettingsData,
  type AdminRuleDocData,
  type ResolvedAdminRule,
} from './progression-admin-rules';

const PROGRESSION_RULES = 'progression_rules';
const LEVEL_SETTINGS = 'programLevelSettings';

/** Minimal id↔slug map (ProgramSlugMap in progression.service satisfies it). */
export interface IdSlugMap {
  idToSlug: Map<string, string>;
  slugToId: Map<string, string>;
}

/**
 * Is the engine on admin rules for this user?
 * Code constant (fallback default, false) OR super admin (preview) OR the panel switch
 * "התקדמות לפי הגדרות הפאנל" (system_config/feature_flags.progression_rules_from_admin).
 */
export async function resolveAdminRulesFlag(isSuperAdmin: boolean): Promise<boolean> {
  if (PROGRESSION_RULES_FROM_ADMIN_V1 || isSuperAdmin) return true;
  return readFeatureFlagOnce('progression_rules_from_admin');
}

/** The admin saves under the program DOC ID; callers pass slugs. Both, doc id first. */
export function programKeys(programId: string, map: IdSlugMap | null): string[] {
  const docId = map?.slugToId.get(programId) ?? (map?.idToSlug.has(programId) ? programId : undefined);
  const slug = map?.idToSlug.get(programId) ?? programId;
  return Array.from(new Set([docId, slug, programId].filter((k): k is string => !!k)));
}

/**
 * Candidate `progression_rules` doc ids for a program + level, in lookup order:
 * doc id (where the admin writes), then slug-keyed (legacy / hand-made), then raw.
 */
export function progressionRuleIdCandidates(
  programId: string,
  level: number,
  slugMap: IdSlugMap | null,
): string[] {
  return programKeys(programId, slugMap).map((k) => `${k}_level_${level}`);
}

async function firstExisting<T>(col: string, ids: string[]): Promise<T | undefined> {
  for (const id of ids) {
    const snap = await getDoc(doc(db, col, id));
    if (snap.exists()) return snap.data() as T;
  }
  return undefined;
}

/** Every level configured for the program (both collections), for the "above last level" carry. */
async function loadProgramLevels(keys: string[]): Promise<{
  rules: Map<number, AdminRuleDocData>;
  settings: Map<number, AdminLevelSettingsData>;
}> {
  const rules = new Map<number, AdminRuleDocData>();
  const settings = new Map<number, AdminLevelSettingsData>();
  const [r, s] = await Promise.all([
    getDocs(query(collection(db, PROGRESSION_RULES), where('programId', 'in', keys))),
    getDocs(query(collection(db, LEVEL_SETTINGS), where('programId', 'in', keys))),
  ]);
  // keys are in priority order (doc id first) — the first key's doc wins a level.
  const rank = (pid: unknown) => {
    const i = keys.indexOf(String(pid));
    return i < 0 ? keys.length : i;
  };
  const put = <T extends Record<string, unknown>>(m: Map<number, T>, lvl: unknown, data: T) => {
    const n = Number(lvl);
    if (!Number.isFinite(n)) return;
    const prev = m.get(n);
    if (!prev || rank(data.programId) < rank(prev.programId)) m.set(n, data);
  };
  for (const d of r?.docs ?? []) put(rules, d.data().level, d.data() as AdminRuleDocData);
  for (const d of s?.docs ?? []) put(settings, d.data().levelNumber ?? d.data().level, d.data() as AdminLevelSettingsData);
  return { rules, settings };
}

/**
 * The admin rule for (program, level): exact docs by id (doc id, then slug), and —
 * only when an exact doc is missing — the program's other levels for the carry.
 * Errors fall back to the defaults (never blocks a workout save).
 */
export async function loadAdminRuleForLevel(
  programId: string,
  level: number,
  map: IdSlugMap | null,
): Promise<ResolvedAdminRule> {
  const rules = new Map<number, AdminRuleDocData>();
  const settings = new Map<number, AdminLevelSettingsData>();
  try {
    const ids = progressionRuleIdCandidates(programId, level, map);
    const exactRule = await firstExisting<AdminRuleDocData>(PROGRESSION_RULES, ids);
    const exactPls = await firstExisting<AdminLevelSettingsData>(LEVEL_SETTINGS, ids);
    if (exactRule) rules.set(level, exactRule);
    if (exactPls) settings.set(level, exactPls);
    if (!exactRule || !exactPls) {
      const all = await loadProgramLevels(programKeys(programId, map));
      all.rules.forEach((d, l) => { if (!rules.has(l)) rules.set(l, d); });
      all.settings.forEach((d, l) => { if (!settings.has(l)) settings.set(l, d); });
    }
  } catch (e) {
    console.warn(`[Progression] admin rule load failed for ${programId} L${level} — partial/defaults:`, e);
  }
  return resolveAdminRule(level, { rules, settings });
}

/** Level goals (programLevelSettings.targetGoals) by doc id first, then slug — admin saves by doc id. */
export async function loadLevelSettingsForGoals(
  programId: string,
  level: number,
  map: IdSlugMap | null,
): Promise<ProgramLevelSettings | null> {
  for (const key of programKeys(programId, map)) {
    const s = await getProgramLevelSetting(key, level);
    if (s) return s;
  }
  return null;
}
