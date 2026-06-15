import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { readTranscriptFromDrive, processTranscript } from '@/features/admin/services/transcript.service';
import type { InsightSource } from '@/types/admin-types';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  let body: {
    fileId?: string;
    text?: string;
    source?: InsightSource;
    date?: string;
    authorityId?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { fileId, text: rawText, source = 'meeting', date: dateStr, authorityId: hintId } = body;

  if (!fileId && !rawText) {
    return NextResponse.json({ error: 'Provide fileId or text' }, { status: 400 });
  }

  const date = dateStr ? new Date(dateStr) : new Date();
  let text: string;

  if (fileId) {
    try {
      text = await readTranscriptFromDrive(fileId);
    } catch (err: any) {
      return NextResponse.json({ error: `Drive read failed: ${err?.message}` }, { status: 500 });
    }
  } else {
    text = rawText!;
  }

  if (text.trim().length < 20) {
    return NextResponse.json({ error: 'Transcript too short (< 20 chars)' }, { status: 400 });
  }

  try {
    const result = await processTranscript({ text, fileId, source, date, hintAuthorityId: hintId });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Processing failed' }, { status: 500 });
  }
}
