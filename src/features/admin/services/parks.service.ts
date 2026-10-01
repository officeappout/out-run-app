/**
 * Parks Service for Authority Managers
 *
 * 30.09.2026 (00-MASTER-PLAN.md §13.56, stage 3) — createPark/updatePark
 * were direct client-SDK writes, gated only by firestore.rules'
 * allow write: if isAdmin() — which does not admit authority_manager. The
 * role-branching that used to live here (authority_manager → pending_review
 * or createEditRequest; root → publish directly) is GONE: that decision is
 * now made server-side, in park-write.service.ts, from the caller's
 * Bearer-token-verified identity — never from a client-supplied adminInfo
 * or options.forcePendingReview (both parameters are kept, unused, purely
 * so ParkForm.tsx/LocationEditor.tsx need zero changes to keep compiling;
 * the actual identity is re-derived server-side from the caller's own ID
 * token on every request regardless of what's passed here).
 *
 * David's decision, 30.09.2026: authority_manager's create/edit now
 * publishes immediately — no more pending_review gate, no more
 * createEditRequest. Citizen-contribution approval (user_contributions)
 * was untouched here at the time — stage 4 (01.10.2026) closed it
 * separately: contribution-write.service.ts, routed from
 * moderation.service.ts, not through this file. approveNewLocation no
 * longer exists.
 *
 * audit_logs writes also moved — they happen server-side, inside
 * computeParkCreate/computeParkUpdate, not via a client-side logAction()
 * call from here.
 */
export {
  getAllParks,
  getParksByAuthority,
  getParksByNeighborhood,
  getPark,
  deletePark,
  approvePark,
  fetchRealParks,
} from '@/features/parks/core/services/parks.service';

import { auth } from '@/lib/firebase';
import { Park } from '@/types/admin-types';

async function getIdTokenOrThrow(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('לא מחובר — אין אפשרות לשמור.');
  return user.getIdToken();
}

async function parseErrorBody(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body?.error || `שגיאת שרת (${res.status})`;
  } catch {
    return `שגיאת שרת (${res.status})`;
  }
}

/**
 * Create a new park via the server-side write chokepoint
 * (/api/admin/parks). `adminInfo`/`options` are accepted but unused — kept
 * for call-site compatibility only; the server derives the real caller
 * from the Bearer token on every request.
 */
export async function createPark(
  data: Omit<Park, 'id' | 'createdAt' | 'updatedAt'>,
  _adminInfo?: { adminId: string; adminName: string },
  _options?: { forcePendingReview?: boolean }
): Promise<string> {
  const idToken = await getIdTokenOrThrow();
  const res = await fetch('/api/admin/parks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await parseErrorBody(res));
  const body = await res.json();
  return body.parkId as string;
}

/**
 * Update a park via the server-side write chokepoint
 * (/api/admin/parks/[parkId]). `adminInfo` is accepted but unused — same
 * reason as createPark above.
 */
export async function updatePark(
  parkId: string,
  data: Partial<Omit<Park, 'id' | 'createdAt' | 'updatedAt'>>,
  _adminInfo?: { adminId: string; adminName: string }
): Promise<void> {
  const idToken = await getIdTokenOrThrow();
  const res = await fetch(`/api/admin/parks/${encodeURIComponent(parkId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await parseErrorBody(res));
}
