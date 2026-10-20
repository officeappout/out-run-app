/**
 * Deterministic linters (design §3.3): judge the facts collected from the page (./collect.ts)
 * against the rules in ../checklist.ts. Pure, free (no LLM), confidence 1. One issue per rule
 * per screen, with up to 5 examples, so a busy screen doesn't flood the report.
 */
import type { PageFacts } from './collect';
import type { Severity } from '../findings';

export interface LintIssue {
  rule: string;
  severity: Severity;
  title: string;
  examples: string[];
}

export interface RuntimeErrors {
  console: string[];
  /** "<status> <method> <url-path>" */
  failedRequests: string[];
}

const MIN_FONT_PX = 11;
const MIN_TARGET_PX = 44;
const DARK_LUMINANCE = 0.06;

const take = (xs: string[]) => Array.from(new Set(xs.filter(Boolean))).slice(0, 5);

export function lintFacts(f: PageFacts, errors: RuntimeErrors = { console: [], failedRequests: [] }): LintIssue[] {
  const out: LintIssue[] = [];

  if (f.smallTexts.length) {
    out.push({ rule: 'V2-FONT-11', severity: 'P2', title: 'טקסט קטן מ-11px', examples: take(f.smallTexts.map((t) => `${t.px}px: ${t.text}`)) });
  }

  const wrapped = f.controls.filter((c) => c.label && !c.inlineLink && (c.lines > 1 || c.clippedNoEllipsis));
  if (wrapped.length) {
    out.push({ rule: 'V2-NOWRAP', severity: 'P2', title: 'תווית כפתור נשברת או נחתכת בלי …', examples: take(wrapped.map((c) => (c.lines > 1 ? `${c.lines} שורות: ${c.label}` : `נחתך: ${c.label}`))) });
  }

  const gradients = f.controls.filter((c) => c.gradient);
  if (gradients.length > 1) {
    out.push({ rule: 'V2-CTA-1', severity: 'P2', title: `${gradients.length} כפתורי גרדיאנט במסך אחד`, examples: take(gradients.map((c) => c.label || `${c.w}×${c.h}`)) });
  }

  if (f.emojiTexts.length) {
    out.push({ rule: 'V2-NO-EMOJI', severity: 'P2', title: 'אימוג׳י בטקסט של הממשק', examples: take(f.emojiTexts) });
  }

  const darkSelected = f.controls.filter((c) => c.selected && c.bgLuminance !== null && c.bgLuminance < DARK_LUMINANCE);
  if (darkSelected.length) {
    out.push({ rule: 'V2-SELECTED-TINT', severity: 'P2', title: 'מצב "נבחר" בצבע כהה/שחור במקום גוון המותג', examples: take(darkSelected.map((c) => c.label || `${c.w}×${c.h}`)) });
  }

  const small = f.controls.filter((c) => !c.inlineLink && (c.w < MIN_TARGET_PX || c.h < MIN_TARGET_PX));
  if (small.length) {
    out.push({ rule: 'MOB-TARGET-44', severity: 'P3', title: 'יעד מגע קטן מ-44px', examples: take(small.map((c) => `${c.w}×${c.h}: ${c.label || '(בלי תווית)'}`)) });
  }

  if (f.docScrollWidth > f.viewport.w + 1) {
    out.push({ rule: 'MOB-NO-HSCROLL', severity: 'P2', title: 'העמוד נגלל הצידה', examples: [`רוחב ${f.docScrollWidth}px במסך של ${f.viewport.w}px`] });
  }

  const denied = errors.console.filter((m) => /permission[-_ ]denied|missing or insufficient permissions/i.test(m));
  const server = errors.failedRequests.filter((r) => /^5\d\d /.test(r));
  if (denied.length || server.length) {
    out.push({ rule: 'STAB-CONSOLE', severity: 'P1', title: 'שגיאת הרשאה או שגיאת שרת', examples: take([...denied, ...server]) });
  } else if (errors.console.length || errors.failedRequests.length) {
    out.push({ rule: 'STAB-CONSOLE', severity: 'P2', title: 'שגיאות בקונסול או בקשות שנכשלו', examples: take([...errors.console, ...errors.failedRequests]) });
  }

  return out;
}

/** "/run/planned/abc123?x=1" → "/run/planned/:id" — groups the same screen across ids. */
export function routePattern(url: string): string {
  const path = url.split(/[?#]/)[0] || '/';
  return (
    path
      .split('/')
      .map((seg) => (/^[0-9]+$/.test(seg) || /^[A-Za-z0-9_-]{16,}$/.test(seg) || /^demo[_-][A-Za-z0-9_-]+$/.test(seg) ? ':id' : seg))
      .join('/') || '/'
  );
}
