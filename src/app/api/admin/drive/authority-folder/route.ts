/**
 * GET /api/admin/drive/authority-folder?authorityId=XXX
 *
 * Returns the Google Drive folder for an authority under "עיריות - חוזים".
 * Creates the folder if it does not yet exist.
 *
 * Response: { folderId: string, folderUrl: string, created: boolean }
 */
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import {
  getDriveClient,
  PRIMARY_MAILBOX,
  AUTHORITIES_ROOT_FOLDER_ID,
} from '@/lib/google-service-account';

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const authorityId = searchParams.get('authorityId');
  if (!authorityId) {
    return NextResponse.json({ error: 'authorityId is required' }, { status: 400 });
  }

  try {
    // Resolve authority name from Firestore
    const db = getAdminDb();
    const docSnap = await db.collection('authorities').doc(authorityId).get();
    if (!docSnap.exists) {
      return NextResponse.json({ error: 'Authority not found' }, { status: 404 });
    }
    const authorityName: string = docSnap.data()?.name ?? authorityId;

    const drive = await getDriveClient(PRIMARY_MAILBOX);

    // Search for existing folder by name under AUTHORITIES_ROOT_FOLDER_ID
    const searchRes = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and name='${authorityName.replace(/'/g, "\\'")}' and '${AUTHORITIES_ROOT_FOLDER_ID}' in parents and trashed=false`,
      fields: 'files(id,name,webViewLink)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const existing = searchRes.data.files?.[0];
    if (existing) {
      return NextResponse.json({
        folderId: existing.id,
        folderUrl: existing.webViewLink,
        created: false,
        authorityName,
      });
    }

    // Create folder
    const createRes = await drive.files.create({
      requestBody: {
        name: authorityName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [AUTHORITIES_ROOT_FOLDER_ID],
      },
      fields: 'id,name,webViewLink',
      supportsAllDrives: true,
    });

    return NextResponse.json({
      folderId: createRes.data.id,
      folderUrl: createRes.data.webViewLink,
      created: true,
      authorityName,
    });
  } catch (err: any) {
    console.error('[drive/authority-folder]', err?.message ?? err);
    return NextResponse.json(
      { error: err?.message ?? 'Drive API error' },
      { status: 500 }
    );
  }
}
