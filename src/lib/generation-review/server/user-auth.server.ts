/** Bearer Firebase ID token → uid (revocation checked). null = unauthenticated. */
import 'server-only';
import { getAdminAuth } from '@/lib/firebase-admin';

export async function uidFromRequest(request: Request): Promise<string | null> {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  try {
    return (await getAdminAuth().verifyIdToken(token, true)).uid;
  } catch {
    return null;
  }
}
