/**
 * GET / POST /r/[id]
 *
 * Canonical, go-forward Smart Link tracking URL — short, public-facing
 * ("{SHORT_LINK_DOMAIN}/r/{id}", currently outrun.co.il — see
 * `marketing-links.service.ts`'s `SHORT_LINK_DOMAIN`, which reads the
 * domain from an env var precisely so a planned domain cutover is a
 * config change, not a code change), meant to be what's copied into a QR
 * code or shared. All actual logic lives in `link-click-handler.ts`
 * (shared with the older `/api/links/[id]/click` path, kept for
 * back-compat) — see that file's doc comment for full behaviour.
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
