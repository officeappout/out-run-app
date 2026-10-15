import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import {
  submitHealthDeclaration, healHealthDeclarationPdf, generatePdfForRecord, needsPdfHeal,
  signatureFits, MAX_SIGNATURE_CHARS, withTimeout, StepTimeoutError,
  __resetHealthDeclarationSessionForTests,
  type HealthDeclarationRecord, type LegalDocShape, type PdfDeps,
} from '../health-declaration-record';

/** 15.10.2026 hang fix — the health declaration never makes the user wait on the PDF chain. */

const record: HealthDeclarationRecord = {
  answers: { q1: false, q2: false },
  signature: 'data:image/png;base64,AAAA',
  signerName: 'דנה',
  signedAt: '2026-10-15T09:00:00.000Z',
  termsVersion: '2.3',
  usedFastTrack: true,
};

function fakeDeps(over: Partial<PdfDeps> = {}, stored: LegalDocShape | null = null) {
  const log: string[] = [];
  const writes: Array<Partial<LegalDocShape>> = [];
  const deps: PdfDeps = {
    writeLegal: vi.fn(async (_uid, patch) => { log.push(`write:${patch.healthDeclarationPdfStatus ?? '-'}`); writes.push(patch); }),
    readLegal: vi.fn(async () => stored),
    generatePdf: vi.fn(async () => { log.push('generate'); return new Uint8Array([1]); }),
    uploadPdf: vi.fn(async () => { log.push('upload'); return 'https://storage/pdf'; }),
    ...over,
  };
  return { deps, log, writes };
}

beforeEach(() => __resetHealthDeclarationSessionForTests());

describe('submit', () => {
  it('continue fires WITHOUT waiting on the PDF chain (a PDF that never finishes still continues)', () => {
    const never = new Promise<Uint8Array>(() => {});
    const { deps } = fakeDeps({ generatePdf: vi.fn(() => never) });
    const proceed = vi.fn();
    submitHealthDeclaration('u1', record, proceed, deps);
    expect(proceed).toHaveBeenCalledTimes(1); // synchronously, before any await
  });

  it('the signature record is written (status pending) BEFORE continue', () => {
    const { deps, log, writes } = fakeDeps();
    submitHealthDeclaration('u1', record, () => log.push('continue'), deps);
    expect(log.slice(0, 2)).toEqual(['write:pending', 'continue']);
    expect(writes[0]).toMatchObject({ healthDeclaration: record, healthDeclarationPdfStatus: 'pending' });
  });

  it('the record write is not awaited — a write that never acks still continues', () => {
    const { deps } = fakeDeps({ writeLegal: vi.fn(() => new Promise<void>(() => {})) });
    const proceed = vi.fn();
    submitHealthDeclaration('u1', record, proceed, deps);
    expect(proceed).toHaveBeenCalledTimes(1);
  });

  it('success → PDF generated from the record (original signing date), then url + done', async () => {
    const { deps, writes } = fakeDeps();
    const { pdf } = submitHealthDeclaration('u1', record, () => {}, deps);
    expect(await pdf).toBe('done');
    expect(deps.generatePdf).toHaveBeenCalledWith('דנה', record.signature, new Date(record.signedAt));
    expect(writes.at(-1)).toMatchObject({ healthDeclarationPdfUrl: 'https://storage/pdf', healthDeclarationPdfStatus: 'done' });
  });

  it('a PDF failure sets failed (and keeps the record)', async () => {
    const { deps, writes } = fakeDeps({ uploadPdf: vi.fn(async () => { throw new Error('storage/unauthorized'); }) });
    const { pdf } = submitHealthDeclaration('u1', record, () => {}, deps);
    expect(await pdf).toBe('failed');
    expect(writes.at(-1)).toMatchObject({ healthDeclarationPdfStatus: 'failed', healthDeclarationPdfError: 'storage/unauthorized' });
    expect(writes.some((w) => 'healthDeclarationPdfUrl' in w)).toBe(false);
  });

  it('a step that hangs times out → failed', async () => {
    vi.useFakeTimers();
    try {
      const { deps, writes } = fakeDeps({ generatePdf: vi.fn(() => new Promise<Uint8Array>(() => {})) });
      const { pdf } = submitHealthDeclaration('u1', record, () => {}, deps);
      await vi.advanceTimersByTimeAsync(30_001);
      expect(await pdf).toBe('failed');
      expect(writes.at(-1)?.healthDeclarationPdfError).toMatch(/generatePdf timed out/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('no signed-in user → still continues, nothing written', () => {
    const { deps } = fakeDeps();
    const proceed = vi.fn();
    submitHealthDeclaration(null, record, proceed, deps);
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(deps.writeLegal).not.toHaveBeenCalled();
  });
});

describe('self-heal', () => {
  it('regenerates when the stored record has a signature but no pdfUrl (pending or failed)', async () => {
    for (const status of ['pending', 'failed'] as const) {
      __resetHealthDeclarationSessionForTests();
      const { deps, writes } = fakeDeps({}, { healthDeclaration: record, healthDeclarationPdfStatus: status });
      expect(await healHealthDeclarationPdf('u1', deps)).toBe('done');
      expect(deps.generatePdf).toHaveBeenCalledWith('דנה', record.signature, new Date(record.signedAt));
      expect(writes.at(-1)).toMatchObject({ healthDeclarationPdfUrl: 'https://storage/pdf', healthDeclarationPdfStatus: 'done' });
    }
  });

  it('no second PDF when one already exists', async () => {
    const { deps } = fakeDeps({}, { healthDeclaration: record, healthDeclarationPdfUrl: 'https://storage/existing', healthDeclarationPdfStatus: 'done' });
    expect(await healHealthDeclarationPdf('u1', deps)).toBeNull();
    expect(deps.generatePdf).not.toHaveBeenCalled();
    expect(deps.uploadPdf).not.toHaveBeenCalled();
  });

  it('no second PDF while the submit\'s own job is still running', async () => {
    let finish!: (b: Uint8Array) => void;
    const { deps } = fakeDeps({ generatePdf: vi.fn(() => new Promise<Uint8Array>((r) => { finish = r; })) }, { healthDeclaration: record });
    const { pdf } = submitHealthDeclaration('u1', record, () => {}, deps);
    expect(await healHealthDeclarationPdf('u1', deps)).toBeNull();
    finish(new Uint8Array([1]));
    expect(await pdf).toBe('done');
    expect(deps.generatePdf).toHaveBeenCalledTimes(1);
    // and concurrent direct calls share one job
    expect(generatePdfForRecord('u1', record, deps)).toBe(generatePdfForRecord('u1', record, deps));
  });

  it('runs once per session', async () => {
    const { deps } = fakeDeps({}, { healthDeclaration: record });
    await healHealthDeclarationPdf('u1', deps);
    await healHealthDeclarationPdf('u1', deps);
    expect(deps.readLegal).toHaveBeenCalledTimes(1);
  });

  it('nothing to heal without a stored signature (legacy users / never signed)', () => {
    expect(needsPdfHeal(null)).toBe(false);
    expect(needsPdfHeal({ healthDeclarationPdfUrl: 'x' })).toBe(false);
    expect(needsPdfHeal({ healthDeclarationPdfStatus: 'failed' })).toBe(false);
    expect(needsPdfHeal({ healthDeclaration: record })).toBe(true);
  });

  it('is mounted once app-wide, delayed, background only', () => {
    const layout = readFileSync(fileURLToPath(new URL('../../../../../app/ClientLayout.tsx', import.meta.url)), 'utf8');
    expect(layout).toContain('<HealthDeclarationSelfHeal />');
    const comp = readFileSync(fileURLToPath(new URL('../../components/HealthDeclarationSelfHeal.tsx', import.meta.url)), 'utf8');
    expect(comp).toContain('healHealthDeclarationPdf(user.uid)');
    expect(comp).toContain('return null;');
  });
});

describe('signature size + helpers', () => {
  it('the stored signature has a hard ceiling far below the 1 MiB doc limit', () => {
    expect(MAX_SIGNATURE_CHARS).toBeLessThanOrEqual(300_000);
    expect(signatureFits('data:image/png;base64,' + 'A'.repeat(1000))).toBe(true);
    expect(signatureFits('A'.repeat(MAX_SIGNATURE_CHARS + 1))).toBe(false);
    expect(signatureFits(null)).toBe(false);
  });
  it('withTimeout rejects with StepTimeoutError and runs the cancel hook', async () => {
    vi.useFakeTimers();
    try {
      const onTimeout = vi.fn();
      const p = withTimeout(new Promise(() => {}), 50, 'upload', onTimeout);
      const assertion = expect(p).rejects.toBeInstanceOf(StepTimeoutError);
      await vi.advanceTimersByTimeAsync(51);
      await assertion;
      expect(onTimeout).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('HealthDeclarationStep wiring (all 3 entry points share this handler)', () => {
  const step = readFileSync(fileURLToPath(new URL('../../components/HealthDeclarationStep.tsx', import.meta.url)), 'utf8');
  const handler = step.slice(step.indexOf('const handleSubmit = useCallback('), step.indexOf('// ── Native canvas drawing helpers'));
  it('the handler is synchronous and awaits nothing', () => {
    expect(handler).toContain('const handleSubmit = useCallback(() => {');
    expect(handler).not.toMatch(/\bawait\b/);
    expect(handler).toContain('submitHealthDeclaration(');
  });
  it('no direct Storage / Firestore calls left in the component', () => {
    expect(step).not.toMatch(/uploadBytes|getDownloadURL|setDoc\(/);
  });
});
