/**
 * POST /api/scan/feedback — the camera scan accuracy log (enable_equipment_scan_v1; 404 while the
 * flag is off, except for the OUT team). Detected vs confirmed / corrected items, never a photo
 * (ScanFeedbackSchema). Writes scan_feedback/{auto} with the Admin SDK: no client rule reads or
 * writes that collection. No AI call, so no AI budget; a light per-user limit (fail-open, it is
 * only a log).
 */
import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { isRootAdmin } from '@/config/feature-flags';
import { isRateLimited } from '@/lib/rateLimit';
import { getServerFeatureFlags } from '@/lib/ai/entitlement.server';
import { ScanFeedbackSchema, feedbackRecord } from '@/lib/ai/scan/scan-feedback';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HOUR = 3_600_000;
const PER_HOUR = 120;

export async function POST(request: Request) {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return NextResponse.json({ error: 'missing_token' }, { status: 401 });
  let uid: string;
  let email: string | null = null;
  try {
    const decoded = await getAdminAuth().verifyIdToken(token, true);
    uid = decoded.uid;
    email = decoded.email_verified === true && typeof decoded.email === 'string' ? decoded.email : null;
  } catch {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
  }

  const parsed = ScanFeedbackSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  try {
    const db = getAdminDb();
    const flags = await getServerFeatureFlags(db);
    if (flags.enableEquipmentScanV1 !== true && !isRootAdmin(email)) {
      const profile = await db.collection('users').doc(uid).get();
      if (profile.get('core.isSuperAdmin') !== true) return NextResponse.json({ error: 'not_enabled' }, { status: 404 });
    }
    if (await isRateLimited(db, `scan_fb_${uid}`, { windowMs: HOUR, maxRequests: PER_HOUR })) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }
    const record = feedbackRecord(uid, parsed.data, new Date());
    await db.collection('scan_feedback').add({ ...record, createdAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[scan/feedback] failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
