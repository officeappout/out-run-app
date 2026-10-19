/**
 * Kelly phase 3 — is a model-written flex sentence safe to send as is? Pure.
 * Anything doubtful → null (the deterministic template sentence is used instead).
 */
import { findFeminineSelfReferences } from '../gender-voice';
import type { CoachGender } from '../persona';
import { FORBIDDEN_COPY } from './templates';

export const FLEX_MAX_CHARS = 120;

/** Second-person forms that give the user's gender away (for a user of the other / unknown gender). */
const MASC_ADDRESS = /(?:^|[\s,])(?:אתה|לך\s+תתחיל|תתחיל|תמשיך|תנסה)(?=$|[\s,.!])/;
const FEM_ADDRESS = /(?:^|[\s,])(?:תתחילי|תמשיכי|תנסי|יכולה|מוכנה)(?=$|[\s,.!])/;

export function validateFlexSentence(raw: string, gender: CoachGender): string | null {
  let s = (raw ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().replace(/^["״'“]+|["״'”]+$/g, '').trim();
  if (!s) return null;
  if (s.length > FLEX_MAX_CHARS) return null;
  if (!/[א-ת]/.test(s)) return null;
  if (/[A-Za-z0-9]/.test(s)) return null;
  if (FORBIDDEN_COPY.test(s)) return null;
  if (/[?؟]/.test(s)) return null;
  // One sentence: at most one terminal mark, at the end.
  const marks = s.match(/[.!]/g) ?? [];
  if (marks.length > 1) return null;
  if (!/[.!]$/.test(s)) s = `${s}.`;
  if (findFeminineSelfReferences(s, gender).length) return null;
  if (gender === 'male' && FEM_ADDRESS.test(s)) return null;
  if (gender === 'female' && MASC_ADDRESS.test(s)) return null;
  if (gender === 'other' && (MASC_ADDRESS.test(s) || FEM_ADDRESS.test(s))) return null;
  return s;
}
