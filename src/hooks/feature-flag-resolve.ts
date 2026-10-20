/**
 * Which flag values a viewer sees (pure — unit-tested; used by useFeatureFlags).
 *
 *   super admin  → every flag's superAdminValue (unchanged behaviour)
 *   AI tester    → the stored values, with each flag's qaTesterValue applied on top — only while
 *                  enable_demo_users AND enable_ai_testers are on (stored values). A tester is a
 *                  signed-in uid demo_qa_* with the token claims qa + demo (src/lib/qa/qa-tester.ts).
 *                  Testers never get superAdminValue (agent-briefs/ai-testers-design.md §2.6).
 *   everyone     → the stored values
 */
import { FLAG_DEFS } from './feature-flag-defs';

type FlagDef = (typeof FLAG_DEFS)[number];
type FlagMap = { [D in FlagDef as D['key']]: boolean };

/** key → qaTesterValue, for the defs that declare one. */
export const QA_TESTER_OVERRIDES: Partial<FlagMap> = Object.fromEntries(
  FLAG_DEFS.flatMap((d) => ('qaTesterValue' in d && typeof d.qaTesterValue === 'boolean' ? [[d.key, d.qaTesterValue]] : [])),
) as Partial<FlagMap>;

export function testerOverridesActive(stored: Pick<FlagMap, 'enableDemoUsers' | 'enableAiTesters'>): boolean {
  return stored.enableDemoUsers === true && stored.enableAiTesters === true;
}

export function resolveViewerFlags<T extends FlagMap>(
  stored: T,
  viewer: { isSuperAdmin: boolean; isQaTester: boolean },
  superAdminFlags: T,
): T {
  if (viewer.isSuperAdmin) return superAdminFlags;
  if (viewer.isQaTester && testerOverridesActive(stored)) return { ...stored, ...QA_TESTER_OVERRIDES };
  return stored;
}
