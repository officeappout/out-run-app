/**
 * POST /api/scan/equipment — camera scan (enable_equipment_scan_v1, owner 31.10.2026; 404 while
 * the flag is off, except for the OUT team who preview it).
 *
 *   { image: base64 JPEG/PNG/WebP (the client resizes to ≤1024px and re-encodes, which drops
 *     EXIF), mediaType, mode: 'single' | 'park', parkId? }
 *   → { result: ScanPhotoResult, verdict?: ScanVerdict (single mode) }
 *
 * Gate: verifyAiRequest({ access: 'open' }) — every signed-in user, teens included (owner
 * 31.10); the AI kill switch and daily budget still apply. Then the scan's own per-user limit
 * (app_config/ai scanPerHour / scanPerDay, fail-closed) and App Check (log-only until
 * scanAppCheckEnforce). The photo is never stored or logged.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { checkRateLimit } from '@/lib/rateLimit';
import { passesAppCheck } from '@/lib/app-check.server';
import { aiDenialResponse, verifyAiRequest } from '@/lib/ai/verify-ai-request.server';
import { buildScanCandidates } from '@/lib/ai/scan/scan-candidates';
import { loadParkEquipmentIds, loadReferencePhotos, loadScanCatalog, loadVisualIndex } from '@/lib/ai/scan/scan-catalog.server';
import { singleVerdict } from '@/lib/ai/scan/scan-result';
import { identifyEquipment } from '@/lib/ai/scan/scan.server';
import { SCAN_MODES } from '@/lib/ai/scan/scan-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** ~2.6 MB of image bytes; a 1024px JPEG is ~150-300 KB. Vercel's body cap is 4.5 MB. */
const MAX_BASE64 = 3_500_000;
const HOUR = 3_600_000;

const BodySchema = z.object({
  image: z.string().min(100).max(MAX_BASE64).regex(/^[A-Za-z0-9+/=]+$/),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  mode: z.enum(SCAN_MODES),
  parkId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/).optional(),
});

export async function POST(request: Request) {
  const auth = await verifyAiRequest(request, { access: 'open' });
  if (!auth.ok) return aiDenialResponse(auth);
  if (auth.flags?.enableEquipmentScanV1 !== true && !auth.team) {
    return NextResponse.json({ error: 'not_enabled' }, { status: 404 });
  }
  if (!(await passesAppCheck(request, 'scan/equipment', auth.config.scanAppCheckEnforce))) {
    return NextResponse.json({ error: 'app_check' }, { status: 401 });
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  try {
    const db = getAdminDb();
    if (!auth.team) {
      for (const [key, windowMs, maxRequests] of [
        [`scan_h_${auth.uid}`, HOUR, auth.config.scanPerHour],
        [`scan_d_${auth.uid}`, 24 * HOUR, auth.config.scanPerDay],
      ] as const) {
        const rl = await checkRateLimit(db, key, { windowMs, maxRequests, failClosed: true });
        if (rl.limited) {
          const retry = Math.ceil((rl.retryAfterMs ?? HOUR) / 1000);
          return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(retry) } });
        }
      }
    }

    const { image, mediaType, mode, parkId } = parsed.data;
    const [catalog, parkIds] = await Promise.all([loadScanCatalog(db), loadParkEquipmentIds(db, parkId)]);
    const candidates = buildScanCandidates(catalog, parkIds, loadVisualIndex(), loadReferencePhotos(new URL(request.url).origin));
    const result = await identifyEquipment(auth.uid, { data: image, mediaType }, candidates, mode);
    return NextResponse.json({ result, ...(mode === 'single' ? { verdict: singleVerdict(result) } : {}) });
  } catch (err) {
    // Never log the request body: it is the user's photo.
    console.error('[scan/equipment] failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
