import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { getDriveClient, PRIMARY_MAILBOX, TRANSCRIPTS_INBOX_FOLDER_ID } from '@/lib/google-service-account';
import { readTranscriptFromDrive, processTranscript } from '@/features/admin/services/transcript.service';

export const maxDuration = 60;

const MAX_PER_SCAN = 5;      // cap to stay within 60s Hobby limit
const PROCESSED_FOLDER_NAME = 'מעובד';

// ─── Drive helpers ────────────────────────────────────────────────────────────

async function findOrCreateProcessedFolder(drive: any, parentId: string): Promise<string> {
  const search = await drive.files.list({
    q: `name='${PROCESSED_FOLDER_NAME}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  if (search.data.files?.length) return search.data.files[0].id as string;

  const created = await drive.files.create({
    requestBody: {
      name: PROCESSED_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
    supportsAllDrives: true,
  });
  return created.data.id as string;
}

async function listInboxFiles(drive: any, folderId: string) {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and mimeType!='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name, mimeType, createdTime)',
    orderBy: 'createdTime',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: MAX_PER_SCAN,
  });
  return (res.data.files ?? []) as { id: string; name: string; mimeType: string; createdTime: string }[];
}

async function moveToProcessed(drive: any, fileId: string, inboxId: string, processedId: string): Promise<void> {
  await drive.files.update({
    fileId,
    addParents: processedId,
    removeParents: inboxId,
    fields: 'id, parents',
    supportsAllDrives: true,
  });
}

// ─── POST /api/admin/transcripts/scan ────────────────────────────────────────

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  if (!TRANSCRIPTS_INBOX_FOLDER_ID) {
    return NextResponse.json(
      { error: 'TRANSCRIPTS_INBOX_FOLDER_ID env var not configured' },
      { status: 500 }
    );
  }

  const log: string[] = [];
  const push = (s: string) => log.push(s);

  const drive = await getDriveClient(PRIMARY_MAILBOX);

  // Find/create "מעובד" subfolder
  push('📁 מחפש תיקיית מעובד...');
  const processedFolderId = await findOrCreateProcessedFolder(drive, TRANSCRIPTS_INBOX_FOLDER_ID);
  push(`✅ תיקיית מעובד: ${processedFolderId}`);

  // List unprocessed files (already excludes subfolders)
  push('📋 סורק תיבת נכנס...');
  const files = await listInboxFiles(drive, TRANSCRIPTS_INBOX_FOLDER_ID);
  push(`📄 נמצאו ${files.length} קבצים לעיבוד`);

  const processed: Array<{
    fileId: string;
    fileName: string;
    insightId: string;
    summary: string;
    actionItems: string[];
    concepts: string[];
    entityType: string;
    authorityId: string | null;
    authorityName: string | null;
    transcriptUrl: string;
    movedToProcessed: boolean;
  }> = [];

  const skipped: Array<{ fileId: string; fileName: string; reason: string }> = [];

  for (const file of files.slice(0, MAX_PER_SCAN)) {
    push(`\n⏳ ${file.name}`);
    try {
      const text = await readTranscriptFromDrive(file.id);

      if (text.trim().length < 20) {
        skipped.push({ fileId: file.id, fileName: file.name, reason: 'טקסט קצר מדי' });
        push(`⏭ דולג (טקסט קצר)`);
        continue;
      }

      const result = await processTranscript({
        text,
        fileId: file.id,
        source: 'meeting',
        date: new Date(file.createdTime),
      });

      log.push(...result.log);

      // Move to "מעובד" after successful processing
      let moved = false;
      try {
        await moveToProcessed(drive, file.id, TRANSCRIPTS_INBOX_FOLDER_ID, processedFolderId);
        moved = true;
        push(`📦 הועבר ל-מעובד`);
      } catch (moveErr: any) {
        push(`⚠️ העברה נכשלה: ${moveErr?.message}`);
      }

      processed.push({
        fileId: file.id,
        fileName: file.name,
        insightId: result.insightId,
        summary: result.summary,
        actionItems: result.actionItems,
        concepts: result.concepts,
        entityType: result.entityType,
        authorityId: result.authorityId,
        authorityName: result.authorityName,
        transcriptUrl: result.transcriptUrl,
        movedToProcessed: moved,
      });
    } catch (err: any) {
      skipped.push({ fileId: file.id, fileName: file.name, reason: err?.message ?? 'שגיאה לא ידועה' });
      push(`❌ נכשל: ${err?.message}`);
    }
  }

  push(`\n✅ סיום — עובדו ${processed.length}, דולגו ${skipped.length}`);

  return NextResponse.json({ processed, skipped, log });
}
