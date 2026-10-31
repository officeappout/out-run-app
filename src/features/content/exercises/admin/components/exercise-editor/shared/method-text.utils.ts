/**
 * Execution-method text helpers for the admin editor.
 *
 * methodName and notificationText are stored as LocalizedText { he, en }.
 * The editor must keep BOTH slots through load → edit → save, otherwise the
 * save path writes { he, en: '' } over the English copy.
 */
import type { GenderedText, LocalizedText } from '../../../../core/exercise.types';

type MethodNameValue = LocalizedText | string | null | undefined;
type NotificationValue = LocalizedText | GenderedText | string | null | undefined;

function hasLangSlot(value: unknown): value is Partial<LocalizedText> {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.he === 'string' || typeof v.en === 'string';
}

/** Any stored methodName shape → LocalizedText, keeping both slots. */
export function toLocalizedMethodName(raw: unknown): LocalizedText {
  if (hasLangSlot(raw)) {
    return { ...(raw as LocalizedText), he: raw.he ?? '', en: raw.en ?? '' };
  }
  if (typeof raw === 'string') return { he: raw, en: '' };
  return { he: '', en: '' };
}

/** Display label for headers/lists (Hebrew first, English fallback). */
export function methodNameLabel(raw: MethodNameValue): string {
  const name = toLocalizedMethodName(raw);
  return name.he || name.en || '';
}

/** Duplicate suffix on each filled slot. */
export function duplicateMethodName(raw: MethodNameValue, fallback: string): LocalizedText {
  const name = toLocalizedMethodName(raw);
  return {
    ...name,
    he: `${name.he || fallback} (עותק)`,
    en: name.en ? `${name.en} (copy)` : '',
  };
}

/** The English notification text, '' when the field has no EN slot yet. */
export function notificationEn(value: NotificationValue): string {
  return hasLangSlot(value) ? value.en ?? '' : '';
}

/**
 * Gender-split Hebrew ({ male, female }) has no EN slot. Writing EN would have
 * to drop the split, so the EN tab leaves such values read-only.
 */
export function isGenderSplitNotification(value: NotificationValue): boolean {
  return !!value && typeof value === 'object' && !hasLangSlot(value);
}

/**
 * Write the EN slot of notificationText without touching the Hebrew copy.
 * A legacy plain string becomes the HE slot. Callers skip gender-split values.
 */
export function withNotificationEn(value: NotificationValue, en: string): LocalizedText {
  if (hasLangSlot(value)) {
    return { ...(value as LocalizedText), he: value.he ?? '', en };
  }
  return { he: typeof value === 'string' ? value : '', en };
}
