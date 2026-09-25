/**
 * declareUnit() — the sole client-side caller of POST /api/units/declare
 * (Slice B, 25.09.2026, see docs/audit-2026-09/00-MASTER-PLAN.md §13.25).
 * Called from HierarchySearchStep.tsx's "סיום" button — the ONE component
 * both onboarding (PersonaStep -> PersonaQuestionsDrawer) and Settings'
 * "הפרסונות שלי" (MyPersonasSection -> the same PersonaQuestionsDrawer)
 * already share, so wiring the call in here — not in either host — is what
 * makes it automatically a single write path for both entry points; no
 * host-specific code needed.
 *
 * Never silent: every outcome resolves to a Hebrew message the caller can
 * show directly, distinguishing a real server rejection (already a Hebrew
 * message from the endpoint — unit not found, rate limited, org not
 * supported) from a network-level failure (fetch itself throwing, or a
 * non-JSON response) that never reached the server at all.
 */
import { auth } from '@/lib/firebase';

export interface DeclareUnitResult {
  ok: boolean;
  tenantType?: string;
  unitPath?: string[];
  /** Hebrew, user-facing — present whenever ok is false. */
  error?: string;
}

const NOT_SIGNED_IN_MESSAGE = 'משתמש לא מחובר. רענן את הדף ונסה שוב.';
const NETWORK_ERROR_MESSAGE = 'בעיית תקשורת. בדוק את החיבור לאינטרנט ונסה שוב.';
const GENERIC_SERVER_ERROR_MESSAGE = 'שמירת ההצהרה נכשלה. נסה שוב.';

export async function declareUnit(orgId: string, unitId: string): Promise<DeclareUnitResult> {
  let token: string | undefined;
  try {
    token = await auth.currentUser?.getIdToken();
  } catch {
    token = undefined;
  }
  if (!token) {
    return { ok: false, error: NOT_SIGNED_IN_MESSAGE };
  }

  let res: Response;
  try {
    res = await fetch('/api/units/declare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ orgId, unitId }),
    });
  } catch {
    // Never reached the server at all — distinct message from a real
    // rejection, since "try again" means something different here (check
    // your connection) than for a 400/429 (pick a different unit / wait).
    return { ok: false, error: NETWORK_ERROR_MESSAGE };
  }

  const data = await res.json().catch(() => ({} as Record<string, unknown>));

  if (!res.ok) {
    const serverMessage = typeof (data as { error?: unknown }).error === 'string'
      ? (data as { error: string }).error
      : null;
    return { ok: false, error: serverMessage ?? GENERIC_SERVER_ERROR_MESSAGE };
  }

  const body = data as { tenantType?: unknown; unitPath?: unknown };
  return {
    ok: true,
    tenantType: typeof body.tenantType === 'string' ? body.tenantType : undefined,
    unitPath: Array.isArray(body.unitPath) ? body.unitPath.filter((s): s is string => typeof s === 'string') : undefined,
  };
}
