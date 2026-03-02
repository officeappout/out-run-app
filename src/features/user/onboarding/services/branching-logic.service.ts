/**
 * Branching Logic Service
 *
 * Bridges the Visual Assessment results and the Assessment Rules engine
 * with the Dynamic Onboarding Questionnaire.
 *
 * Responsibilities:
 * 1. Evaluate all active assessment rules against the user's slider levels.
 * 2. Collect rule-driven overrides (skip categories, inject questions).
 * 3. Build an `AssessmentContext` that the questionnaire engine consumes.
 * 4. Provide a helper to load/restore context from sessionStorage.
 */

import { evaluateRules } from './assessment-rule-engine.service';
import type {
  AssessmentLevels,
  AssessmentContext,
  AssessmentRule,
} from '@/features/user/onboarding/types/visual-assessment.types';
import { getDocs, collection, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ════════════════════════════════════════════════════════════════════
// SESSION STORAGE KEY
// ════════════════════════════════════════════════════════════════════

const CONTEXT_KEY = 'onboarding_assessment_context';

// ════════════════════════════════════════════════════════════════════
// PUBLIC API
// ════════════════════════════════════════════════════════════════════

/**
 * Compute the full AssessmentContext for a user who completed the visual
 * assessment. Evaluates all rules and collects overrides.
 *
 * @param levels    Slider levels (push, pull, legs, core, …)
 * @param tier      The tier selected in the first step ('beginner' | 'intermediate' | 'advanced')
 * @returns         An AssessmentContext ready to feed into the questionnaire engine
 */
export async function computeAssessmentContext(
  levels: AssessmentLevels,
  tier: 'beginner' | 'intermediate' | 'advanced',
): Promise<AssessmentContext> {
  const average = Math.round((levels.push + levels.pull + levels.legs) / 3);

  // Evaluate the primary rule (BRANCH_TO_FOLLOW_UP / SKIP_TO_RESULT)
  const matchedRule = await evaluateRules(levels);

  // Collect ALL active rules to gather INJECT_QUESTIONS and SKIP_CATEGORY actions
  const allRules = await getAllActiveRules();
  const { skippedCategories, injectedQuestionIds, programTrack } = collectOverrides(allRules, levels, average);

  const ctx: AssessmentContext = {
    levels,
    average,
    tier,
    matchedRuleId: matchedRule?.id,
    matchedRuleAction: matchedRule?.action.type,
    skippedCategories: skippedCategories.length > 0 ? skippedCategories : undefined,
    injectedQuestionIds: injectedQuestionIds.length > 0 ? injectedQuestionIds : undefined,
    programTrack: programTrack ?? (matchedRule?.action.type === 'SET_PROGRAM_TRACK' ? matchedRule.action.programTrack : undefined),
  };

  console.log('[BranchingLogic] Computed context:', ctx);
  return ctx;
}

/**
 * Persist the assessment context to sessionStorage for cross-page access.
 */
export function saveAssessmentContext(ctx: AssessmentContext): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(CONTEXT_KEY, JSON.stringify(ctx));
}

/**
 * Load the assessment context from sessionStorage.
 * Returns null if not found or invalid.
 */
export function loadAssessmentContext(): AssessmentContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(CONTEXT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AssessmentContext;
  } catch {
    console.warn('[BranchingLogic] Failed to parse stored assessment context');
    return null;
  }
}

/**
 * Clear the stored assessment context.
 */
export function clearAssessmentContext(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(CONTEXT_KEY);
}

// ════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ════════════════════════════════════════════════════════════════════

/**
 * Fetch all active rules (including INJECT_QUESTIONS / SKIP_CATEGORY types).
 */
async function getAllActiveRules(): Promise<AssessmentRule[]> {
  try {
    const rulesRef = collection(db, 'assessment_rules');
    const q = query(
      rulesRef,
      where('isActive', '==', true),
      orderBy('priority', 'asc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as AssessmentRule));
  } catch (err) {
    console.error('[BranchingLogic] Failed to load rules:', err);
    return [];
  }
}

/**
 * Compare a numeric value using the specified operator.
 */
function compare(
  actual: number,
  operator: string,
  expected: number,
): boolean {
  switch (operator) {
    case '>':  return actual > expected;
    case '>=': return actual >= expected;
    case '<':  return actual < expected;
    case '<=': return actual <= expected;
    case '==': return actual === expected;
    case '!=': return actual !== expected;
    default:   return false;
  }
}

/**
 * Walk through all active rules and collect skip/inject overrides.
 * Only rules of type INJECT_QUESTIONS and SKIP_CATEGORY are processed here
 * (the primary rule — BRANCH / SKIP_TO_RESULT — is handled by the assessment page).
 */
function collectOverrides(
  rules: AssessmentRule[],
  levels: AssessmentLevels,
  average: number,
): { skippedCategories: string[]; injectedQuestionIds: string[]; programTrack?: 'health' | 'strength' | 'run' | 'hybrid' } {
  const skippedCategories: string[] = [];
  const injectedQuestionIds: string[] = [];
  let programTrack: 'health' | 'strength' | 'run' | 'hybrid' | undefined;

  for (const rule of rules) {
    const allMet = rule.conditions.every(cond => {
      const fieldValue = cond.field === 'average' ? average : (levels[cond.field] ?? 0);
      return compare(fieldValue, cond.operator, cond.value);
    });

    if (!allMet) continue;

    if (rule.action.type === 'SKIP_CATEGORY' && rule.action.skipCategories) {
      skippedCategories.push(...rule.action.skipCategories);
    }
    if (rule.action.type === 'INJECT_QUESTIONS' && rule.action.injectQuestionIds) {
      injectedQuestionIds.push(...rule.action.injectQuestionIds);
    }
    if (rule.action.type === 'SET_PROGRAM_TRACK' && rule.action.programTrack) {
      programTrack = rule.action.programTrack;
    }
  }

  return {
    skippedCategories: [...new Set(skippedCategories)],
    injectedQuestionIds: [...new Set(injectedQuestionIds)],
    programTrack,
  };
}
