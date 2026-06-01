/**
 * Photo Release PDF generation — SERVER ONLY (Node.js runtime).
 *
 * Loads the blank template (`public/assets/forms/photo-release-template.pdf`)
 * synchronously via fs.readFileSync, embeds the Simpler Pro OTF font for full
 * Hebrew Unicode coverage, and stamps the submission values + signature image
 * onto the correct blank lines of the template.
 *
 * Coordinate map (PDF points, origin bottom-left, A4 595.5 × 841.9 pts):
 * derived by text-extraction from the live template — do not change without
 * re-running scripts/inspect-photo-release-pdf.mjs.
 *
 * Design decisions:
 *  • readFileSync — race-free, no async chain that could be interrupted.
 *  • embedFont without { subset: true } — full-font embed avoids CFF-OTF
 *    subsetting crashes that some pdf-lib / fontkit versions produce.
 *  • Buffer.from(base64, 'base64') — Node.js-idiomatic; avoids the browser
 *    global `atob` which isn't guaranteed in every Next.js server bundle.
 */
import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PDFDocument, type PDFFont, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { PhotoReleaseSubmissionData } from '../types';

// ── Absolute asset paths (resolved at module initialisation time) ──
const TEMPLATE_PATH = path.join(
  process.cwd(),
  'public',
  'assets',
  'forms',
  'photo-release-template.pdf',
);
const FONT_PATH = path.join(
  process.cwd(),
  'public',
  'assets',
  'fonts',
  'SimplerPro-Regular.otf',
);

// ── Label anchors — right edge of each blank line (colonX) + baseline Y ──
// Values are drawn right-aligned so the text ends VALUE_GAP points left of colonX.
const LABEL = {
  studentName: { colonX: 448.7, y: 348.4 },
  schoolClass:  { colonX: 489.3, y: 319.9 },
  parentName:   { colonX: 470.5, y: 290.7 },
  date:         { colonX: 529.6, y: 262.2 },
} as const;

const SIGNATURE_ANCHOR = { colonX: 528.8, y: 232.9 } as const;

const VALUE_FONT_SIZE = 12;
const VALUE_GAP = 12;
const TEXT_COLOR = rgb(0.1, 0.1, 0.1);

const SIG_MAX_WIDTH  = 235;
const SIG_MAX_HEIGHT = 70;
const SIG_RIGHT_EDGE = SIGNATURE_ANCHOR.colonX - 15;
const SIG_BOTTOM_Y   = 176;

// ── Module-level byte caches (populated on first call, reused after) ──
let _templateBytes: Uint8Array | null = null;
let _fontBytes: Uint8Array | null = null;

function getTemplateBytes(): Uint8Array {
  if (!_templateBytes) {
    console.log('[photo-release-pdf] Loading template from:', TEMPLATE_PATH);
    _templateBytes = new Uint8Array(readFileSync(TEMPLATE_PATH));
    console.log('[photo-release-pdf] Template loaded, size:', _templateBytes.length, 'bytes');
  }
  return _templateBytes;
}

function getFontBytes(): Uint8Array {
  if (!_fontBytes) {
    console.log('[photo-release-pdf] Loading font from:', FONT_PATH);
    _fontBytes = new Uint8Array(readFileSync(FONT_PATH));
    console.log('[photo-release-pdf] Font loaded, size:', _fontBytes.length, 'bytes');
  }
  return _fontBytes;
}

// ── Hebrew RTL helper ──

/**
 * Prepare a Hebrew string for LTR rendering inside pdf-lib.
 *
 * pdf-lib has no BiDi engine — it draws every character at successive X
 * positions going left-to-right.  Hebrew is logically stored right-to-left,
 * so the first codepoint in the string (rightmost in reading order) would be
 * placed at the leftmost position, which looks backwards.
 *
 * Fix: reverse the entire codepoint sequence so that the character that
 * should appear on the LEFT of the canvas (the last character in logical
 * order) is drawn first.  `Array.from` is used instead of split('') so that
 * surrogate pairs and multi-byte glyphs are treated as single units.
 *
 * Non-Hebrew strings (Latin, digits only) are returned unchanged.
 */
function reverseForPdf(text: string): string {
  if (!text) return '';
  const hasHebrew = /[\u0590-\u05FF]/.test(text);
  if (!hasHebrew) return text;
  return Array.from(text).reverse().join('');
}

/** Draw `text` right-aligned so its right edge sits `VALUE_GAP` left of anchor.colonX. */
function drawRightAligned(
  page: ReturnType<PDFDocument['getPages']>[number],
  font: PDFFont,
  text: string,
  anchor: { colonX: number; y: number },
): void {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return;
  const display = reverseForPdf(trimmed);
  const textWidth = font.widthOfTextAtSize(display, VALUE_FONT_SIZE);
  const x = Math.max(anchor.colonX - VALUE_GAP - textWidth, 8);
  page.drawText(display, { x, y: anchor.y, size: VALUE_FONT_SIZE, font, color: TEXT_COLOR });
}

/** Resolve a DD/MM/YYYY date from the submission (createdAt → submittedAtClient → now). */
export function resolveSubmissionDate(input?: {
  createdAt?: unknown;
  submittedAtClient?: string;
}): string {
  let date: Date | null = null;
  const ts = input?.createdAt as { toDate?: () => Date } | undefined;
  if (ts?.toDate) {
    try { date = ts.toDate(); } catch { date = null; }
  }
  if (!date && input?.submittedAtClient) {
    const p = new Date(input.submittedAtClient);
    if (!Number.isNaN(p.getTime())) date = p;
  }
  if (!date) date = new Date();
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
}

/**
 * Generate the completed, stamped Photo Release PDF and return its bytes.
 *
 * Throws with a descriptive message on any failure so the API route can log
 * and return an informative 500.
 */
export async function generatePhotoReleasePdf(
  submission: PhotoReleaseSubmissionData & { createdAt?: unknown },
): Promise<Uint8Array> {
  // ── 1. Load assets synchronously (race-free, no Promise chain) ──
  const templateBytes = getTemplateBytes();
  const fontBytes = getFontBytes();

  // ── 2. Load the template into pdf-lib ──
  console.log('[photo-release-pdf] Parsing PDF template...');
  const pdfDoc = await PDFDocument.load(templateBytes);

  // ── 3. Register fontkit and embed Hebrew-capable font ──
  // We embed WITHOUT { subset: true } because OTF/CFF subsetting in fontkit
  // can throw in some Next.js server bundle configurations.  Full-font embed
  // is always stable and the size overhead (~60 KB) is acceptable for a
  // one-off server-to-client download.
  console.log('[photo-release-pdf] Embedding font...');
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(fontBytes);
  console.log('[photo-release-pdf] Font embedded OK');

  // ── 4. Get first page ──
  const pages = pdfDoc.getPages();
  if (pages.length === 0) throw new Error('PDF template has no pages');
  const page = pages[0];

  // ── 5. Stamp text fields ──
  drawRightAligned(page, font, submission.studentName, LABEL.studentName);

  const schoolClass = [submission.school, submission.studentClass]
    .map((v) => (v ?? '').trim())
    .filter(Boolean)
    .join(' · ');
  drawRightAligned(page, font, schoolClass, LABEL.schoolClass);

  drawRightAligned(page, font, submission.parentName, LABEL.parentName);

  // Date is numeric — no Hebrew reversal needed.
  drawRightAligned(page, font, resolveSubmissionDate(submission), LABEL.date);

  // "תעודת זהות הורה:" intentionally left blank — not collected by the form.

  // ── 6. Embed signature image ──
  if (submission.signatureData) {
    console.log('[photo-release-pdf] Embedding signature image...');
    try {
      // Strip the data-URI prefix safely before converting to buffer.
      const base64 = submission.signatureData.replace(/^data:image\/[\w+]+;base64,/, '');
      // Use Buffer.from — Node.js-idiomatic, no reliance on the browser `atob` global.
      const sigBytes = new Uint8Array(Buffer.from(base64, 'base64'));

      const isJpeg = submission.signatureData.startsWith('data:image/jpeg');
      const sigImage = isJpeg
        ? await pdfDoc.embedJpg(sigBytes)
        : await pdfDoc.embedPng(sigBytes);

      const scale = Math.min(SIG_MAX_WIDTH / sigImage.width, SIG_MAX_HEIGHT / sigImage.height);
      page.drawImage(sigImage, {
        x: SIG_RIGHT_EDGE - sigImage.width * scale,
        y: SIG_BOTTOM_Y,
        width:  sigImage.width  * scale,
        height: sigImage.height * scale,
      });
      console.log('[photo-release-pdf] Signature embedded OK');
    } catch (sigErr) {
      // A malformed signature must not abort the whole document — skip and log.
      console.error('[photo-release-pdf] WARNING: failed to embed signature image:', sigErr);
    }
  }

  // ── 7. Serialise ──
  console.log('[photo-release-pdf] Saving PDF...');
  const bytes = await pdfDoc.save();
  console.log('[photo-release-pdf] PDF ready, size:', bytes.length, 'bytes');
  return bytes;
}
