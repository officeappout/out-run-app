import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { requireAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { getDriveClient, PRIMARY_MAILBOX } from '@/lib/google-service-account';
import { createInsight } from '@/features/admin/services/insights.service';
import type { InsightSource } from '@/types/admin-types';

export const maxDuration = 60;

// ─── Types ────────────────────────────────────────────────────────────────────

interface TranscriptExtraction {
  summary: string;
  actionItems: string[];
  entityType: 'authority' | 'user' | 'general';
  authorityName: string | null;
  concepts: string[];
}

// ─── Phase 1: Read transcript from Drive ─────────────────────────────────────

async function readTranscriptFromDrive(fileId: string): Promise<string> {
  const drive = await getDriveClient(PRIMARY_MAILBOX);

  const meta = await drive.files.get({
    fileId,
    fields: 'mimeType',
    supportsAllDrives: true,
  });

  const mimeType = meta.data.mimeType ?? '';

  if (mimeType === 'application/vnd.google-apps.document') {
    const res = await drive.files.export(
      { fileId, mimeType: 'text/plain' },
      { responseType: 'text' }
    );
    return (res.data as string) ?? '';
  }

  // Plain text / docx / other binary formats
  const res = await (drive.files.get as any)(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'text' }
  );
  return (res.data as string) ?? '';
}

// ─── Phase 2: Extract via Claude ─────────────────────────────────────────────

async function extractFromTranscript(text: string): Promise<TranscriptExtraction> {
  const client = new Anthropic();

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `אתה עוזר CRM של חברת OUT (אפליקציית כושר לרשויות ישראליות).
קרא את התמלול הבא וחלץ:

1. סיכום בעברית — 3-5 משפטים
2. action items — רשימה, כל אחד משפט אחד
3. סוג ישות: "authority" (רשות מקומית/עירייה), "user" (משתמש/ספורטאי), "general"
4. שם הרשות — שם מלא כפי שמופיע, או null
5. קונספטים — בחר רלוונטיים: "פנייה לנשים", "בקשת פיצ'ר", "תקצוב", "חוזה", "מדידה/KPI", "שיווק", "מוניציפלי", "משתמש פעיל", "תלונה", "שבח", "תחרות"

החזר JSON בלבד (ללא טקסט נוסף):
{"summary":"...","actionItems":["..."],"entityType":"authority"|"user"|"general","authorityName":"..."|null,"concepts":["..."]}

תמלול:
---
${text.slice(0, 8000)}
---`,
    }],
  });

  const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
  const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

  try {
    return JSON.parse(cleaned) as TranscriptExtraction;
  } catch {
    return { summary: raw.slice(0, 500), actionItems: [], entityType: 'general', authorityName: null, concepts: [] };
  }
}

// ─── Phase 3: Resolve authority ID from extracted name ───────────────────────

async function resolveAuthority(name: string): Promise<{ id: string; name: string } | null> {
  const db = getAdminDb();

  // Exact match first
  const exact = await db.collection('authorities').where('name', '==', name).limit(1).get();
  if (!exact.empty) return { id: exact.docs[0].id, name: exact.docs[0].data().name as string };

  // Prefix match fallback
  const prefix = await db.collection('authorities')
    .orderBy('name')
    .startAt(name)
    .endAt(name + '')
    .limit(1)
    .get();
  if (!prefix.empty) return { id: prefix.docs[0].id, name: prefix.docs[0].data().name as string };

  return null;
}

// ─── Phase 4.5: Append meeting summary to authority activityLog ───────────────

async function appendToActivityLog(authorityId: string, summary: string, transcriptUrl: string, date: Date): Promise<void> {
  const db = getAdminDb();
  await db.collection('authorities').doc(authorityId).update({
    activityLog: FieldValue.arrayUnion({
      id: crypto.randomUUID(),
      type: 'meeting',
      content: summary,
      gmailUrl: transcriptUrl,
      date: Timestamp.fromDate(date),
      createdAt: Timestamp.now(),
      createdBy: 'transcript-agent',
    }),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

// ─── POST /api/admin/transcripts/process ─────────────────────────────────────

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

  const log: string[] = [];
  const push = (s: string) => log.push(s);
  const date = dateStr ? new Date(dateStr) : new Date();

  // Phase 1
  let text: string;
  let transcriptUrl = '';

  if (fileId) {
    push(`📄 Drive: ${fileId}`);
    try {
      text = await readTranscriptFromDrive(fileId);
      transcriptUrl = `https://drive.google.com/file/d/${fileId}/view`;
      push(`✅ ${text.length} תווים`);
    } catch (err: any) {
      return NextResponse.json({ error: `Drive read failed: ${err?.message}` }, { status: 500 });
    }
  } else {
    text = rawText!;
    push(`📝 טקסט ישיר: ${text.length} תווים`);
  }

  if (text.trim().length < 20) {
    return NextResponse.json({ error: 'Transcript too short (< 20 chars)' }, { status: 400 });
  }

  // Phase 2
  push('🧠 מחלץ סיכום...');
  let extraction: TranscriptExtraction;
  try {
    extraction = await extractFromTranscript(text);
    push(`✅ entityType=${extraction.entityType} | concepts: ${extraction.concepts.join(', ') || 'none'}`);
  } catch (err: any) {
    return NextResponse.json({ error: `Extraction failed: ${err?.message}` }, { status: 500 });
  }

  // Phase 3
  let authorityId = hintId ?? null;
  let authorityName: string | null = extraction.authorityName;

  if (!authorityId && extraction.authorityName) {
    push(`🔍 מחפש רשות: ${extraction.authorityName}`);
    const found = await resolveAuthority(extraction.authorityName);
    if (found) {
      authorityId = found.id;
      authorityName = found.name;
      push(`✅ ${found.name} (${found.id})`);
    } else {
      push(`⚠️ לא נמצאה: ${extraction.authorityName}`);
    }
  }

  // Phase 4 — write insight
  push('💾 שומר insight...');
  const insightId = await createInsight({
    source,
    date,
    transcriptUrl,
    summary: extraction.summary,
    actionItems: extraction.actionItems,
    entityType: authorityId ? 'authority' : extraction.entityType,
    authorityId: authorityId ?? undefined,
    authorityName: authorityName ?? undefined,
    concepts: extraction.concepts,
  });
  push(`✅ insights/${insightId}`);

  // Phase 4.5 — activityLog
  if (authorityId) {
    push(`📋 activityLog → ${authorityName}`);
    try {
      await appendToActivityLog(authorityId, extraction.summary, transcriptUrl, date);
      push('✅ activityLog עודכן');
    } catch (err: any) {
      push(`⚠️ activityLog נכשל: ${err?.message}`);
    }
  }

  return NextResponse.json({
    insightId,
    summary: extraction.summary,
    actionItems: extraction.actionItems,
    entityType: authorityId ? 'authority' : extraction.entityType,
    authorityId,
    authorityName,
    concepts: extraction.concepts,
    transcriptUrl,
    log,
  });
}
