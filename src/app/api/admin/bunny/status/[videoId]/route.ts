/**
 * GET /api/admin/bunny/status/[videoId]
 *
 * Step 2 of the admin video-upload flow — used while the admin UI polls
 * for encoding completion after the TUS upload finishes.
 *
 * Response: BunnyVideoStatus
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getBunnyVideoStatus,
  BunnyApiError,
  BunnyConfigError,
} from '@/lib/bunny/bunny.service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: { videoId: string } },
) {
  try {
    const { videoId } = params;
    if (!videoId) {
      return NextResponse.json({ error: 'videoId is required' }, { status: 400 });
    }

    const status = await getBunnyVideoStatus(videoId);
    return NextResponse.json(status);
  } catch (error) {
    if (error instanceof BunnyConfigError) {
      return NextResponse.json(
        { error: error.message, code: 'BUNNY_NOT_CONFIGURED' },
        { status: 503 },
      );
    }
    if (error instanceof BunnyApiError) {
      return NextResponse.json(
        {
          error: error.message,
          code: 'BUNNY_API_ERROR',
          upstreamStatus: error.status,
          upstreamBody: error.upstreamBody,
          endpoint: error.endpoint,
        },
        { status: 502 },
      );
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[bunny/status] unexpected:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
