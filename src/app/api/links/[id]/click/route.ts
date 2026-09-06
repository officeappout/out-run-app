/**
 * GET / POST /api/links/[id]/click
 *
 * Legacy path, kept working for back-compat (anything already printed or
 * shared using this URL). `/r/[id]` is the canonical, go-forward tracking
 * URL surfaced by the admin panel now — see that route and
 * `link-click-handler.ts` (shared implementation) for full behaviour.
 */

import { NextRequest } from 'next/server';
import { handleLinkClick } from '@/features/admin/services/link-click-handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  return handleLinkClick(request, params.id);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  return handleLinkClick(request, params.id);
}
