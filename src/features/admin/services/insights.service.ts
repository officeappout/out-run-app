import 'server-only';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import type { Insight, InsightSource, InsightEntityType } from '@/types/admin-types';

const COLLECTION = 'insights';

export interface CreateInsightInput {
  source: InsightSource;
  date: Date;
  transcriptUrl: string;
  summary: string;
  actionItems: string[];
  entityType: InsightEntityType;
  authorityId?: string;
  authorityName?: string;
  concepts: string[];
}

export async function createInsight(input: CreateInsightInput): Promise<string> {
  const db = getAdminDb();
  const ref = db.collection(COLLECTION).doc();
  await ref.set({
    ...input,
    id: ref.id,
    date: Timestamp.fromDate(input.date),
    createdBy: 'transcript-agent',
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export interface InsightQueryFilters {
  entityType?: InsightEntityType;
  authorityId?: string;
  concept?: string;
  source?: InsightSource;
  limit?: number;
}

export async function queryInsights(filters: InsightQueryFilters = {}): Promise<Insight[]> {
  const db = getAdminDb();
  let q = db.collection(COLLECTION).orderBy('date', 'desc') as FirebaseFirestore.Query;

  if (filters.entityType) q = q.where('entityType', '==', filters.entityType);
  if (filters.authorityId) q = q.where('authorityId', '==', filters.authorityId);
  if (filters.concept)     q = q.where('concepts', 'array-contains', filters.concept);
  if (filters.source)      q = q.where('source', '==', filters.source);

  q = q.limit(filters.limit ?? 50);

  const snap = await q.get();
  return snap.docs.map(d => ({ ...d.data(), id: d.id }) as unknown as Insight);
}
