/**
 * API Route: Generate & download a stamped Photo Release PDF.
 * GET /api/admin/photo-release/[submissionId]
 *
 * Admin-only. Authenticates via either:
 *   1. `Authorization: Bearer <Firebase ID token>` (verified with the Admin SDK), or
 *   2. the `out_admin_session` HMAC cookie (same credential the middleware checks).
 *
 * Reads the submission from `photo_release_submissions`, stamps the template
 * with pdf-lib, and streams back the completed `application/pdf` as an
 * attachment download.
 *
 * Node runtime is mandatory — firebase-admin, `node:fs`, and pdf-lib are all
 * Node-only and cannot run on the Edge.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, resolveIdentity } from '@/lib/firebase-admin';
import { SESSION_COOKIE_NAME, verifyAdminSession } from '@/lib/admin-session';
import { generatePhotoReleasePdf } from '@/features/forms/photo-release/services/photo-release-pdf.service';
import { PHOTO_RELEASE_COLLECTION } from '@/features/forms/photo-release/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function isAuthorizedAdmin(request: NextRequest): Promise<boolean> {
  // 1. Bearer ID token (preferred — self-contained, works in dev & prod).
  const authHeader = request.headers.get('authorization') || '';
  const bearer = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (bearer) {
    try {
      const identity = await resolveIdentity(bearer);
      if (identity.admin) return true;
    } catch (err) {
      console.warn('[photo-release] Bearer verification failed:', err);
    }
  }

  // 2. Fallback: signed admin session cookie.
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (cookie) {
    const session = await verifyAdminSession(cookie);
    if (session?.admin === true) return true;
  }

  return false;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { submissionId: string } },
) {
  const { submissionId } = params;

  if (!(await isAuthorizedAdmin(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!submissionId) {
    return NextResponse.json({ error: 'Missing submissionId' }, { status: 400 });
  }

  try {
    // ── Step 1: Fetch submission from Firestore ──
    console.log('[photo-release] Fetching submission:', submissionId);
    const snap = await getAdminDb()
      .collection(PHOTO_RELEASE_COLLECTION)
      .doc(submissionId)
      .get();

    if (!snap.exists) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    const data = snap.data() as Record<string, unknown>;
    console.log('[photo-release] Submission fetched OK, generating PDF...');

    // ── Step 2: Generate the stamped PDF ──
    const pdfBytes = await generatePhotoReleasePdf({
      studentName: String(data.studentName ?? ''),
      school: String(data.school ?? ''),
      studentClass: String(data.studentClass ?? ''),
      parentName: String(data.parentName ?? ''),
      signatureData: String(data.signatureData ?? ''),
      submittedAtClient:
        typeof data.submittedAtClient === 'string' ? data.submittedAtClient : undefined,
      createdAt: data.createdAt,
    });

    console.log('[photo-release] PDF generated OK, streaming response...');
    const filename = `photo-release-${submissionId}.pdf`;
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[PDF_GENERATION_CRASH]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate PDF' },
      { status: 500 },
    );
  }
}
