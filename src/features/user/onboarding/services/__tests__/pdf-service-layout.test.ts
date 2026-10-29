import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PDFPage } from 'pdf-lib';
import { generateHealthDeclarationPdf, formatEnglishPdfDate, wrapText } from '../pdf-service';
import { readFileSync as rf } from 'fs';
import { HEALTH_QUESTIONS } from '../../data/health-questions';

/**
 * Hebrew parity guard for the health declaration PDF: the template stamping (name, date,
 * signature coordinates) is recorded call by call, so any change to the Hebrew path is caught.
 */

const PNG_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const root = join(process.cwd(), 'public');

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const bytes = readFileSync(join(root, url));
      const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      return { ok: true, status: 200, statusText: 'OK', arrayBuffer: async () => ab };
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Hebrew health declaration PDF layout', () => {
  it('stamps name, date and signature at the template coordinates', async () => {
    stubFetch();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const texts: Array<{ text: string; x: number; y: number; size: number | undefined }> = [];
    const images: Array<{ x: number | undefined; y: number | undefined; width: number | undefined; height: number | undefined }> = [];
    const origText = PDFPage.prototype.drawText;
    const origImage = PDFPage.prototype.drawImage;
    vi.spyOn(PDFPage.prototype, 'drawText').mockImplementation(function (this: PDFPage, text, opts) {
      texts.push({ text, x: opts!.x!, y: opts!.y!, size: opts!.size });
      return origText.call(this, text, opts);
    });
    vi.spyOn(PDFPage.prototype, 'drawImage').mockImplementation(function (this: PDFPage, img, opts) {
      images.push({ x: opts?.x, y: opts?.y, width: opts?.width, height: opts?.height });
      return origImage.call(this, img, opts);
    });

    const bytes = await generateHealthDeclarationPdf('דנה כהן', PNG_1X1, new Date(2026, 9, 5));

    expect(bytes.length).toBeGreaterThan(1000);
    expect(texts).toEqual([
      { text: 'ןהכ הנד', x: 480, y: 705, size: 12 },
      { text: '05/10/2026', x: 68, y: 705, size: 12 },
    ]);
    expect(images).toEqual([{ x: 320, y: 42, width: 260, height: 55 }]);
  });
});

describe('English health declaration PDF', () => {
  it('is typeset LTR from the English text: 13 questions in id order, Latin name, English date', async () => {
    stubFetch();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const drawn: string[] = [];
    const origText = PDFPage.prototype.drawText;
    vi.spyOn(PDFPage.prototype, 'drawText').mockImplementation(function (this: PDFPage, text, opts) {
      drawn.push(text);
      return origText.call(this, text, opts);
    });
    const bytes = await generateHealthDeclarationPdf('Dana Cohen', PNG_1X1, new Date(2026, 9, 5), 'en');
    expect(bytes.length).toBeGreaterThan(1000);
    const joined = drawn.join('\n');
    expect(drawn).toContain('Health declaration');
    expect(drawn).toContain('Name: Dana Cohen');
    expect(joined).toContain('Date: 5 Oct 2026');
    expect(joined).not.toMatch(/[\u0590-\u05FF]/);
    expect(joined).toContain('13. If you are pregnant');
  });

  it('prints the exact catalog text the user saw: legal text, municipality clause, free-will clause', async () => {
    stubFetch();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const en = JSON.parse(rf(join(process.cwd(), 'src/messages/en/onboarding.json'), 'utf8')) as Record<string, string>;
    const drawn: string[] = [];
    const origText = PDFPage.prototype.drawText;
    vi.spyOn(PDFPage.prototype, 'drawText').mockImplementation(function (this: PDFPage, text, opts) {
      drawn.push(text);
      return origText.call(this, text, opts);
    });
    await generateHealthDeclarationPdf('Dana Cohen', PNG_1X1, new Date(2026, 9, 5), 'en');
    const flat = drawn.join(' ').replace(/\s+/g, ' ');
    const norm = (x: string) => x.replace(/\s+/g, ' ');
    for (const k of ['healthDeclaration.legalText', 'healthDeclaration.pdf.liabilityAuthority', 'healthDeclaration.pdf.freeWill', 'healthDeclaration.pdf.renewal']) {
      expect(flat, k).toContain(norm(en[k]));
    }
    for (const q of HEALTH_QUESTIONS) expect(flat).toContain(norm(en[`healthDeclaration.q.${q.id}`]));
    expect(flat).toContain('municipality');
  });

  it('date + wrap helpers', () => {
    expect(formatEnglishPdfDate(new Date(2026, 0, 31))).toBe('31 Jan 2026');
    expect(wrapText('aa bb cc', 5, (x) => x.length)).toEqual(['aa bb', 'cc']);
  });
});
