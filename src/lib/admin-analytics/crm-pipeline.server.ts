/**
 * crm-pipeline.server — authorities by CRM pipeline status (authorities.pipelineStatus; a missing
 * value reads as 'lead', exactly like normalizeAuthority in authority.service.ts). READ-ONLY:
 * never touches isActiveClient (axiom §6). `draft` = database-only entities, reported apart and
 * NOT counted as pipeline (admin-types.ts).
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import {
  PIPELINE_STATUS_LABELS,
  URGENT_PIPELINE_STATUSES,
  type PipelineStatus,
} from '@/types/admin-types';

export const PIPELINE_ORDER: PipelineStatus[] = ['draft', 'lead', 'meeting', 'quote', 'follow_up', 'closing', 'active', 'upsell'];

export interface CrmPipeline {
  /** every status, in pipeline order, with its Hebrew label */
  byStatus: Array<{ status: PipelineStatus; label: string; count: number }>;
  /** all non-draft authorities */
  inPipeline: number;
  /** follow_up + closing */
  urgent: number;
  draft: number;
  /** docs whose stored status is not one of the 8 valid values (reported, not guessed) */
  unknownStatus: number;
  totalAuthorities: number;
}

export function summarizePipeline(statuses: unknown[]): CrmPipeline {
  const counts = new Map<PipelineStatus, number>(PIPELINE_ORDER.map((s) => [s, 0]));
  let unknownStatus = 0;
  for (const raw of statuses) {
    const s = (raw || 'lead') as PipelineStatus;
    if (counts.has(s)) counts.set(s, (counts.get(s) ?? 0) + 1);
    else unknownStatus++;
  }
  const draft = counts.get('draft') ?? 0;
  const byStatus = PIPELINE_ORDER.map((status) => ({ status, label: PIPELINE_STATUS_LABELS[status], count: counts.get(status) ?? 0 }));
  const inPipeline = byStatus.filter((r) => r.status !== 'draft').reduce((a, r) => a + r.count, 0);
  const urgent = URGENT_PIPELINE_STATUSES.reduce((a, s) => a + (counts.get(s) ?? 0), 0);
  return { byStatus, inPipeline, urgent, draft, unknownStatus, totalAuthorities: statuses.length };
}

export async function computeCrmPipeline(db: Firestore): Promise<CrmPipeline> {
  const snap = await db.collection('authorities').select('pipelineStatus').get();
  return summarizePipeline(snap.docs.map((d) => d.data()?.pipelineStatus));
}
