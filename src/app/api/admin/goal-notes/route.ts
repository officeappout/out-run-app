/**
 * GET /api/admin/goal-notes — the most recent onboarding goal notes
 * ("יש עוד משהו שחשוב לך?", the v2 program-path screen), super admin only.
 *
 * Read-only. Returns the note, its date, and the context the user gave on
 * the same screen (chosen goal, age bracket, gender) — no uid, name or
 * email. Reads users ordered by onboarding.goalNoteAt (a single-field
 * index, automatic in Firestore — docs without the field are skipped).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireSuperAdminApi } from '@/lib/api-auth';
import { AGE_BRACKET_LABELS_HE, ageBracketFor, ageFromBirthDate, type AgeBracket } from '@/features/user/onboarding/utils/goal-note';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 200;

export interface GoalNoteRow {
  /** Opaque row key (not the uid). */
  key: string;
  note: string;
  at: string | null;
  goal: 'health' | 'body_focus' | 'skills' | null;
  ageBracket: AgeBracket | null;
  gender: 'male' | 'female' | 'other' | null;
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof (v as { toDate?: () => Date }).toDate === 'function') return (v as { toDate: () => Date }).toDate();
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || DEFAULT_LIMIT, 1), 500);
    const snap = await getAdminDb()
      .collection('users')
      .orderBy('onboarding.goalNoteAt', 'desc')
      .limit(limit)
      .get();

    const rows: GoalNoteRow[] = [];
    snap.docs.forEach((d, i) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped user doc
      const data = d.data() as Record<string, any>;
      const ob = data.onboarding ?? {};
      if (typeof ob.goalNote !== 'string' || !ob.goalNote.trim()) return;
      const ctx = ob.goalNoteContext ?? {};
      const goal = ['health', 'body_focus', 'skills'].includes(ctx.goal) ? ctx.goal : null;
      const genderRaw = ctx.gender ?? data.core?.gender;
      const gender = genderRaw === 'male' || genderRaw === 'female' || genderRaw === 'other' ? genderRaw : null;
      const ageBracket: AgeBracket | null =
        typeof ctx.ageBracket === 'string' && ctx.ageBracket in AGE_BRACKET_LABELS_HE
          ? (ctx.ageBracket as AgeBracket)
          : ageBracketFor(ageFromBirthDate(toDate(data.core?.birthDate)));
      rows.push({
        key: String(i),
        note: ob.goalNote.slice(0, 300),
        at: typeof ob.goalNoteAt === 'string' ? ob.goalNoteAt : null,
        goal,
        ageBracket,
        gender,
      });
    });

    return NextResponse.json({ notes: rows });
  } catch (err) {
    console.error('[admin/goal-notes] failed:', err);
    return NextResponse.json({ error: 'שגיאה בטעינת הנתונים' }, { status: 500 });
  }
}
