/**
 * PDF Service — Health Declaration PDF Generation
 *
 * Loads the health-declaration template from /public/assets/documents/,
 * embeds the Simpler Pro font for Hebrew support, stamps userName,
 * currentDate, and the signature image onto specific coordinates,
 * then returns the final PDF bytes ready for upload.
 */
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { HEALTH_QUESTIONS } from '../data/health-questions';
import { ensureCatalog } from '@/lib/i18n/catalogs';
import { makeT } from '@/lib/i18n/t';
import { onboarding } from '@/messages/ns/onboarding';

// ── Asset paths (served by Next.js from /public) ──
const TEMPLATE_URL = '/assets/documents/health-declaration-template.pdf';
const FONT_REGULAR_URL = '/assets/fonts/SimplerPro-Regular.otf';
const FONT_BOLD_URL = '/assets/fonts/SimplerPro-Bold.otf';

// ── Coordinate map (points from bottom-left of the PDF page) ──
// A4 page = 595.28 x 841.89 points.
// RTL layout: "שם:" (Name) is on the far right, "תאריך:" (Date) on the left.
// "חתימה:" (Signature) is at the bottom of the page.
const COORDS = {
  /** Full name — placed right of center, next to the "שם:" label on the right */
  userName: { x: 480, y: 705 },
  /** Date — placed just to the right of the "תאריך:" label on the left */
  date: { x: 68, y: 705 },
  /** Signature image — bottom area, aligned under the "חתימה:" label */
  signature: { x: 320, y: 42, width: 260, height: 55 },
} as const;

// ═══════════════════════════════════════════════════
// Hebrew RTL Helpers
// ═══════════════════════════════════════════════════

/** Regex that matches any Hebrew Unicode character (U+0590–U+05FF, U+FB1D–U+FB4F) */
const HEBREW_REGEX = /[\u0590-\u05FF\uFB1D-\uFB4F]/;

/**
 * Checks if a string contains at least one Hebrew character.
 */
function containsHebrew(text: string): boolean {
  return HEBREW_REGEX.test(text);
}

/**
 * Reverses a string if it contains Hebrew characters.
 *
 * PDF text rendering is inherently LTR — when you call `drawText` with
 * Hebrew, the glyphs are placed left-to-right, which visually reverses
 * the reading order. Reversing the codepoints before drawing compensates
 * for this and makes the text appear correctly in RTL order.
 *
 * For mixed Hebrew + ASCII strings (e.g. "שלום 123"), the function
 * reverses the entire string so the Hebrew reads correctly. Numeric
 * runs are also reversed back so digits stay in the right order.
 */
export function reverseHebrew(text: string): string {
  if (!containsHebrew(text)) {
    return text; // Pure Latin / numbers — no transformation needed
  }

  // Split into an array of characters (handles multi-byte correctly)
  const chars = Array.from(text);

  // Reverse the full string for RTL
  chars.reverse();

  // Fix numeric runs that got reversed (e.g. "321" → "123")
  const result = chars.join('');
  return result.replace(/\d+/g, (match) => {
    return Array.from(match).reverse().join('');
  });
}

// ═══════════════════════════════════════════════════
// Font Loader (with cache)
// ═══════════════════════════════════════════════════

/** Cached font bytes to avoid re-fetching on repeated calls */
let cachedRegularFontBytes: ArrayBuffer | null = null;
let cachedBoldFontBytes: ArrayBuffer | null = null;

/**
 * Fetches a font file and returns its ArrayBuffer.
 * Results are cached in memory for subsequent calls.
 */
async function loadFontBytes(url: string, cache: 'regular' | 'bold'): Promise<ArrayBuffer> {
  if (cache === 'regular' && cachedRegularFontBytes) return cachedRegularFontBytes;
  if (cache === 'bold' && cachedBoldFontBytes) return cachedBoldFontBytes;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load font from ${url}: ${response.status} ${response.statusText}`);
  }
  const bytes = await response.arrayBuffer();

  if (cache === 'regular') cachedRegularFontBytes = bytes;
  if (cache === 'bold') cachedBoldFontBytes = bytes;

  return bytes;
}

// ═══════════════════════════════════════════════════
// PDF Generator
// ═══════════════════════════════════════════════════

/** Language of the text the user signed. Absent on old records = Hebrew. */
export type HealthPdfLocale = 'he' | 'en';

/**
 * Generate a signed Health Declaration PDF with embedded Simpler Pro font.
 *
 * @param userName      — The user's full name (Hebrew)
 * @param signatureB64  — Base64-encoded PNG of the signature pad (`data:image/png;base64,...`)
 * @param signedAt      — When the user signed (stamped as the date). Defaults to now; a PDF
 *                        regenerated later (health-declaration-record self-heal) passes the
 *                        ORIGINAL signing date so the document doesn't show the retry date.
 * @returns Uint8Array of the final PDF ready to upload
 */
export async function generateHealthDeclarationPdf(
  userName: string,
  signatureB64: string,
  signedAt: Date = new Date(),
  locale: HealthPdfLocale = 'he',
): Promise<Uint8Array> {
  // English: typeset from the approved English text (LTR). The Hebrew path below is untouched.
  if (locale === 'en') return generateEnglishHealthDeclarationPdf(userName, signatureB64, signedAt);

  // ── 1. Fetch the template ──
  const templateResponse = await fetch(TEMPLATE_URL);
  if (!templateResponse.ok) {
    throw new Error(
      `Failed to load PDF template: ${templateResponse.status} ${templateResponse.statusText}`,
    );
  }
  const templateBytes = await templateResponse.arrayBuffer();

  // ── 2. Load into pdf-lib ──
  const pdfDoc = await PDFDocument.load(templateBytes);

  // ── 3. Register fontkit for custom font embedding ──
  pdfDoc.registerFontkit(fontkit);

  // ── 4. Load and embed the Simpler Pro font ──
  let font;
  try {
    const fontBytes = await loadFontBytes(FONT_REGULAR_URL, 'regular');
    font = await pdfDoc.embedFont(fontBytes, { subset: true });
    console.log('[PDF Service] Simpler Pro font embedded successfully');
  } catch (fontError) {
    // Fallback: try the bold variant
    console.warn('[PDF Service] Failed to load Regular font, trying Bold:', fontError);
    try {
      const boldBytes = await loadFontBytes(FONT_BOLD_URL, 'bold');
      font = await pdfDoc.embedFont(boldBytes, { subset: true });
      console.log('[PDF Service] Simpler Pro Bold font embedded as fallback');
    } catch (boldError) {
      console.error('[PDF Service] All font loading failed:', boldError);
      throw new Error(
        'Could not load Simpler Pro font. Ensure font files exist at /public/assets/fonts/',
      );
    }
  }

  // ── 5. Get the first page ──
  const pages = pdfDoc.getPages();
  if (pages.length === 0) {
    throw new Error('PDF template has no pages');
  }
  const page = pages[0];

  const fontSize = 12;
  const textColor = rgb(0.1, 0.1, 0.1);

  // ── 6. Draw the user's name (Hebrew RTL-safe) ──
  const displayName = reverseHebrew(userName);
  page.drawText(displayName, {
    x: COORDS.userName.x,
    y: COORDS.userName.y,
    size: fontSize,
    font,
    color: textColor,
  });

  // ── 7. Draw the signing date (DD/MM/YYYY — Israeli format) ──
  const now = Number.isNaN(signedAt.getTime()) ? new Date() : signedAt;
  const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  // Date is pure numbers/slashes — no Hebrew reversal needed
  page.drawText(dateStr, {
    x: COORDS.date.x,
    y: COORDS.date.y,
    size: fontSize,
    font,
    color: textColor,
  });

  // ── 8. Embed the signature image ──
  // Strip the data URL prefix to get raw base64
  const base64Data = signatureB64.replace(/^data:image\/\w+;base64,/, '');
  const signatureBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

  // Embed as PNG (the SignaturePad always exports as image/png)
  const signatureImage = await pdfDoc.embedPng(signatureBytes);

  // Draw signature on the page
  page.drawImage(signatureImage, {
    x: COORDS.signature.x,
    y: COORDS.signature.y,
    width: COORDS.signature.width,
    height: COORDS.signature.height,
  });

  // ── 9. Serialize and return ──
  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

// ═══════════════════════════════════════════════════
// English variant (LTR, typeset — no template file)
// ═══════════════════════════════════════════════════

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Unambiguous English date ("5 Oct 2026"), independent of the runtime's Intl data. */
export function formatEnglishPdfDate(d: Date): string {
  const now = Number.isNaN(d.getTime()) ? new Date() : d;
  return `${now.getDate()} ${MONTHS_EN[now.getMonth()]} ${now.getFullYear()}`;
}

/** Greedy word wrap by measured width. */
export function wrapText(text: string, maxWidth: number, widthOf: (s: string) => number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && widthOf(next) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function generateEnglishHealthDeclarationPdf(
  userName: string,
  signatureB64: string,
  signedAt: Date,
): Promise<Uint8Array> {
  // Single source: the same catalog keys the signature screen renders (healthDeclaration.*).
  await ensureCatalog('en', 'onboarding');
  const t = makeT('en', onboarding);
  const P = (k: string) => t(`healthDeclaration.pdf.${k}` as never) as string;
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  // Simpler Pro covers Latin, so the same self-hosted font serves the English layout.
  // liga off: the subset drops ligature glyphs, which rendered "first" as "f rst".
  const embedOpts = { subset: true, features: { liga: false } };
  const font = await pdfDoc.embedFont(await loadFontBytes(FONT_REGULAR_URL, 'regular'), embedOpts);
  const bold = await pdfDoc.embedFont(await loadFontBytes(FONT_BOLD_URL, 'bold'), embedOpts);

  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const M = 50;
  const TEXT_W = PAGE_W - M * 2;
  const color = rgb(0.1, 0.1, 0.1);
  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - M;

  const ensure = (needed: number) => {
    if (y - needed < M) {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - M;
    }
  };
  const para = (text: string, size: number, f = font, gap = 6, indent = 0) => {
    const lh = size * 1.35;
    for (const l of wrapText(text, TEXT_W - indent, (s) => f.widthOfTextAtSize(s, size))) {
      ensure(lh);
      y -= lh;
      page.drawText(l, { x: M + indent, y, size, font: f, color });
    }
    y -= gap;
  };

  para(P('title'), 20, bold, 12);
  const dateStr = formatEnglishPdfDate(signedAt);
  ensure(18);
  y -= 14;
  const nameStr = `${P('nameLabel')} ${userName}`;
  const dateLine = `${P('dateLabel')} ${dateStr}`;
  page.drawText(nameStr, { x: M, y, size: 12, font, color });
  page.drawText(dateLine, { x: PAGE_W - M - font.widthOfTextAtSize(dateLine, 12), y, size: 12, font, color });
  y -= 16;

  para(P('instructionsTitle'), 13, bold, 4);
  para(P('instruction1'), 11, font, 3);
  para(P('instruction2'), 11, font, 3);
  para(P('defaultNote'), 11, font, 12);

  for (const q of HEALTH_QUESTIONS) {
    para(`${t(`healthDeclaration.q.${q.id}` as never) as string}  ${P('answerNo')}`, 10.5, font, 5);
  }
  y -= 6;
  // The declaration the user saw on screen, then the clauses only the signed document carries.
  para(t('healthDeclaration.legalText' as never) as string, 10.5, font, 6);
  for (const k of ['renewal', 'liabilityAuthority', 'benefits', 'freeWill']) para(P(k), 10.5, font, 6);

  // Signature block (kept together at the end of the content).
  ensure(75);
  y -= 14;
  page.drawText(P('signatureLabel'), { x: M, y, size: 12, font: bold, color });
  const base64Data = signatureB64.replace(/^data:image\/\w+;base64,/, '');
  const signatureImage = await pdfDoc.embedPng(Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0)));
  page.drawImage(signatureImage, { x: M + 80, y: y - 40, width: 200, height: 55 });
  return pdfDoc.save();
}
