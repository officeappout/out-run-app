/**
 * Machine caller check for the review run route: `Authorization: Bearer <AI_REVIEW_CRON_SECRET>`
 * (set the same value in Vercel env and as the Cloud Functions secret). Constant-time; a
 * missing or short secret disables this path entirely (super admins can still run it).
 */
import 'server-only';
import { timingSafeEqual } from 'crypto';

export function isReviewCronCaller(request: Request, secret = process.env.AI_REVIEW_CRON_SECRET): boolean {
  if (!secret || secret.length < 16) return false;
  const header = request.headers.get('authorization') ?? '';
  const presented = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (presented.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(presented), Buffer.from(secret));
}
