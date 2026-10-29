import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PDFPage } from 'pdf-lib';
import { generateHealthDeclarationPdf } from '../pdf-service';

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
