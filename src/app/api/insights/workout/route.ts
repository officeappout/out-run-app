/**
 * POST /api/insights/workout — Kelly's post-workout lines (enable_workout_insights_v1).
 *
 * Body: WorkoutInsightRequestSchema (a compact summary of the finished workout).
 * 200 → { insight, funny } (either may be null). Anything else → the screen shows no line.
 *
 * Gate, in order (nothing is spent before every check passes):
 *   1. verifyAiRequest without its rate limit: token, adult only (minors excluded), Kelly's AI
 *      entitlement (canUseAi), the app_config/ai kill switch + daily budget            → 401/403/503
 *   2. enable_workout_insights_v1 (stored value; super admins preview it)               → 404
 *   3. cache per workout (ai_workout_insights/{uid}_{key}) → a hit costs nothing
 *   4. the per-user AI rate limit, only on a cache miss (team exempt, as in verifyAiRequest) → 429
 *   5. one fast-model call (≤ 6s), lines validated, cached on success
 */
import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { checkAiRateLimit } from '@/lib/ai/anthropic.server';
import { aiDenialResponse, isAiRateLimitExempt, verifyAiRequest } from '@/lib/ai/verify-ai-request.server';
import { coachGenderOf } from '@/lib/ai/coach/persona';
import { workoutInsightsOnFor } from '@/lib/ai/insights/gate';
import { WorkoutInsightRequestSchema } from '@/lib/ai/insights/schema';
import { bodyweightVolumeKg } from '@/lib/ai/insights/volume';
import { readCachedInsight, writeCachedInsight } from '@/lib/ai/insights/cache.server';
import { generateWorkoutInsight } from '@/lib/ai/insights/generate.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function POST(request: Request) {
  const parsed = WorkoutInsightRequestSchema.safeParse(await request.json().catch(() => null));
  const auth = await verifyAiRequest(request, { rateLimit: false });
  if (!auth.ok) return aiDenialResponse(auth);
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  const { uid, profile, config } = auth;
  if (!workoutInsightsOnFor(auth.flags, profile.core?.isSuperAdmin === true)) {
    return NextResponse.json({ error: 'not_enabled' }, { status: 404 });
  }

  const body = parsed.data;
  const db = getAdminDb();
  const hit = await readCachedInsight(db, uid, body.key);
  if (hit) return NextResponse.json(hit);

  if (!isAiRateLimitExempt(null, profile)) {
    try {
      const rl = await checkAiRateLimit(uid, config, db);
      if (rl.limited) {
        return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });
      }
    } catch {
      return NextResponse.json({ error: 'unavailable' }, { status: 503 });
    }
  }

  const gender = coachGenderOf(profile.core?.gender);
  const volumeKg = body.kind === 'strength' ? bodyweightVolumeKg(body.exercises, profile.core?.weight) : null;
  const { lines, model, ok } = await generateWorkoutInsight(uid, body, gender, volumeKg);
  if (ok) await writeCachedInsight(db, uid, body.key, lines, model);
  return NextResponse.json(lines);
}
