import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { queryInsights } from '@/features/admin/services/insights.service';
import type { InsightEntityType, InsightSource } from '@/types/admin-types';

/**
 * GET /api/admin/insights
 *
 * Query params:
 *   entityType  — 'authority' | 'user' | 'general'
 *   authorityId — Firestore authority document ID
 *   concept     — single concept tag (array-contains)
 *   source      — 'meeting' | 'user_call' | 'note'
 *   limit       — max results (default 50)
 *
 * Used by agents to answer cross-org questions like:
 *   "what did authorities say about X" / "which features are users requesting"
 */
export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);

  const insights = await queryInsights({
    entityType: (searchParams.get('entityType') as InsightEntityType) || undefined,
    authorityId: searchParams.get('authorityId') || undefined,
    concept:     searchParams.get('concept') || undefined,
    source:      (searchParams.get('source') as InsightSource) || undefined,
    limit:       searchParams.has('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined,
  });

  return NextResponse.json({ insights, count: insights.length });
}
