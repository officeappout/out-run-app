/**
 * POST /api/admin/drive/backfill-attachments
 * Body: { authorityId: string, dryRun?: boolean }
 *
 * For an authority:
 *   1. Load activityLog entries with type=email|meeting
 *   2. Search Gmail (david@ + office@) for threads near each entry date + authority name
 *   3. Download attachments matching priority types (quote/contract first, then invoice/presentation)
 *   4. Upload to the authority's Drive folder (creates folder if missing)
 *   5. Write AuthorityDocument records to Firestore (skipped if dryRun=true)
 *
 * Returns: { processed, matched, uploaded, skipped, documents: DriveDocPreview[] }
 */
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  getCombinedClient,
  ALL_MAILBOXES,
  AUTHORITIES_ROOT_FOLDER_ID,
} from '@/lib/google-service-account';
import { DocumentType } from '@/types/admin-types';
import { Readable } from 'stream';

// ── Priority attachment detection ─────────────────────────────────────────────

interface AttachmentMeta {
  messageId: string;
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
  docType: DocumentType;
  priority: number; // Lower = higher priority
}

const FILENAME_RULES: { pattern: RegExp; type: DocumentType; priority: number }[] = [
  // Quote / proposal
  { pattern: /הצע(ת|ה)\s*מחיר|הצ[""״]מ|quote|proposal/i,                          type: 'quote',            priority: 1 },
  // Contract / service agreement
  { pattern: /חוזה|הסכם\s*שירות|service[\s._-]?agr|contract/i,                     type: 'contract',         priority: 2 },
  // Single supplier / work order forms
  { pattern: /ספק\s*יחיד|טופס\s*הזמנה|הזמנת\s*עבודה|single[\s._-]?suppl|order/i,  type: 'single_supplier',  priority: 3 },
  // Invoice / receipt
  { pattern: /חשבון\s*עסקה|חשבונית|קבלה|invoice|receipt/i,                          type: 'invoice',           priority: 4 },
  // Presentation
  { pattern: /מצגת|presentation/i,                                                   type: 'presentation',      priority: 5 },
  // pptx extension alone → presentation
  { pattern: /\.pptx?$/i,                                                             type: 'presentation',      priority: 5 },
];

function classifyFilename(name: string): { type: DocumentType; priority: number } | null {
  // Must be a document-type file (PDF, Office, or image)
  if (!/\.(pdf|docx?|xlsx?|pptx?|png|jpg|jpeg)$/i.test(name)) return null;
  for (const rule of FILENAME_RULES) {
    if (rule.pattern.test(name)) {
      return { type: rule.type, priority: rule.priority };
    }
  }
  // Unclassified document file → include as 'other' at lowest priority
  return { type: 'other', priority: 99 };
}

// ── Noise / broker filters ────────────────────────────────────────────────────

/** Domains that belong to the broker (partner), not to the authority. */
const BROKER_DOMAINS = [
  'goren-amir.co.il',
];

/**
 * Filename patterns that are generic noise — signature images, legal boilerplate,
 * provider infrastructure docs. These are skipped regardless of authority.
 */
const NOISE_FILENAME_PATTERNS: RegExp[] = [
  /^image\d+/i,          // image001.png, image00X — inline signature images
  /^WRD\d+/i,            // WRD000 — Word embedded images
  /תקנון/i,              // general regulations
  /policy/i,
  /הבהרות/i,
  /ISO\d/i,              // ISO certification docs
  /cloudflare/i,
  /ovh/i,
];

/**
 * Filename patterns that indicate a broker/partner agreement rather than an
 * authority-specific document. Skip at the authority level.
 */
const BROKER_FILENAME_PATTERNS: RegExp[] = [
  /שיתוף\s*פעולה\s*מסחרי/i,
  /הסכם\s*עקרונות/i,
  /הסכם\s*עמלה/i,
  /הסכם\s*ברוקר/i,
  /broker/i,
  /referral/i,
  /commission/i,
];

/** Minimum file size (bytes) — smaller files are likely signature images or icons. */
const MIN_FILE_SIZE = 50_000; // 50 KB

/**
 * Returns a skip reason string if the attachment should be excluded,
 * or null if it should be included.
 */
function shouldSkipAttachment(
  filename: string,
  size: number,
  mimeType: string,
  threadSenderDomains: string[],
): string | null {
  // 1. Inline images — too small or image MIME type
  if (mimeType.startsWith('image/') && size < MIN_FILE_SIZE) {
    return `inline image (${mimeType}, ${size}B)`;
  }
  // 2. Minimum size — catch tiny embedded files even without image MIME
  if (size > 0 && size < MIN_FILE_SIZE && /\.(png|jpg|jpeg|gif|bmp)$/i.test(filename)) {
    return `tiny image file (${size}B < 50KB)`;
  }
  // 3. Noise filenames
  for (const pat of NOISE_FILENAME_PATTERNS) {
    if (pat.test(filename)) return `noise pattern (${pat})`;
  }
  // 4. Broker/partner agreements
  for (const pat of BROKER_FILENAME_PATTERNS) {
    if (pat.test(filename)) return `broker doc (${pat})`;
  }
  // 5. Thread came from/to a broker domain
  for (const domain of BROKER_DOMAINS) {
    if (threadSenderDomains.some(d => d.endsWith(domain))) {
      return `broker domain (${domain})`;
    }
  }
  return null;
}

// Dedup key: filename (lowercased, trimmed) + size in bytes.
// Used BEFORE upload so we skip identical files even when driveFileId doesn't exist yet.
function attachmentDedupeKey(filename: string, size: number): string {
  return `${filename.toLowerCase().trim()}::${size}`;
}

// ── Gmail helpers ─────────────────────────────────────────────────────────────

function dateWindow(dateTs: Timestamp, daysBefore: number, daysAfter: number) {
  const d = dateTs.toDate();
  const after  = new Date(d.getTime() - daysBefore * 86_400_000);
  const before = new Date(d.getTime() + daysAfter  * 86_400_000);
  const fmt = (x: Date) => `${x.getFullYear()}/${x.getMonth() + 1}/${x.getDate()}`;
  return `after:${fmt(after)} before:${fmt(before)}`;
}

function hebrewKeywords(text: string, maxWords = 3): string {
  return text
    .split(/[\s,;:.()!\-]+/)
    .filter(w => /[֐-׿]/.test(w) && w.length >= 3)
    .slice(0, maxWords)
    .join(' ');
}

/** Extract contact email addresses from the authority contacts array */
function contactEmails(contacts: any[]): string[] {
  return contacts
    .map((c: any) => c.email)
    .filter((e: any) => typeof e === 'string' && e.includes('@'));
}

/**
 * Search all mailboxes for threads matching a query.
 * Returns {threadId, gmailClient, mailbox} for the first confident match,
 * or null if nothing found.
 * "Confident" = exactly 1 result, or >1 but one snippet contains an authority keyword.
 */
async function findThread(
  gmailClients: Array<{ client: any; email: string }>,
  q: string,
  authorityKeywords: string[],
  log: string[],
): Promise<{ threadId: string; gmailClient: any; mailbox: string } | null> {
  for (const { client, email } of gmailClients) {
    const res = await client.users.threads.list({ userId: 'me', q, maxResults: 8 });
    const threads = res.data.threads ?? [];
    log.push(`    [${email}] ${threads.length} thread(s)`);

    if (threads.length === 1) {
      return { threadId: threads[0].id!, gmailClient: client, mailbox: email };
    }
    if (threads.length > 1) {
      for (const t of threads) {
        const detail = await client.users.threads.get({ userId: 'me', id: t.id!, format: 'metadata' });
        const snippet = (detail.data.snippet ?? '').toLowerCase();
        if (authorityKeywords.some(w => snippet.includes(w))) {
          return { threadId: t.id!, gmailClient: client, mailbox: email };
        }
      }
    }
  }
  return null;
}

// ── Drive helpers ─────────────────────────────────────────────────────────────

async function getOrCreateAuthorityFolder(
  drive: any,
  authorityName: string
): Promise<string> {
  const safeName = authorityName.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${safeName}' and '${AUTHORITIES_ROOT_FOLDER_ID}' in parents and trashed=false`,
    fields: 'files(id)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  if (res.data.files?.[0]?.id) return res.data.files[0].id;

  const created = await drive.files.create({
    requestBody: {
      name: authorityName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [AUTHORITIES_ROOT_FOLDER_ID],
    },
    fields: 'id',
    supportsAllDrives: true,
  });
  return created.data.id!;
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  let body: { authorityId?: string; dryRun?: boolean };
  try { body = await request.json(); } catch { body = {}; }

  const { authorityId, dryRun = false } = body;
  if (!authorityId) {
    return NextResponse.json({ error: 'authorityId is required' }, { status: 400 });
  }

  const db = getAdminDb();
  const docRef = db.collection('authorities').doc(authorityId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) {
    return NextResponse.json({ error: 'Authority not found' }, { status: 404 });
  }

  const data = docSnap.data()!;
  const authorityName: string = data.name ?? authorityId;
  const activityLog: any[] = data.activityLog ?? [];
  const contacts: any[] = data.contacts ?? [];
  const knownEmails = contactEmails(contacts);
  // Hebrew words from authority name used to disambiguate multiple thread results
  const authorityKeywords = authorityName
    .split(/\s+/)
    .filter(w => /[֐-׿]/.test(w) && w.length >= 3)
    .map(w => w.toLowerCase());

  // Dedup set 1: driveFileId of already-stored documents
  const existingDocIds = new Set<string>(
    (data.documents ?? []).map((d: any) => d.driveFileId).filter(Boolean)
  );
  // Dedup set 2: filename+size of already-stored documents (catches pre-upload duplicates)
  const seenAttachments = new Set<string>(
    (data.documents ?? [])
      .filter((d: any) => d.name)
      .map((d: any) => attachmentDedupeKey(d.name, d.size ?? 0))
  );

  // Only process email/meeting entries
  const entries = activityLog.filter(
    (e: any) => (e.type === 'email' || e.type === 'meeting') && e.date
  );

  const log: string[] = [];
  const newDocuments: any[] = [];
  let matched = 0;
  let uploaded = 0;
  let skipped = 0;

  try {
    // Build gmail clients for all mailboxes
    const gmailClients: Array<{ client: any; email: string }> = [];
    let drive: any = null;
    for (const mailbox of ALL_MAILBOXES) {
      const { gmail: g, drive: d } = await getCombinedClient(mailbox);
      gmailClients.push({ client: g, email: mailbox });
      if (!drive) drive = d; // use the first one's drive (david@)
    }

    // Ensure authority folder exists (skip in dryRun)
    let folderId = '';
    if (!dryRun) {
      folderId = await getOrCreateAuthorityFolder(drive, authorityName);
      log.push(`📁 folder: ${folderId}`);
    }

    for (const entry of entries) {
      const dateStr = entry.date?.toDate?.()?.toISOString?.()?.slice(0, 10) ?? '?';
      const summary  = entry.summary ?? entry.content ?? '';

      log.push(`\n▶ ${entry.type} ${dateStr}: "${summary.slice(0, 50)}"`);

      // ── Strategy A: ±7 days + authority name + has:attachment ────────────
      const dwNormal  = dateWindow(entry.date, 7, 7);
      const kw        = hebrewKeywords(authorityName + ' ' + summary, 3);
      const qA        = `${dwNormal} ${kw} has:attachment`;
      log.push(`  [A] ${qA}`);
      let match = await findThread(gmailClients, qA, authorityKeywords, log);

      // ── Strategy B: ±14 days + authority name (no summary kw) ────────────
      if (!match) {
        const dwWide = dateWindow(entry.date, 14, 14);
        const qB     = `${dwWide} ${hebrewKeywords(authorityName, 2)} has:attachment`;
        log.push(`  [B] ${qB}`);
        match = await findThread(gmailClients, qB, authorityKeywords, log);
      }

      // ── Strategy C: contact email addresses ±14 days ─────────────────────
      if (!match && knownEmails.length > 0) {
        const dwWide   = dateWindow(entry.date, 14, 14);
        const emailQ   = knownEmails.map(e => `from:${e} OR to:${e}`).join(' OR ');
        const qC       = `${dwWide} (${emailQ}) has:attachment`;
        log.push(`  [C] ${qC}`);
        match = await findThread(gmailClients, qC, authorityKeywords, log);
      }

      // ── Strategy D: authority name no date, last 3 years ─────────────────
      if (!match) {
        const qD = `newer_than:3y ${hebrewKeywords(authorityName, 2)} has:attachment`;
        log.push(`  [D] ${qD}`);
        match = await findThread(gmailClients, qD, authorityKeywords, log);
      }

      if (!match) {
        log.push('  ✗ no match in any strategy');
        skipped++;
        continue;
      }

      const { threadId, gmailClient: sourceGmail, mailbox: sourceMailbox } = match;
      matched++;
      log.push(`  ✅ thread ${threadId} (${sourceMailbox})`);

      // Get all messages in thread and collect attachments
      const threadDetail = await sourceGmail.users.threads.get({
        userId: 'me', id: threadId, format: 'full',
      });
      const messages = threadDetail.data.messages ?? [];

      // Collect unique sender/recipient domains from all messages in the thread
      const threadDomains = new Set<string>();
      for (const msg of messages) {
        const headers: any[] = msg.payload?.headers ?? [];
        for (const h of headers) {
          if (/^(from|to|cc)$/i.test(h.name ?? '')) {
            const matches = (h.value ?? '').match(/@([\w.-]+)/g) ?? [];
            matches.forEach((m: string) => threadDomains.add(m.slice(1).toLowerCase()));
          }
        }
      }
      const threadDomainList = Array.from(threadDomains);

      const attachments: AttachmentMeta[] = [];
      for (const msg of messages) {
        // Walk the MIME tree recursively — attachments can be nested in multipart
        const walkParts = (parts: any[]) => {
          for (const part of parts ?? []) {
            if (part.parts) walkParts(part.parts);
            if (!part.filename || !part.body?.attachmentId) continue;
            const classified = classifyFilename(part.filename);
            if (!classified) continue;
            attachments.push({
              messageId: msg.id!,
              attachmentId: part.body.attachmentId,
              filename: part.filename,
              mimeType: part.mimeType ?? 'application/octet-stream',
              size: part.body.size ?? 0,
              docType: classified.type,
              priority: classified.priority,
            });
          }
        };
        walkParts(msg.payload?.parts ?? []);
      }

      // Sort by priority (quote/contract first)
      attachments.sort((a, b) => a.priority - b.priority);
      log.push(`  📎 ${attachments.length} classified attachment(s)`);

      for (const att of attachments) {
        log.push(`  • ${att.filename} (${att.docType}, ${(att.size / 1024).toFixed(0)} KB)`);

        // Noise / broker filter
        const skipReason = shouldSkipAttachment(att.filename, att.size, att.mimeType, threadDomainList);
        if (skipReason) {
          log.push(`    ⏭ skipped: ${skipReason}`);
          continue;
        }

        // Dedup by filename+size before any upload attempt
        const dedupKey = attachmentDedupeKey(att.filename, att.size);
        if (seenAttachments.has(dedupKey)) {
          log.push(`    ⏭ duplicate (name+size), skip`);
          continue;
        }
        seenAttachments.add(dedupKey);

        if (dryRun) {
          newDocuments.push({ filename: att.filename, type: att.docType, size: att.size, threadId, dryRun: true });
          uploaded++;
          continue;
        }

        // Download from Gmail
        const attRes = await sourceGmail.users.messages.attachments.get({
          userId: 'me',
          messageId: att.messageId,
          id: att.attachmentId,
        });
        const rawData: string = attRes.data.data ?? '';
        // Gmail uses URL-safe base64
        const buffer = Buffer.from(rawData.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

        // Upload to Drive
        const uploadRes = await drive.files.create({
          requestBody: {
            name: att.filename,
            parents: [folderId],
          },
          media: {
            mimeType: att.mimeType,
            body: Readable.from(buffer),
          },
          fields: 'id,name,webViewLink',
          supportsAllDrives: true,
        });

        const driveFileId  = uploadRes.data.id!;
        const driveUrl     = uploadRes.data.webViewLink!;

        if (existingDocIds.has(driveFileId)) {
          log.push(`    ⏭ already in Firestore by driveFileId, skip`);
          continue;
        }
        existingDocIds.add(driveFileId);

        const newDoc = {
          id: crypto.randomUUID(),
          name: att.filename,
          type: att.docType,
          direction: 'received',
          date: entry.date,
          driveFileId,
          driveUrl,
          size: att.size,
          activityLogId: entry.id ?? null,
          threadId,
          createdAt: Timestamp.now(),
        };
        newDocuments.push(newDoc);
        uploaded++;
        log.push(`    💾 uploaded → ${driveUrl}`);
      }
    }

    // Write new document records to Firestore (one update per authority)
    if (!dryRun && newDocuments.length > 0) {
      await docRef.update({
        documents: FieldValue.arrayUnion(...newDocuments),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    return NextResponse.json({
      authorityName,
      dryRun,
      processed: entries.length,
      matched,
      uploaded,
      skipped,
      folderId: dryRun ? null : folderId,
      documents: newDocuments,
      log,
    });

  } catch (err: any) {
    console.error('[drive/backfill-attachments]', err?.message ?? err);
    return NextResponse.json(
      { error: err?.message ?? 'Backfill error', log },
      { status: 500 }
    );
  }
}
