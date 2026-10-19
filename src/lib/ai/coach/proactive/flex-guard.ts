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
/** Singular address of any gender (an unknown-gender user is addressed impersonally only). */
const SINGULAR_ADDRESS = /(?:^|[\s,])(?:אתה|את(?=\s+(?:יכולה|ממשיכה|עושה|בונה|מתקדמת))|לך|שלך|בך|אותך|קח|קחי|תעשה|תעשי|תרוץ|תרוצי)(?=$|[\s,.!])/;
/** Masculine singular commands that are wrong for a female user. */
const MASC_COMMAND = /(?:^|[\s,])(?:קח|תעשה|תרוץ|תשמור)(?=$|[\s,.!])/;
/** No weekday names (the model sometimes adds one that isn't today). */
const WEEKDAY = /יום\s+(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)|ביום\s+(?:ראשון|שני|שלישי|רביעי|חמישי|שישי)/;

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
  if (WEEKDAY.test(s)) return null;
  if (gender === 'female' && (MASC_ADDRESS.test(s) || MASC_COMMAND.test(s))) return null;
  if (gender === 'other' && (MASC_ADDRESS.test(s) || FEM_ADDRESS.test(s) || SINGULAR_ADDRESS.test(s))) return null;
  return s;
}
