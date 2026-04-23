/**
 * POST /api/admin/bunny/upload
 *
 * Step 1 of the admin video-upload flow.
 *
 * Creates a video object in the Bunny library and returns the TUS upload URL
 * + signed authorization the browser uses to upload the file directly to
 * Bunny (bypassing the Next.js 4MB body limit).
 *
 * Request body: { title: string, videoType?: 'preview' | 'tutorial' }
 * Response:     BunnyCreateVideoResult
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createBunnyVideo,
  BunnyApiError,
  BunnyConfigError,
} from '@/lib/bunny/bunny.service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const title = typeof body?.title === 'string' && body.title.trim().length > 0
      ? body.title.trim()
      : `exercise-video-${Date.now()}`;

    const result = await createBunnyVideo(title);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BunnyConfigError) {
      return NextResponse.json(
        { error: error.message, code: 'BUNNY_NOT_CONFIGURED' },
        { status: 503 },
      );
    }
    if (error instanceof BunnyApiError) {
      // Surface the UPSTREAM Bunny status (401/403/404 etc.) and raw body in
      // the response so the admin UI / browser DevTools network tab can show
      // the real reason rather than a generic 502 wrapper.
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
    console.error('[bunny/upload] unexpected:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
