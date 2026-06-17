/**
 * Roadmap Goals Service — CRUD for the top-level `roadmap_goals` Firestore collection.
 * Goals are domain-agnostic epics that act as parent items for tasks from any domain.
 */
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { RoadmapDomain, CommonStatus, RoadmapPriority } from '@/types/roadmap-unified.types';

const COLLECTION = 'roadmap_goals';

export interface StoredGoal {
  id: string;
  title: string;
  description?: string;
  goalType: 'project' | 'metric';
  domain: RoadmapDomain;
  /** Lane key override — if set, item appears in this lane instead of domain default */
  theme?: string | null;
  status: CommonStatus;
  priority: RoadmapPriority | null;
  assigneeId: string | null;
  assigneeName: string | null;
  parentGoalId: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  milestoneDate?: string | null;
  targetValue?: number | null;
  currentValue?: number | null;
  unit?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type GoalCreate = Omit<StoredGoal, 'id' | 'createdAt' | 'updatedAt'>;
export type GoalUpdate = Partial<GoalCreate>;

function normalise(d: Record<string, unknown>, id: string): StoredGoal {
  const toIso = (v: unknown) =>
    v instanceof Timestamp ? v.toDate().toISOString() : typeof v === 'string' ? v : undefined;
  return {
    id,
    title: typeof d.title === 'string' ? d.title : '',
    description: typeof d.description === 'string' ? d.description : undefined,
    goalType: d.goalType === 'metric' ? 'metric' : 'project',
    domain: (d.domain as RoadmapDomain) ?? 'sales',
    theme: typeof d.theme === 'string' ? d.theme : null,
    status: (d.status as CommonStatus) ?? 'todo',
    priority: (['critical', 'high', 'medium', 'low'].includes(d.priority as string)
      ? d.priority as RoadmapPriority
      : null),
    assigneeId: typeof d.assigneeId === 'string' ? d.assigneeId : null,
    assigneeName: typeof d.assigneeName === 'string' ? d.assigneeName : null,
    parentGoalId: typeof d.parentGoalId === 'string' ? d.parentGoalId : null,
    startDate: typeof d.startDate === 'string' ? d.startDate : null,
    dueDate: typeof d.dueDate === 'string' ? d.dueDate : null,
    milestoneDate: typeof d.milestoneDate === 'string' ? d.milestoneDate : null,
    targetValue: typeof d.targetValue === 'number' ? d.targetValue : null,
    currentValue: typeof d.currentValue === 'number' ? d.currentValue : null,
    unit: typeof d.unit === 'string' ? d.unit : null,
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
  };
}

export async function getAllGoals(): Promise<StoredGoal[]> {
  try {
    const snap = await getDocs(query(collection(db, COLLECTION), orderBy('createdAt', 'asc')));
    return snap.docs.map(d => normalise(d.data() as Record<string, unknown>, d.id));
  } catch {
    // Collection may not exist yet — return empty list
    return [];
  }
}

export async function createGoal(data: GoalCreate): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  return ref.id;
}

export async function updateGoal(id: string, updates: GoalUpdate): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    ...updates,
    updatedAt: Timestamp.now(),
  });
}

export async function deleteGoal(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
