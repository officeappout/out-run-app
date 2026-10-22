/**
 * gate.server — WHO may use the admin-panel assistant (plan §6.1).
 *
 *   requireAdminAiCaller(request) → { uid, email, role } | NextResponse
 *
 * v1 = a PERSON who is a root admin (david@/office@) or a super admin. Never the agent key
 * (requireSuperAdminApi accepts it), never requireAdminApi/requireSection (too wide). Then the
 * dedicated flag admin_ai_assistant_v1 (default false, real value — no super-admin override).
 * Every assistant route AND every tool calls this; hiding the drawer button is not the gate
 * (axiom §26). The quick-answer endpoints use the same gate (they don't touch the AI budget).
 */
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Firestore } from 'firebase-admin/firestore';
import { requireRootOrSuperAdminPerson, type RootOrSuperAdminPerson } from '@/lib/api-auth';
import { getServerFeatureFlags } from '@/lib/ai/entitlement.server';
import { getAdminDb } from '@/lib/firebase-admin';
import { ADMIN_AI_UNAVAILABLE_HE } from './errors';

export type AdminAiCaller = RootOrSuperAdminPerson;

export async function isAdminAiFlagOn(db: Firestore = getAdminDb()): Promise<boolean> {
  // getServerFeatureFlags fails closed to FLAG_DEFS defaults (false for this flag) on a read error.
  return (await getServerFeatureFlags(db)).adminAiAssistantV1 === true;
}

export async function requireAdminAiCaller(
  request: NextRequest,
  opts: { db?: Firestore } = {},
): Promise<AdminAiCaller | NextResponse> {
  const person = await requireRootOrSuperAdminPerson(request);
  if (person instanceof NextResponse) return person;
  if (!(await isAdminAiFlagOn(opts.db ?? getAdminDb()))) {
    return NextResponse.json({ error: 'disabled', code: 'flag_off', message: ADMIN_AI_UNAVAILABLE_HE.flag_off }, { status: 403 });
  }
  return person;
}
