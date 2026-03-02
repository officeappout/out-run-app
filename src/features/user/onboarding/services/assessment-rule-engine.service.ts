/**
 * Firestore CRUD + runtime evaluator for `assessment_rules` collection.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type {
  AssessmentRule,
  RuleCondition,
  AssessmentLevels,
  ComparisonOperator,
} from '../types/visual-assessment.types';

const COLLECTION = 'assessment_rules';

// ── Helpers ────────────────────────────────────────────────────────

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const cleaned = { ...obj };
  for (const key of Object.keys(cleaned)) {
    if (cleaned[key] === undefined) delete cleaned[key];
  }
  return cleaned;
}

function toDate(ts: Timestamp | Date | undefined | null): Date | undefined {
  if (!ts) return undefined;
  if (ts instanceof Date) return ts;
  if (typeof (ts as Timestamp).toDate === 'function') {
    try { return (ts as Timestamp).toDate(); } catch { /* fall through */ }
  }
  if (typeof ts === 'object' && 'seconds' in ts && typeof (ts as { seconds: number }).seconds === 'number') {
    return new Date((ts as { seconds: number }).seconds * 1000);
  }
  return undefined;
}

function docToRule(id: string, data: Record<string, unknown>): AssessmentRule {
  return {
    id,
    name: (data.name as string) ?? '',
    description: (data.description as string) ?? '',
    isActive: (data.isActive as boolean) ?? true,
    priority: (data.priority as number) ?? 100,
    conditions: (data.conditions as RuleCondition[]) ?? [],
    action: (data.action as AssessmentRule['action']) ?? { type: 'BRANCH_TO_FOLLOW_UP' },
    createdAt: toDate(data.createdAt as Timestamp | Date | undefined),
    updatedAt: toDate(data.updatedAt as Timestamp | Date | undefined),
    createdBy: (data.createdBy as string) ?? '',
  };
}

// ── CRUD ───────────────────────────────────────────────────────────

export async function getAllRules(): Promise<AssessmentRule[]> {
  try {
    const q = query(collection(db, COLLECTION), orderBy('priority', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => docToRule(d.id, d.data()));
  } catch (error) {
    console.error('[RuleEngine] getAllRules error:', error);
    throw error;
  }
}

export async function getActiveRules(): Promise<AssessmentRule[]> {
  try {
    const q = query(
      collection(db, COLLECTION),
      where('isActive', '==', true),
      orderBy('priority', 'asc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => docToRule(d.id, d.data()));
  } catch (error) {
    console.error('[RuleEngine] getActiveRules error:', error);
    throw error;
  }
}

export async function getRule(id: string): Promise<AssessmentRule | null> {
  try {
    const snap = await getDoc(doc(db, COLLECTION, id));
    if (!snap.exists()) return null;
    return docToRule(snap.id, snap.data());
  } catch (error) {
    console.error('[RuleEngine] getRule error:', error);
    throw error;
  }
}

export async function createRule(
  data: Omit<AssessmentRule, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  try {
    const ref = await addDoc(collection(db, COLLECTION), stripUndefined({
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
    return ref.id;
  } catch (error) {
    console.error('[RuleEngine] createRule error:', error);
    throw error;
  }
}

export async function updateRule(
  id: string,
  data: Partial<Omit<AssessmentRule, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTION, id), stripUndefined({
      ...data,
      updatedAt: serverTimestamp(),
    }));
  } catch (error) {
    console.error('[RuleEngine] updateRule error:', error);
    throw error;
  }
}

export async function deleteRule(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, COLLECTION, id));
  } catch (error) {
    console.error('[RuleEngine] deleteRule error:', error);
    throw error;
  }
}

// ── Runtime Evaluator ──────────────────────────────────────────────

function compare(left: number, op: ComparisonOperator, right: number): boolean {
  switch (op) {
    case '>':  return left > right;
    case '>=': return left >= right;
    case '<':  return left < right;
    case '<=': return left <= right;
    case '==': return left === right;
    case '!=': return left !== right;
    default:   return false;
  }
}

/**
 * Evaluate all active rules against given slider levels.
 * Returns the first matching rule (by priority) or null.
 */
export async function evaluateRules(
  levels: AssessmentLevels,
): Promise<AssessmentRule | null> {
  const rules = await getActiveRules();
  const average = Math.round(
    (levels.push + levels.pull + levels.legs) / 3,
  );

  for (const rule of rules) {
    const allMet = rule.conditions.every(cond => {
      const fieldValue = cond.field === 'average' ? average : (levels[cond.field] ?? 0);
      return compare(fieldValue, cond.operator, cond.value);
    });
    if (allMet) return rule;
  }

  return null;
}

/**
 * Evaluate rules synchronously given a pre-fetched list (for admin test tool).
 */
export function evaluateRulesSync(
  rules: AssessmentRule[],
  levels: AssessmentLevels,
): AssessmentRule | null {
  const active = rules.filter(r => r.isActive).sort((a, b) => a.priority - b.priority);
  const average = Math.round(
    (levels.push + levels.pull + levels.legs) / 3,
  );

  for (const rule of active) {
    const allMet = rule.conditions.every(cond => {
      const fieldValue = cond.field === 'average' ? average : (levels[cond.field] ?? 0);
      return compare(fieldValue, cond.operator, cond.value);
    });
    if (allMet) return rule;
  }

  return null;
}

// ── Seed example rules ─────────────────────────────────────────────

export async function seedExampleRules(): Promise<number> {
  const existing = await getAllRules();
  if (existing.length > 0) return 0;

  const examples: Omit<AssessmentRule, 'id' | 'createdAt' | 'updatedAt'>[] = [
    {
      name: 'Elite Upper Body → Calisthenics Assessment',
      description: 'When both Push and Pull are above 15, refine with a focused upper-body follow-up.',
      isActive: true,
      priority: 1,
      conditions: [
        { field: 'push', operator: '>', value: 15 },
        { field: 'pull', operator: '>', value: 15 },
      ],
      action: {
        type: 'BRANCH_TO_FOLLOW_UP',
        followUpCategories: ['push', 'pull'],
        followUpTitle: { he: { neutral: 'הערכה מתקדמת — פלג גוף עליון' }, en: { neutral: 'Advanced Upper Body Assessment' } },
        followUpDescription: { he: { neutral: 'בואו נבדוק ביתר דיוק את רמתך בדחיפה ומשיכה' }, en: { neutral: 'Let\'s refine your push and pull levels' } },
      },
      createdBy: 'seed',
    },
    {
      name: 'Core Weakness Alert',
      description: 'High legs but weak core signals an imbalance that requires a core-focused program.',
      isActive: true,
      priority: 2,
      conditions: [
        { field: 'legs', operator: '>', value: 18 },
        { field: 'core', operator: '<', value: 5 },
      ],
      action: {
        type: 'SKIP_TO_RESULT',
        forceProgramId: 'full_body',
      },
      createdBy: 'seed',
    },
  ];

  let created = 0;
  for (const rule of examples) {
    await createRule(rule);
    created++;
  }
  return created;
}
