/**
 * Which flag values a viewer sees (pure — unit-tested; used by useFeatureFlags).
 *
 *   super admin  → every flag's superAdminValue (unchanged behaviour)
 *   AI tester    → the stored values, with each flag's qaTesterValue applied on top — only while
 *                  enable_demo_users AND enable_ai_testers are on (stored values). A tester is a
 *                  signed-in uid demo_qa_* with the token claims qa + demo (src/lib/qa/qa-tester.ts).
 *                  Testers never get superAdminValue (agent-briefs/ai-testers-design.md §2.6).
 *   everyone     → the stored values
 * Graduated flags (FLAG_DEFS `graduated: true`) are true for every viewer, whatever is stored.
 */
import { FLAG_DEFS } from './feature-flag-defs';

type FlagDef = (typeof FLAG_DEFS)[number];
type FlagMap = { [D in FlagDef as D['key']]: boolean };

/** key → qaTesterValue, for the defs that declare one. */
export const QA_TESTER_OVERRIDES: Partial<FlagMap> = Object.fromEntries(
  FLAG_DEFS.flatMap((d) => ('qaTesterValue' in d && typeof d.qaTesterValue === 'boolean' ? [[d.key, d.qaTesterValue]] : [])),
) as Partial<FlagMap>;

/** key → true, for the defs marked graduated (on for everyone, panel value ignored). */
export const GRADUATED_OVERRIDES: Partial<FlagMap> = Object.fromEntries(
  FLAG_DEFS.flatMap((d) => ('graduated' in d && d.graduated === true ? [[d.key, true]] : [])),
) as Partial<FlagMap>;

/** The same object when every graduated flag is already on (keeps identity for memoized consumers). */
function withGraduated<T extends FlagMap>(flags: T): T {
  const keys = Object.keys(GRADUATED_OVERRIDES) as (keyof FlagMap)[];
  return keys.every((k) => flags[k] === true) ? flags : { ...flags, ...GRADUATED_OVERRIDES };
}

export function testerOverridesActive(stored: Pick<FlagMap, 'enableDemoUsers' | 'enableAiTesters'>): boolean {
  return stored.enableDemoUsers === true && stored.enableAiTesters === true;
}

export function resolveViewerFlags<T extends FlagMap>(
  stored: T,
  viewer: { isSuperAdmin: boolean; isQaTester: boolean },
  superAdminFlags: T,
): T {
  if (viewer.isSuperAdmin) return withGraduated(superAdminFlags);
  if (viewer.isQaTester && testerOverridesActive(stored)) return withGraduated({ ...stored, ...QA_TESTER_OVERRIDES });
  return withGraduated(stored);
}
