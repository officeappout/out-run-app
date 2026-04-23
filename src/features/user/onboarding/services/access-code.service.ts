/**
 * Access Code Service — client-side wrapper for the validateAccessCode CF.
 */
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '@/lib/firebase';
import type { TenantType } from '@/types/admin-types';

export interface AccessCodeResult {
  tenantId: string;
  unitId: string;
  unitPath: string[];
  tenantType: TenantType;
  onboardingPath: 'MILITARY_JOIN' | 'SCHOOL_JOIN' | 'MUNICIPAL_JOIN';
}

const ACCESS_CODE_SESSION_KEY = 'access_code_result';

/**
 * Validate an access code via Cloud Function.
 * On success, persists the result in sessionStorage so the onboarding
 * wizard can consume it across steps.
 */
export async function validateAccessCode(code: string): Promise<AccessCodeResult> {
  const functions = getFunctions(app, 'us-central1');
  const callable = httpsCallable<{ code: string }, AccessCodeResult>(
    functions,
    'validateAccessCode'
  );

  try {
    const { data } = await callable({ code: code.trim().toUpperCase() });

    if (typeof window !== 'undefined') {
      sessionStorage.setItem(ACCESS_CODE_SESSION_KEY, JSON.stringify(data));
    }

    return data;
  } catch (err: any) {
    console.error('[access-code.service] validateAccessCode FAILED for:', code.trim().toUpperCase(), '| error:', err, '| message:', err?.message, '| code:', err?.code, '| details:', err?.details, '| customData:', err?.customData);
    throw err;
  }
}

/**
 * Retrieve a previously validated access code result from sessionStorage.
 * Returns null if no code was validated in this session.
 */
export function getAccessCodeResult(): AccessCodeResult | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(ACCESS_CODE_SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AccessCodeResult;
  } catch {
    return null;
  }
}

/**
 * Clear the stored access code result (e.g. after onboarding completes).
 */
export function clearAccessCodeResult(): void {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(ACCESS_CODE_SESSION_KEY);
  }
}
