/**
 * Single source of truth for the Terms of Use and Privacy Policy (Hebrew source text lives in
 * src/messages/he/legal.json under termsDoc.* / privacyDoc.*, built here into the LegalDoc tree)
 * shown in onboarding (HealthDeclarationStep) AND in Settings (Compliance
 * Phase 5.2). Update text here only — both surfaces re-render automatically.
 *
 * When you bump a non-trivial clause, also bump `LEGAL_VERSION` so the
 * onboarding flow records the version the user signed (`termsVersion`
 * field on the user doc) — this is required for re-consent prompts when
 * we change the policy in a way that affects existing users.
 *
 * ── Multi-paragraph & sub-clause support (RTL-safe) ─────────────────
 * The `body` field accepts EITHER:
 *   • a single string  → renders as one paragraph
 *   • an array of strings → each entry renders as its own <p> block,
 *     preserving Hebrew RTL flow (no need for `\n\n` hacks).
 *
 * Sections may also include `subsections` for nested numbered clauses
 * (e.g. "1.1 הגדרות", "1.2 תחולה"). The renderer applies the same
 * RTL container so Hebrew, mixed numerals, and inline LTR fragments
 * (URLs, brand names) all flow correctly.
 *
 * When the legal team supplies the final approved Hebrew text, just
 * paste each numbered clause as its own key in src/messages/he/legal.json —
 * no markdown / HTML conversion required.
 */

import type { NamespaceKey } from '@/lib/i18n/catalogs';
import type { legal } from '@/messages/ns/legal';

export const LEGAL_VERSION = '2.4';
export const LEGAL_LAST_UPDATED_HE = 'אוקטובר 2026'; // i18n-allow-hebrew: date label — formatting stays in code (wave 3 fmt)

/** Either a single paragraph or an ordered list of paragraphs. */
export type LegalParagraphs = string | string[];

export interface LegalSubsection {
  /** Sub-numbered heading, e.g. "1.1 הגדרות". */
  title: string;
  /** Paragraph or paragraphs of body copy. */
  body: LegalParagraphs;
}

export interface LegalSection {
  /** Numbered heading, e.g. "1. כללי". */
  title: string;
  /** Paragraph or paragraphs of body copy. */
  body: LegalParagraphs;
  /** Optional nested numbered sub-clauses (1.1, 1.2…). */
  subsections?: LegalSubsection[];
}

export interface LegalDoc {
  /** Hebrew title shown in the modal header. */
  title: string;
  /** Lead paragraph(s) above the numbered sections. */
  intro: LegalParagraphs;
  sections: LegalSection[];
}

/**
 * Normalize a `LegalParagraphs` value into an array so renderers can
 * always `.map()` without branching. Empty / whitespace-only entries
 * are dropped so blank lines in the source data do not produce stray
 * empty `<p>` tags.
 */
export function toParagraphs(body: LegalParagraphs): string[] {
  const arr = Array.isArray(body) ? body : [body];
  return arr.map((p) => p.trim()).filter((p) => p.length > 0);
}

/** Any translator bound to the `legal` namespace (useT, makeT, getT). */
export type LegalT = (key: NamespaceKey<typeof legal>) => string;

/** Terms of Use (v2.1 text). `t` is the `legal` namespace translator (useT / makeT / getT). */
export function buildTermsDoc(t: LegalT): LegalDoc {
  return {
    title: t('termsDoc.title'),
    intro: t('termsDoc.intro.p1'),
    sections: [
      {
        title: t('termsDoc.s1.title'),
        body: [
          t('termsDoc.s1.p1'),
          t('termsDoc.s1.p2'),
          t('termsDoc.s1.p3'),
          t('termsDoc.s1.p4'),
        ],
      },
      {
        title: t('termsDoc.s2.title'),
        body: [
          t('termsDoc.s2.p1'),
          t('termsDoc.s2.p2'),
          t('termsDoc.s2.p3'),
        ],
      },
      {
        title: t('termsDoc.s3.title'),
        body: [
          t('termsDoc.s3.p1'),
          t('termsDoc.s3.p2'),
          t('termsDoc.s3.p3'),
        ],
      },
      {
        title: t('termsDoc.s4.title'),
        body: '',
        subsections: [
          {
            title: t('termsDoc.s4.u1.title'),
            body: [
              t('termsDoc.s4.u1.p1'),
              t('termsDoc.s4.u1.p2'),
              t('termsDoc.s4.u1.p3'),
            ],
          },
          {
            title: t('termsDoc.s4.u2.title'),
            body: [
              t('termsDoc.s4.u2.p1'),
            ],
          },
        ],
      },
      {
        title: t('termsDoc.s5.title'),
        body: [
          t('termsDoc.s5.p1'),
          t('termsDoc.s5.p2'),
          t('termsDoc.s5.p3'),
          t('termsDoc.s5.p4'),
          t('termsDoc.s5.p5'),
          t('termsDoc.s5.p6'),
          t('termsDoc.s5.p7'),
        ],
      },
      {
        title: t('termsDoc.s6.title'),
        body: [
          t('termsDoc.s6.p1'),
          t('termsDoc.s6.p2'),
          t('termsDoc.s6.p3'),
        ],
      },
      {
        title: t('termsDoc.s7.title'),
        body: '',
        subsections: [
          {
            title: t('termsDoc.s7.u1.title'),
            body: [
              t('termsDoc.s7.u1.p1'),
            ],
          },
          {
            title: t('termsDoc.s7.u2.title'),
            body: [
              t('termsDoc.s7.u2.p1'),
              t('termsDoc.s7.u2.p2'),
              t('termsDoc.s7.u2.p3'),
              t('termsDoc.s7.u2.p4'),
            ],
          },
          {
            title: t('termsDoc.s7.u3.title'),
            body: [
              t('termsDoc.s7.u3.p1'),
            ],
          },
          {
            title: t('termsDoc.s7.u4.title'),
            body: [
              t('termsDoc.s7.u4.p1'),
            ],
          },
        ],
      },
      {
        title: t('termsDoc.s8.title'),
        body: [
          t('termsDoc.s8.p1'),
          t('termsDoc.s8.p2'),
          t('termsDoc.s8.p3'),
          t('termsDoc.s8.p4'),
          t('termsDoc.s8.p5'),
          t('termsDoc.s8.p6'),
          t('termsDoc.s8.p7'),
        ],
      },
      {
        title: t('termsDoc.s9.title'),
        body: '',
        subsections: [
          {
            title: t('termsDoc.s9.u1.title'),
            body: [
              t('termsDoc.s9.u1.p1'),
            ],
          },
          {
            title: t('termsDoc.s9.u2.title'),
            body: [
              t('termsDoc.s9.u2.p1'),
            ],
          },
          {
            title: t('termsDoc.s9.u3.title'),
            body: [
              t('termsDoc.s9.u3.p1'),
            ],
          },
        ],
      },
      {
        title: t('termsDoc.s10.title'),
        body: [
          t('termsDoc.s10.p1'),
          t('termsDoc.s10.p2'),
          t('termsDoc.s10.p3'),
          t('termsDoc.s10.p4'),
        ],
      },
      {
        title: t('termsDoc.s11.title'),
        body: [
          t('termsDoc.s11.p1'),
        ],
      },
      {
        title: t('termsDoc.s12.title'),
        body: [
          t('termsDoc.s12.p1'),
          t('termsDoc.s12.p2'),
          t('termsDoc.s12.p3'),
          t('termsDoc.s12.p4'),
        ],
      },
      {
        title: t('termsDoc.s13.title'),
        body: [
          t('termsDoc.s13.p1'),
        ],
      },
      {
        title: t('termsDoc.s14.title'),
        body: [
          t('termsDoc.s14.p1'),
          t('termsDoc.s14.p2'),
          t('termsDoc.s14.p3'),
        ],
      },
    ],
  };
}

/** Privacy Policy. */
export function buildPrivacyDoc(t: LegalT): LegalDoc {
  return {
    title: t('privacyDoc.title'),
    intro: t('privacyDoc.intro.p1'),
    sections: [
      {
        title: t('privacyDoc.s1.title'),
        body: [
          t('privacyDoc.s1.p1'),
          t('privacyDoc.s1.p2'),
        ],
      },
      {
        title: t('privacyDoc.s2.title'),
        body: '',
        subsections: [
          {
            title: t('privacyDoc.s2.u1.title'),
            body: [
              t('privacyDoc.s2.u1.p1'),
              t('privacyDoc.s2.u1.p2'),
              t('privacyDoc.s2.u1.p3'),
              t('privacyDoc.s2.u1.p4'),
              t('privacyDoc.s2.u1.p5'),
            ],
          },
          {
            title: t('privacyDoc.s2.u2.title'),
            body: [
              t('privacyDoc.s2.u2.p1'),
              t('privacyDoc.s2.u2.p2'),
              t('privacyDoc.s2.u2.p3'),
            ],
          },
          {
            title: t('privacyDoc.s2.u3.title'),
            body: [
              t('privacyDoc.s2.u3.p1'),
              t('privacyDoc.s2.u3.p2'),
              t('privacyDoc.s2.u3.p3'),
            ],
          },
          {
            title: t('privacyDoc.s2.u4.title'),
            body: [
              t('privacyDoc.s2.u4.p1'),
              t('privacyDoc.s2.u4.p2'),
              t('privacyDoc.s2.u4.p3'),
            ],
          },
        ],
      },
      {
        title: t('privacyDoc.s3.title'),
        body: '',
        subsections: [
          {
            title: t('privacyDoc.s3.u1.title'),
            body: [
              t('privacyDoc.s3.u1.p1'),
              t('privacyDoc.s3.u1.p2'),
              t('privacyDoc.s3.u1.p3'),
            ],
          },
          {
            title: t('privacyDoc.s3.u2.title'),
            body: [
              t('privacyDoc.s3.u2.p1'),
              t('privacyDoc.s3.u2.p2'),
            ],
          },
          {
            title: t('privacyDoc.s3.u3.title'),
            body: [
              t('privacyDoc.s3.u3.p1'),
              t('privacyDoc.s3.u3.p2'),
              t('privacyDoc.s3.u3.p3'),
              t('privacyDoc.s3.u3.p4'),
              t('privacyDoc.s3.u3.p5'),
              t('privacyDoc.s3.u3.p6'),
              t('privacyDoc.s3.u3.p7'),
              t('privacyDoc.s3.u3.p8'),
              t('privacyDoc.s3.u3.p9'),
              t('privacyDoc.s3.u3.p10'),
            ],
          },
        ],
      },
      {
        title: t('privacyDoc.s4.title'),
        body: [
          t('privacyDoc.s4.p1'),
          t('privacyDoc.s4.p2'),
          t('privacyDoc.s4.p3'),
          t('privacyDoc.s4.p4'),
          t('privacyDoc.s4.p5'),
          t('privacyDoc.s4.p6'),
        ],
      },
      {
        title: t('privacyDoc.s5.title'),
        body: [
          t('privacyDoc.s5.p1'),
          t('privacyDoc.s5.p2'),
          t('privacyDoc.s5.p3'),
          t('privacyDoc.s5.p4'),
          t('privacyDoc.s5.p5'),
        ],
      },
      {
        title: t('privacyDoc.s6.title'),
        body: t('privacyDoc.s6.p1'),
        subsections: [
          {
            title: t('privacyDoc.s6.u1.title'),
            body: [
              t('privacyDoc.s6.u1.p1'),
              t('privacyDoc.s6.u1.p2'),
              t('privacyDoc.s6.u1.p3'),
              t('privacyDoc.s6.u1.p4'),
              t('privacyDoc.s6.u1.p5'),
              t('privacyDoc.s6.u1.p6'),
              t('privacyDoc.s6.u1.p7'),
              t('privacyDoc.s6.u1.p8'),
            ],
          },
          {
            title: t('privacyDoc.s6.u2.title'),
            body: [
              t('privacyDoc.s6.u2.p1'),
              t('privacyDoc.s6.u2.p2'),
              t('privacyDoc.s6.u2.p3'),
              t('privacyDoc.s6.u2.p4'),
            ],
          },
          {
            title: t('privacyDoc.s6.u3.title'),
            body: [
              t('privacyDoc.s6.u3.p1'),
              t('privacyDoc.s6.u3.p2'),
              t('privacyDoc.s6.u3.p3'),
              t('privacyDoc.s6.u3.p4'),
            ],
          },
        ],
      },
      {
        title: t('privacyDoc.s7.title'),
        body: [
          t('privacyDoc.s7.p1'),
          t('privacyDoc.s7.p2'),
          t('privacyDoc.s7.p3'),
          t('privacyDoc.s7.p4'),
          t('privacyDoc.s7.p5'),
        ],
      },
      {
        title: t('privacyDoc.s8.title'),
        body: [
          t('privacyDoc.s8.p1'),
          t('privacyDoc.s8.p2'),
          t('privacyDoc.s8.p3'),
          t('privacyDoc.s8.p4'),
          t('privacyDoc.s8.p5'),
        ],
      },
      {
        title: t('privacyDoc.s9.title'),
        body: '',
        subsections: [
          {
            title: t('privacyDoc.s9.u1.title'),
            body: [
              t('privacyDoc.s9.u1.p1'),
            ],
          },
          {
            title: t('privacyDoc.s9.u2.title'),
            body: [
              t('privacyDoc.s9.u2.p1'),
              t('privacyDoc.s9.u2.p2'),
              t('privacyDoc.s9.u2.p3'),
              t('privacyDoc.s9.u2.p4'),
              t('privacyDoc.s9.u2.p5'),
              t('privacyDoc.s9.u2.p6'),
            ],
          },
          {
            title: t('privacyDoc.s9.u3.title'),
            body: [
              t('privacyDoc.s9.u3.p1'),
              t('privacyDoc.s9.u3.p2'),
            ],
          },
          {
            title: t('privacyDoc.s9.u4.title'),
            body: [
              t('privacyDoc.s9.u4.p1'),
              t('privacyDoc.s9.u4.p2'),
            ],
          },
        ],
      },
      {
        title: t('privacyDoc.s10.title'),
        body: [
          t('privacyDoc.s10.p1'),
          t('privacyDoc.s10.p2'),
        ],
      },
      {
        title: t('privacyDoc.s11.title'),
        body: [
          t('privacyDoc.s11.p1'),
          t('privacyDoc.s11.p2'),
          t('privacyDoc.s11.p3'),
        ],
      },
      {
        title: t('privacyDoc.s12.title'),
        body: [
          t('privacyDoc.s12.p1'),
          t('privacyDoc.s12.p2'),
          t('privacyDoc.s12.p3'),
          t('privacyDoc.s12.p4'),
          t('privacyDoc.s12.p5'),
          t('privacyDoc.s12.p6'),
          t('privacyDoc.s12.p7'),
          t('privacyDoc.s12.p8'),
          t('privacyDoc.s12.p9'),
          t('privacyDoc.s12.p10'),
        ],
      },
      {
        title: t('privacyDoc.s13.title'),
        body: [
          t('privacyDoc.s13.p1'),
          t('privacyDoc.s13.p2'),
          t('privacyDoc.s13.p3'),
          t('privacyDoc.s13.p4'),
          t('privacyDoc.s13.p5'),
          t('privacyDoc.s13.p6'),
          t('privacyDoc.s13.p7'),
        ],
      },
      {
        title: t('privacyDoc.s14.title'),
        body: [
          t('privacyDoc.s14.p1'),
        ],
      },
      {
        title: t('privacyDoc.s15.title'),
        body: [
          t('privacyDoc.s15.p1'),
          t('privacyDoc.s15.p2'),
          t('privacyDoc.s15.p3'),
        ],
      },
    ],
  };
}
