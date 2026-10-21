/**
 * K0 F8 — the empty "מה קלי זוכר" screen says that memory updates overnight, from what the user
 * told Kelly, and that the plan itself is read from the app. Gender-free (no אתה / את forms).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MEMORY_EMPTY_EXPLAINER, MEMORY_EMPTY_TITLE } from '../services/memory-copy';

describe('KellyMemorySheet empty state', () => {
  it('explains the overnight update and what is (not) kept here', () => {
    expect(MEMORY_EMPTY_EXPLAINER).toContain('פעם בלילה');
    expect(MEMORY_EMPTY_EXPLAINER).toContain('פציעות, לו״ז, יעדים והעדפות');
    expect(MEMORY_EMPTY_EXPLAINER).toContain('קלי רואה ישר מהאפליקציה');
  });

  it('is gender-free: no second-person gendered forms, no slash forms, no dashes', () => {
    const text = `${MEMORY_EMPTY_TITLE} ${MEMORY_EMPTY_EXPLAINER}`;
    // ("את התוכנית" is the object marker, not "you"; the second-person forms are checked by word.)
    expect(text).not.toMatch(/(^|\s)(אתה|סיפרת|תספר|תספרי)(\s|$)|\/|[–—]/);
  });

  it('the sheet renders both lines in the empty state', () => {
    const src = readFileSync(join(__dirname, '../components/KellyMemorySheet.tsx'), 'utf8');
    expect(src).toContain('{MEMORY_EMPTY_TITLE}');
    expect(src).toContain('{MEMORY_EMPTY_EXPLAINER}');
  });
});
