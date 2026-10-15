/**
 * health-declaration-record — the signed health declaration, saved without ever making the user
 * wait (15.10.2026 hang fix).
 *
 * Before: HealthDeclarationStep awaited PDF generation → Storage upload → getDownloadURL →
 * Firestore ack, all with no timeout, before navigating. On a slow network the spinner stayed up
 * for many seconds (or indefinitely).
 *
 * Now:
 *   1. The SIGNATURE RECORD (answers, compact signature PNG, signer, signedAt, terms version,
 *      pdfStatus 'pending') is written to users/{uid}/private/legal and NOT awaited — Firestore's
 *      persistent local cache (src/lib/firebase.ts) queues it locally, so it survives an app kill.
 *   2. The caller continues immediately.
 *   3. The PDF is generated FROM THAT RECORD in the background: generate → upload → download URL
 *      → `healthDeclarationPdfUrl` + status 'done'. Every step has a timeout; any failure → 'failed'.
 *   4. Self-heal: once per session, a record with a signature but no PDF URL gets its PDF
 *      regenerated (from the stored record, stamped with the ORIGINAL signing date).
 *
 * The PDF stays the legal record; the stored signature means it can always be re-created.
 * Field name `healthDeclarationPdfUrl` is unchanged — the admin user page and the legalHold
 * Cloud Function read it.
 *
 * Firebase is reached only through `PdfDeps` (default: dynamic imports), so this module is
 * testable in node without initializing Firebase.
 */

export type HealthPdfStatus = 'pending' | 'done' | 'failed';

export interface HealthDeclarationRecord {
  answers: Record<string, boolean>;
  /** Compact PNG data URL (see compactSignature in HealthDeclarationStep). */
  signature: string;
  signerName: string;
  /** ISO timestamp of the signature. */
  signedAt: string;
  /** LEGAL_VERSION the user signed. */
  termsVersion: string;
  usedFastTrack: boolean;
}

/** The part of users/{uid}/private/legal this module reads/writes. */
export interface LegalDocShape {
  healthDeclaration?: HealthDeclarationRecord;
  healthDeclarationPdfUrl?: string | null;
  healthDeclarationPdfStatus?: HealthPdfStatus;
  healthDeclarationPdfError?: string | null;
}

export interface PdfDeps {
  /** Merge-write into private/legal. Callers never await the server ack. */
  writeLegal(uid: string, patch: Partial<LegalDocShape>): Promise<void>;
  readLegal(uid: string): Promise<LegalDocShape | null>;
  generatePdf(signerName: string, signature: string, signedAt: Date): Promise<Uint8Array>;
  /** Upload + resolve the download URL; must honour (cancel at) `timeoutMs`. */
  uploadPdf(uid: string, bytes: Uint8Array, signerName: string, timeoutMs: number): Promise<string>;
}

/** Per-step timeouts (ms). Generous — this all runs in the background. */
export const PDF_STEP_TIMEOUT_MS = { generate: 30_000, upload: 60_000 } as const;

/**
 * Hard ceiling for the stored signature data URL (chars). Firestore's doc limit is 1 MiB; the
 * compact signature is typically 10–40 KB, and the smallest compaction step is bounded far below
 * this by construction (260 px wide).
 */
export const MAX_SIGNATURE_CHARS = 300_000;

/** Widths (px) tried, in order, when compacting the signature: ~2× the PDF box, then 1×. */
export const SIGNATURE_WIDTHS = [520, 260] as const;

export function signatureFits(dataUrl: string | null | undefined): boolean {
  return !!dataUrl && dataUrl.length <= MAX_SIGNATURE_CHARS;
}

export class StepTimeoutError extends Error {
  constructor(step: string, ms: number) {
    super(`${step} timed out after ${ms}ms`);
    this.name = 'StepTimeoutError';
  }
}

export function withTimeout<T>(p: Promise<T>, ms: number, step: string, onTimeout?: () => void): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    t = setTimeout(() => {
      onTimeout?.();
      reject(new StepTimeoutError(step, ms));
    }, ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

// ── Default deps (browser) ───────────────────────────────────────────────────

const defaultDeps: PdfDeps = {
  async writeLegal(uid, patch) {
    const [{ doc, setDoc }, { db }] = await Promise.all([import('firebase/firestore'), import('@/lib/firebase')]);
    await setDoc(doc(db, 'users', uid, 'private', 'legal'), { ...patch, updatedAt: new Date() }, { merge: true });
  },
  async readLegal(uid) {
    const [{ doc, getDoc }, { db }] = await Promise.all([import('firebase/firestore'), import('@/lib/firebase')]);
    const snap = await getDoc(doc(db, 'users', uid, 'private', 'legal'));
    return snap.exists() ? (snap.data() as LegalDocShape) : null;
  },
  async generatePdf(signerName, signature, signedAt) {
    const { generateHealthDeclarationPdf } = await import('./pdf-service');
    return generateHealthDeclarationPdf(signerName, signature, signedAt);
  },
  async uploadPdf(uid, bytes, signerName, timeoutMs) {
    const [{ ref, uploadBytesResumable, getDownloadURL }, { storage }] = await Promise.all([
      import('firebase/storage'),
      import('@/lib/firebase'),
    ]);
    const storageRef = ref(storage, `health-declarations/${uid}/health-declaration-${Date.now()}.pdf`);
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    const task = uploadBytesResumable(storageRef, blob, {
      contentType: 'application/pdf',
      customMetadata: { userName: signerName, generatedAt: new Date().toISOString() },
    });
    // Cancel on timeout so a late-finishing upload can't leave an orphan PDF behind a 'failed'
    // status (self-heal would otherwise create a second one).
    const snap = await withTimeout(Promise.resolve(task), timeoutMs, 'upload', () => task.cancel());
    return withTimeout(getDownloadURL(snap.ref), 20_000, 'getDownloadURL');
  },
};

// ── Background PDF (shared by submit + self-heal) ────────────────────────────

/** One PDF job per uid at a time — submit and self-heal never generate twice concurrently. */
const inFlight = new Map<string, Promise<HealthPdfStatus>>();

function logWriteError(where: string) {
  return (err: unknown) => console.error(`[HealthDeclaration] ${where} write failed:`, err);
}

/** Generate + upload the PDF for `record`, then mark the doc 'done' (or 'failed'). Never throws. */
export function generatePdfForRecord(
  uid: string,
  record: HealthDeclarationRecord,
  deps: PdfDeps = defaultDeps,
): Promise<HealthPdfStatus> {
  const running = inFlight.get(uid);
  if (running) return running;
  const job = (async (): Promise<HealthPdfStatus> => {
    try {
      const bytes = await withTimeout(
        deps.generatePdf(record.signerName, record.signature, new Date(record.signedAt)),
        PDF_STEP_TIMEOUT_MS.generate,
        'generatePdf',
      );
      const url = await deps.uploadPdf(uid, bytes, record.signerName, PDF_STEP_TIMEOUT_MS.upload);
      deps.writeLegal(uid, {
        healthDeclarationPdfUrl: url,
        healthDeclarationPdfStatus: 'done',
        healthDeclarationPdfError: null,
      }).catch(logWriteError('pdf done'));
      return 'done';
    } catch (err) {
      console.error('[HealthDeclaration] PDF generation/upload failed:', err);
      deps.writeLegal(uid, {
        healthDeclarationPdfStatus: 'failed',
        healthDeclarationPdfError: err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300),
      }).catch(logWriteError('pdf failed'));
      return 'failed';
    } finally {
      inFlight.delete(uid);
    }
  })();
  inFlight.set(uid, job);
  return job;
}

/**
 * Submit: write the signature record (not awaited), continue IMMEDIATELY, then build the PDF in
 * the background. Returns the background promises for tests; callers ignore them.
 */
export function submitHealthDeclaration(
  uid: string | null | undefined,
  record: HealthDeclarationRecord,
  proceed: () => void,
  deps: PdfDeps = defaultDeps,
): { recordWrite: Promise<void>; pdf: Promise<HealthPdfStatus | null> } {
  if (!uid) {
    // No signed-in user — nothing can be stored (same as before); never block the flow.
    proceed();
    return { recordWrite: Promise.resolve(), pdf: Promise.resolve(null) };
  }
  const recordWrite = deps.writeLegal(uid, {
    healthDeclaration: record,
    healthDeclarationPdfStatus: 'pending',
    healthDeclarationPdfError: null,
  }).catch(logWriteError('record'));
  proceed();
  return { recordWrite, pdf: generatePdfForRecord(uid, record, deps) };
}

/** Does this stored doc need its PDF (re)generated? Signature present, PDF URL missing. */
export function needsPdfHeal(legal: LegalDocShape | null | undefined): boolean {
  const rec = legal?.healthDeclaration;
  return !!rec?.signature && !legal?.healthDeclarationPdfUrl;
}

const healedThisSession = new Set<string>();

/**
 * Self-heal, once per session per uid, in the background: a stored signature with no PDF URL
 * (pending — e.g. the app was killed mid-upload — or failed) gets its PDF regenerated from the
 * stored record. Never throws, never creates a second PDF when one exists.
 */
export async function healHealthDeclarationPdf(uid: string, deps: PdfDeps = defaultDeps): Promise<HealthPdfStatus | null> {
  if (healedThisSession.has(uid)) return null;
  healedThisSession.add(uid);
  if (inFlight.has(uid)) return null; // the submit's own job is already on it
  try {
    const legal = await deps.readLegal(uid);
    if (!needsPdfHeal(legal)) return null;
    return await generatePdfForRecord(uid, legal!.healthDeclaration!, deps);
  } catch (err) {
    console.warn('[HealthDeclaration] self-heal skipped:', err);
    return null;
  }
}

/** Test-only: reset the module's session state. */
export function __resetHealthDeclarationSessionForTests(): void {
  inFlight.clear();
  healedThisSession.clear();
}
