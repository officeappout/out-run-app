/**
 * POST /api/admin/crm-agent/run
 * Body: { dryRun?: boolean }
 *
 * Daily CRM scan: 3 mailboxes → 24h threads → match authority → update
 * activityLog / pipeline / documents / drafts → return structured JSON.
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  HARD SAFETY RULE                                               ║
 * ║  This file NEVER calls gmail.users.messages.send().             ║
 * ║  Only gmail.users.drafts.create() is permitted for writes.      ║
 * ║  makeSendSafe() enforces this at runtime on every client.       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */
import 'server-only';
// Vercel Hobby cap is 60s. Phase 2+3 are parallelized so the realistic ceiling
// is ~15s for scanning (vs ~12s serial) + ~30s for processing matched threads
// on a busy day — well within budget.
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  getCombinedClient,
  ALL_MAILBOXES,
  PRIMARY_MAILBOX,
  AUTHORITIES_ROOT_FOLDER_ID,
} from '@/lib/google-service-account';

// ─── Result contract ──────────────────────────────────────────────────────────

type PipelineStatus = 'draft' | 'lead' | 'meeting' | 'quote' | 'follow_up' | 'closing' | 'active' | 'upsell';
type DocType = 'quote' | 'presentation' | 'contract' | 'invoice' | 'single_supplier' | 'service_agreement' | 'other';

export interface CrmScanResult {
  date: string;
  dryRun: boolean;
  newLeads:        { authorityId: string; authorityName: string; threadId: string; gmailUrl: string }[];
  statusChanges:   { authorityId: string; authorityName: string; from: PipelineStatus; to: PipelineStatus; reason: string; threadId: string }[];
  documentsAdded:  { authorityId: string; authorityName: string; filename: string; docType: DocType; driveUrl: string; threadId: string }[];
  draftsPending:   { authorityId: string; authorityName: string; draftId: string; subject: string; threadId: string }[];
  skipped:         { threadId: string; subject: string; reason: string; mailbox: string }[];
  needsAttention:  { authorityId: string; authorityName: string; issue: string; urgency: 'high' | 'medium' }[];
  topPriorities:   { rank: number; authorityId: string; authorityName: string; currentStatus: PipelineStatus; reason: string; score: number; action: string }[];
  /** Authorities with > 180 days of silence — shown as a separate "revive or archive" bucket, NOT in topPriorities */
  dormant:         { authorityId: string; authorityName: string; currentStatus: PipelineStatus; daysSilent: number }[];
  stats: { threadsScanned: number; threadsMatched: number; authoritiesUpdated: number; apiCalls: number };
  runLog: string[];
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface AuthorityRecord {
  id: string; name: string; pipelineStatus: PipelineStatus;
  isActiveClient: boolean;
  contacts: Array<{ email?: string; name?: string }>;
  activityLog: Array<{ date?: any; createdAt?: any; type?: string }>;
}

interface MatchedThread {
  threadId: string; mailbox: string; subject: string; snippet: string;
  fromEmail: string; messageId: string; hasAttachments: boolean;
  latestMessageTs: number; matchReason: string;
  authorityId: string; authorityName: string;
}

// ─── SEND GUARD (runtime) ─────────────────────────────────────────────────────

/**
 * Wraps every gmail client so that any attempt to call messages.send()
 * throws immediately. This is a defense-in-depth guard — the code above
 * never calls send, and this ensures it stays that way even if someone
 * pastes in an accidental call during future edits.
 */
function makeSendSafe(gmail: any): any {
  gmail.users.messages = new Proxy(gmail.users.messages, {
    get(target, prop: string) {
      if (prop === 'send') {
        throw new Error(
          '[crm-agent] FORBIDDEN: messages.send() must not be called. ' +
          'Use gmail.users.drafts.create() for outbound messages.',
        );
      }
      return (target as any)[prop];
    },
  });
  return gmail;
}

// ─── Pipeline advance signals ─────────────────────────────────────────────────

const PIPELINE_SIGNALS: Array<{
  patterns: RegExp[];
  fromStatuses: PipelineStatus[];
  toStatus: PipelineStatus;
  reason: string;
}> = [
  {
    patterns: [/נקבעה\s*פגישה|פגישה\s*ביום|הזמנה\s*לפגישה|meeting\s*scheduled|call\s*scheduled/i],
    fromStatuses: ['lead', 'draft'],
    toStatus: 'meeting',
    reason: 'פגישה נקבעה',
  },
  {
    patterns: [/הצעת\s*מחיר|הצ[""״]מ|quote\s*attached|proposal\s*attached|מצרף\s*הצעה/i],
    fromStatuses: ['meeting', 'lead'],
    toStatus: 'quote',
    reason: 'הצעת מחיר נשלחה',
  },
  {
    patterns: [/ממתינים\s*לאישור|מחכים\s*לתשובה|pending\s*approval|follow.?up/i],
    fromStatuses: ['quote'],
    toStatus: 'follow_up',
    reason: 'ממתין לאישור',
  },
  {
    patterns: [/אישרנו|אנחנו\s*מאשרים|נחתם|בסגירה|signed|approved|moving\s*forward/i],
    fromStatuses: ['follow_up', 'quote', 'meeting'],
    toStatus: 'closing',
    reason: 'אישור / חתימה',
  },
];

const PIPELINE_ORDER: PipelineStatus[] = [
  'draft', 'lead', 'meeting', 'quote', 'follow_up', 'closing', 'active', 'upsell',
];

function detectStatusAdvance(text: string, current: PipelineStatus): { to: PipelineStatus; reason: string } | null {
  if (current === 'active' || current === 'upsell') return null; // never auto-advance clients
  for (const sig of PIPELINE_SIGNALS) {
    if (!sig.fromStatuses.includes(current)) continue;
    if (sig.patterns.some(p => p.test(text))) {
      if (PIPELINE_ORDER.indexOf(sig.toStatus) > PIPELINE_ORDER.indexOf(current)) {
        return { to: sig.toStatus, reason: sig.reason };
      }
    }
  }
  return null;
}

// ─── Thread noise filters ─────────────────────────────────────────────────────

const SKIP_THREAD_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /unsubscribe|list-id|newsletter/i,                        reason: 'newsletter' },
  { pattern: /goren-amir\.co\.il/i,                                    reason: 'broker domain' },
  { pattern: /שיתוף\s*פעולה\s*מסחרי|הסכם\s*עמלה|commission|broker/i, reason: 'broker content' },
  { pattern: /no.?reply|noreply|donotreply/i,                          reason: 'automated sender' },
];

function shouldSkipThread(from: string, subject: string, snippet: string): string | null {
  const text = `${from} ${subject} ${snippet}`;
  for (const { pattern, reason } of SKIP_THREAD_PATTERNS) {
    if (pattern.test(text)) return reason;
  }
  return null;
}

// ─── Authority name matching ──────────────────────────────────────────────────

function authorityKeywords(name: string): string[] {
  return name.split(/[\s,.()\-/]+/).filter(w => w.length >= 3).map(w => w.toLowerCase());
}

function nameMatchScore(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.filter(kw => lower.includes(kw)).length;
}

// ─── Document attachment classification (mirrors backfill route) ──────────────

const FILENAME_RULES: { pattern: RegExp; type: DocType; priority: number }[] = [
  { pattern: /הצע(ת|ה)\s*מחיר|הצ[""״]מ|quote|proposal/i,                         type: 'quote',           priority: 1 },
  { pattern: /חוזה|הסכם\s*שירות|service[\s._-]?agr|contract/i,                    type: 'contract',        priority: 2 },
  { pattern: /ספק\s*יחיד|טופס\s*הזמנה|הזמנת\s*עבודה|order/i,                     type: 'single_supplier', priority: 3 },
  { pattern: /חשבון\s*עסקה|חשבונית|קבלה|invoice|receipt/i,                         type: 'invoice',         priority: 4 },
  { pattern: /מצגת|presentation|\.pptx?$/i,                                         type: 'presentation',    priority: 5 },
];
const NOISE_FILES = [/^image\d+/i, /^WRD\d+/i, /תקנון/i, /policy/i, /הבהרות/i, /ISO\d/i];
const MIN_ATTACHMENT_SIZE = 50_000;

function classifyFile(name: string): { type: DocType; priority: number } | null {
  if (!/\.(pdf|docx?|xlsx?|pptx?|png|jpg|jpeg)$/i.test(name)) return null;
  for (const rule of FILENAME_RULES) {
    if (rule.pattern.test(name)) return { type: rule.type, priority: rule.priority };
  }
  return { type: 'other', priority: 99 };
}

function isNoisyFile(name: string, size: number, mime: string): boolean {
  if (mime.startsWith('image/') && size < MIN_ATTACHMENT_SIZE) return true;
  if (size > 0 && size < MIN_ATTACHMENT_SIZE && /\.(png|jpg|jpeg|gif)$/i.test(name)) return true;
  return NOISE_FILES.some(p => p.test(name));
}

// ─── Gmail helpers ────────────────────────────────────────────────────────────

const gmailUrl = (threadId: string) =>
  `https://mail.google.com/mail/u/0/#inbox/${threadId}`;

async function ensureCrmLabel(gmail: any): Promise<string> {
  const { data } = await gmail.users.labels.list({ userId: 'me' });
  const found = (data.labels ?? []).find((l: any) => l.name === 'CRM-processed');
  if (found?.id) return found.id;
  const created = await gmail.users.labels.create({
    userId: 'me',
    requestBody: { name: 'CRM-processed', messageListVisibility: 'hide', labelListVisibility: 'labelShow' },
  });
  return created.data.id!;
}

// ─── Attachment processing ────────────────────────────────────────────────────

interface PendingAttachment {
  messageId: string; attachmentId: string;
  filename: string; mimeType: string; size: number;
  type: DocType; priority: number;
}

function collectAttachments(messages: any[]): PendingAttachment[] {
  const out: PendingAttachment[] = [];
  for (const msg of messages) {
    const walk = (parts: any[]) => {
      for (const p of parts ?? []) {
        if (p.parts) walk(p.parts);
        if (!p.filename || !p.body?.attachmentId) continue;
        const classified = classifyFile(p.filename);
        if (!classified) continue;
        if (isNoisyFile(p.filename, p.body.size ?? 0, p.mimeType ?? '')) continue;
        out.push({
          messageId: msg.id!, attachmentId: p.body.attachmentId,
          filename: p.filename, mimeType: p.mimeType ?? 'application/octet-stream',
          size: p.body.size ?? 0, ...classified,
        });
      }
    };
    walk(msg.payload?.parts ?? []);
  }
  return out.sort((a, b) => a.priority - b.priority);
}

async function getOrCreateFolder(drive: any, name: string): Promise<string> {
  const safe = name.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${safe}' and '${AUTHORITIES_ROOT_FOLDER_ID}' in parents and trashed=false`,
    fields: 'files(id)', supportsAllDrives: true, includeItemsFromAllDrives: true,
  });
  if (res.data.files?.[0]?.id) return res.data.files[0].id;
  const created = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [AUTHORITIES_ROOT_FOLDER_ID] },
    fields: 'id', supportsAllDrives: true,
  });
  return created.data.id!;
}

// ─── topPriorities scoring ────────────────────────────────────────────────────

/** Authorities silent for longer than this go to the dormant bucket, not topPriorities */
const DORMANT_DAYS = 180;

const STATUS_BASE_SCORE: Partial<Record<PipelineStatus, number>> = {
  closing: 8, follow_up: 6, quote: 4, meeting: 2, lead: 1,
};

interface TodayActivity {
  statusChanged?: boolean; hasNewDocs?: boolean; hasDraft?: boolean; isNewLead?: boolean;
}

function lastActivityDays(auth: AuthorityRecord): number | null {
  const timestamps = auth.activityLog
    .map(e => e.date?.toDate?.()?.getTime() ?? (e.createdAt ? new Date(e.createdAt).getTime() : 0))
    .filter(Boolean);
  if (!timestamps.length) return null;
  return (Date.now() - Math.max(...timestamps)) / 86_400_000;
}

function isDormant(auth: AuthorityRecord): boolean {
  const days = lastActivityDays(auth);
  // No activity recorded at all → treat as dormant only for hot statuses
  if (days === null) return ['follow_up', 'closing', 'quote'].includes(auth.pipelineStatus);
  return days > DORMANT_DAYS;
}

function scorePriority(auth: AuthorityRecord, today: TodayActivity): number {
  let s = STATUS_BASE_SCORE[auth.pipelineStatus] ?? 0;

  // Fresh signals dominate — these mean something happened TODAY
  if (today.statusChanged) s += 10;
  if (today.hasDraft)      s += 6;
  if (today.hasNewDocs)    s += 5;
  if (today.isNewLead)     s += 4;

  const days = lastActivityDays(auth);
  if (days !== null) {
    // Recency bonus: recent activity = urgent
    if (days < 1)   s += 6;  // today
    else if (days < 7)  s += 4;  // this week
    else if (days < 30) s += 2;  // this month
    // Decay for cooling-off (but below DORMANT_DAYS — dormant are excluded before scoring)
    if (days > 60)  s -= 2;
    if (days > 120) s -= 2;
  }
  return s;
}

function buildReason(auth: AuthorityRecord, today: TodayActivity): string {
  const parts: string[] = [];
  if (today.statusChanged) parts.push('שינוי סטטוס היום');
  if (today.hasDraft)      parts.push('טיוטה ממתינה');
  if (today.hasNewDocs)    parts.push('מסמכים חדשים');
  if (auth.pipelineStatus === 'closing')   parts.push('שלב סגירה');
  if (auth.pipelineStatus === 'follow_up') parts.push('ממתין לאישור');
  if (auth.pipelineStatus === 'quote')     parts.push('הצעה בשטח');
  const days = lastActivityDays(auth);
  if (days !== null && days > 7) parts.push(`${Math.floor(days)} ימים ללא פעילות`);
  return parts.join(' · ') || auth.pipelineStatus;
}

function suggestAction(auth: AuthorityRecord, today: TodayActivity): string {
  if (today.hasDraft)                       return 'בדוק ואשר טיוטת תגובה';
  if (auth.pipelineStatus === 'closing')    return 'עקוב אחר חתימת חוזה';
  if (auth.pipelineStatus === 'follow_up')  return 'שלח תזכורת / בדוק סטטוס';
  if (auth.pipelineStatus === 'quote')      return 'עקוב אחר הצעת המחיר';
  if (auth.pipelineStatus === 'meeting')    return 'שלח הצעת מחיר';
  if (auth.pipelineStatus === 'lead')       return 'קבע פגישה';
  return 'בדוק ידנית';
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  let body: { dryRun?: boolean } = {};
  try { body = await request.json(); } catch { /* empty body */ }
  const dryRun = body.dryRun ?? false;

  const runLog: string[] = [];
  const log = (msg: string) => { runLog.push(msg); console.log(`[crm-agent] ${msg}`); };

  const result: CrmScanResult = {
    date: new Date().toISOString(),
    dryRun,
    newLeads: [], statusChanges: [], documentsAdded: [],
    draftsPending: [], skipped: [], needsAttention: [], topPriorities: [], dormant: [],
    stats: { threadsScanned: 0, threadsMatched: 0, authoritiesUpdated: 0, apiCalls: 0 },
    runLog,
  };
  const apiCall = () => { result.stats.apiCalls++; };

  try {
    const db = getAdminDb();

    // ── Phase 1: Load authorities ─────────────────────────────────────────────
    log('── Phase 1: Loading authorities');
    const snap = await db.collection('authorities').get();
    apiCall();

    const authorities: AuthorityRecord[] = snap.docs
      .filter(d => (d.data().pipelineStatus ?? 'lead') !== 'draft')
      .map(d => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name ?? d.id,
          pipelineStatus: (data.pipelineStatus ?? 'lead') as PipelineStatus,
          isActiveClient: data.isActiveClient ?? false,
          contacts: data.contacts ?? [],
          activityLog: data.activityLog ?? [],
        };
      });
    log(`   ${authorities.length} non-draft authorities loaded`);

    const emailToAuth = new Map<string, AuthorityRecord>();
    for (const a of authorities) {
      for (const c of a.contacts) {
        if (c.email) emailToAuth.set(c.email.toLowerCase(), a);
      }
    }

    // ── Phase 2: Build Gmail clients in parallel (send-safe) ─────────────────
    log('── Phase 2: Building Gmail clients (parallel)');
    const mailboxClients = await Promise.all(
      ALL_MAILBOXES.map(async mailbox => {
        const { gmail, drive } = await getCombinedClient(mailbox);
        return { gmail: makeSendSafe(gmail), drive, email: mailbox };
      })
    );

    let crmLabelId = '';
    if (!dryRun) {
      const primary = mailboxClients.find(m => m.email === PRIMARY_MAILBOX)!.gmail;
      crmLabelId = await ensureCrmLabel(primary);
      apiCall();
      log(`   CRM-processed label: ${crmLabelId}`);
    }

    // ── Phase 3: Parallel mailbox scan + metadata fetch ───────────────────────
    // All three mailboxes list simultaneously; within each mailbox all thread
    // metadata fetches also run in parallel. Serial baseline: ~12s → parallel: ~3s.
    log('── Phase 3: Scanning mailboxes in parallel (last 24h, no CRM-processed)');

    const mailboxScanResults = await Promise.all(
      mailboxClients.map(async ({ gmail, email: mailbox }) => {
        const res = await gmail.users.threads.list({
          userId: 'me', q: 'newer_than:1d -label:CRM-processed', maxResults: 50,
        });
        apiCall();
        const threads: any[] = res.data.threads ?? [];
        log(`   [${mailbox}] ${threads.length} thread(s) found`);

        // Parallel metadata for every thread in this mailbox
        const metas = await Promise.all(
          threads.map(async t => {
            const detail = await gmail.users.threads.get({ userId: 'me', id: t.id!, format: 'metadata' });
            apiCall();
            return { threadId: t.id! as string, detail };
          })
        );
        return { mailbox, gmail, count: threads.length, metas };
      })
    );

    // Deduplicate cross-mailbox + authority matching (sequential, CPU-only)
    const seenThreadIds = new Set<string>();
    const matchedThreads: MatchedThread[] = [];

    for (const { mailbox, gmail: _gmail, count, metas } of mailboxScanResults) {
      result.stats.threadsScanned += count;
      for (const { threadId, detail } of metas) {
        if (seenThreadIds.has(threadId)) continue;
        seenThreadIds.add(threadId);

        const messages: any[] = detail.data.messages ?? [];
        if (!messages.length) continue;

        const lastMsg = messages[messages.length - 1];
        const hdrs: Record<string, string> = {};
        for (const h of lastMsg.payload?.headers ?? []) hdrs[h.name.toLowerCase()] = h.value;
        const subject   = hdrs['subject'] ?? '(no subject)';
        const from      = hdrs['from'] ?? '';
        const messageId = hdrs['message-id'] ?? '';
        const snippet   = lastMsg.snippet ?? '';
        const hasAtt    = messages.some((m: any) =>
          (m.payload?.parts ?? []).some((p: any) => !!p.filename));
        const latestTs  = Number(lastMsg.internalDate ?? 0);

        const skipReason = shouldSkipThread(from, subject, snippet);
        if (skipReason) {
          result.skipped.push({ threadId, subject, reason: skipReason, mailbox });
          continue;
        }

        // Match: 1) contact email, 2) name keywords in subject + snippet
        const fromEmail = (from.match(/<(.+?)>/) ?? [, from])[1]!.toLowerCase().trim();
        let matchedAuth = emailToAuth.get(fromEmail) ?? null;
        let matchReason = 'contact_email';

        if (!matchedAuth) {
          const searchText = `${subject} ${snippet}`;
          let best: { auth: AuthorityRecord; score: number } | null = null;
          for (const auth of authorities) {
            const score = nameMatchScore(searchText, authorityKeywords(auth.name));
            if (score >= 2 && (!best || score > best.score)) best = { auth, score };
          }
          if (best) { matchedAuth = best.auth; matchReason = 'name_keyword'; }
        }

        if (!matchedAuth) {
          result.skipped.push({ threadId, subject, reason: 'no authority match', mailbox });
          continue;
        }

        matchedThreads.push({
          threadId, mailbox, subject, snippet, fromEmail, messageId,
          hasAttachments: hasAtt, latestMessageTs: latestTs, matchReason,
          authorityId: matchedAuth.id, authorityName: matchedAuth.name,
        });
        result.stats.threadsMatched++;
        log(`   ✅ ${threadId} → ${matchedAuth.name} (${matchReason})`);
      }
    }

    // ── Phase 4: Process matched threads ──────────────────────────────────────
    // Threads are processed sequentially to keep Firestore writes predictable.
    // CRM-processed label is NOT applied here — see Phase 4.5 for the guard.
    log(`── Phase 4: Processing ${matchedThreads.length} matched thread(s)`);
    const activityByAuth = new Map<string, TodayActivity>();
    const getAct = (id: string) => {
      if (!activityByAuth.has(id)) activityByAuth.set(id, {});
      return activityByAuth.get(id)!;
    };
    const processedThreadIds: string[] = [];

    for (const thread of matchedThreads) {
      const { threadId, mailbox, subject, snippet, fromEmail, messageId,
              authorityId, authorityName, hasAttachments } = thread;
      log(`\n   ▶ [${authorityName}] thread ${threadId}`);

      const authority = authorities.find(a => a.id === authorityId)!;
      const docRef    = db.collection('authorities').doc(authorityId);
      const signalText = `${subject} ${snippet}`;

      // 4a. activityLog entry ─────────────────────────────────────────────────
      const logEntry = {
        id: crypto.randomUUID(),
        type: 'email_received',
        date: Timestamp.now(),
        summary: `מייל נכנס: "${subject.slice(0, 80)}"`,
        gmailUrl: gmailUrl(threadId),
        createdAt: Timestamp.now(),
        createdBy: 'crm-agent',
      };
      if (!dryRun) {
        await docRef.update({ activityLog: FieldValue.arrayUnion(logEntry), updatedAt: FieldValue.serverTimestamp() });
        apiCall();
      }
      log(`      📝 activityLog written`);

      // 4b. Pipeline status advance ───────────────────────────────────────────
      const advance = detectStatusAdvance(signalText, authority.pipelineStatus);
      if (advance && !authority.isActiveClient) {
        log(`      📈 ${authority.pipelineStatus} → ${advance.to} (${advance.reason})`);
        const statusEntry = {
          id: crypto.randomUUID(), type: 'status_changed',
          date: Timestamp.now(),
          summary: `סטטוס עודכן: ${authority.pipelineStatus} → ${advance.to} (${advance.reason})`,
          gmailUrl: gmailUrl(threadId), createdAt: Timestamp.now(), createdBy: 'crm-agent',
        };
        result.statusChanges.push({
          authorityId, authorityName, from: authority.pipelineStatus, to: advance.to,
          reason: advance.reason, threadId,
        });
        if (!dryRun) {
          await docRef.update({
            pipelineStatus: advance.to,
            activityLog: FieldValue.arrayUnion(statusEntry),
            updatedAt: FieldValue.serverTimestamp(),
          });
          apiCall();
        }
        authority.pipelineStatus = advance.to; // update in-memory for scoring
        getAct(authorityId).statusChanged = true;
      }

      // 4c. Attachments ───────────────────────────────────────────────────────
      if (hasAttachments) {
        log(`      📎 processing attachments…`);
        try {
          const { gmail: sourceGmail, drive } = mailboxClients.find(m => m.email === mailbox)!;
          const fullThread = await sourceGmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' });
          apiCall();

          const pending = collectAttachments(fullThread.data.messages ?? []);
          log(`         ${pending.length} classified attachment(s)`);

          if (pending.length && !dryRun) {
            const { Readable } = await import('stream');
            const folderId = await getOrCreateFolder(drive, authorityName);
            apiCall();
            const newDocs: any[] = [];
            const seenFiles = new Set<string>(); // dedupe within thread

            for (const att of pending) {
              const key = `${att.filename.toLowerCase()}::${att.size}`;
              if (seenFiles.has(key)) { log(`         ⏭ dupe: ${att.filename}`); continue; }
              seenFiles.add(key);

              const attRes = await sourceGmail.users.messages.attachments.get({
                userId: 'me', messageId: att.messageId, id: att.attachmentId,
              });
              apiCall();
              const buffer = Buffer.from(
                (attRes.data.data ?? '').replace(/-/g, '+').replace(/_/g, '/'), 'base64',
              );
              const uploadRes = await drive.files.create({
                requestBody: { name: att.filename, parents: [folderId] },
                media: { mimeType: att.mimeType, body: Readable.from(buffer) },
                fields: 'id,name,webViewLink', supportsAllDrives: true,
              });
              apiCall();
              const newDoc = {
                id: crypto.randomUUID(), name: att.filename, type: att.type,
                direction: 'received', date: Timestamp.now(),
                driveFileId: uploadRes.data.id!, driveUrl: uploadRes.data.webViewLink!,
                size: att.size, threadId, createdAt: Timestamp.now(), createdBy: 'crm-agent',
              };
              newDocs.push(newDoc);
              result.documentsAdded.push({ authorityId, authorityName, filename: att.filename, docType: att.type, driveUrl: uploadRes.data.webViewLink!, threadId });
              log(`         💾 ${att.filename} (${att.type}) → Drive`);
            }

            if (newDocs.length) {
              await docRef.update({ documents: FieldValue.arrayUnion(...newDocs), updatedAt: FieldValue.serverTimestamp() });
              apiCall();
              getAct(authorityId).hasNewDocs = true;
            }
          }
        } catch (err: any) {
          log(`      ⚠️ attachment error: ${err?.message}`);
          result.needsAttention.push({ authorityId, authorityName, issue: `שגיאה במסמכים: ${err?.message}`, urgency: 'medium' });
        }
      }

      // 4d. Create reply draft (only if last message is FROM authority) ────────
      const isFromAuthority = !fromEmail.endsWith('appout.co.il');
      if (isFromAuthority && !dryRun) {
        try {
          const { gmail: sourceGmail } = mailboxClients.find(m => m.email === mailbox)!;
          const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
          const rawEmail = [
            `From: ${PRIMARY_MAILBOX}`,
            `To: ${fromEmail}`,
            `Subject: ${replySubject}`,
            ...(messageId ? [`In-Reply-To: ${messageId}`, `References: ${messageId}`] : []),
            `Content-Type: text/plain; charset=UTF-8`,
            '',
            `שלום,\n\nתודה על פנייתך.\n\n`,
          ].join('\r\n');

          const draft = await sourceGmail.users.drafts.create({
            userId: 'me',
            requestBody: { message: { raw: Buffer.from(rawEmail).toString('base64url'), threadId } },
          });
          apiCall();
          result.draftsPending.push({ authorityId, authorityName, draftId: draft.data.id!, subject: replySubject, threadId });
          getAct(authorityId).hasDraft = true;
          log(`      ✉️  draft ${draft.data.id} created`);
        } catch (err: any) {
          log(`      ⚠️ draft error: ${err?.message}`);
        }
      }

      // Mark this thread as fully processed — label applied in Phase 4.5
      processedThreadIds.push(threadId);
      result.stats.authoritiesUpdated++;
    }

    // ── Phase 4.5: Batch-label fully-processed threads ────────────────────────
    // Guard: labels are applied only AFTER every thread's Firestore writes and
    // Drive uploads complete. If the route times out mid-Phase 4, nothing gets
    // labeled → next Vercel Cron run re-processes unlabeled threads cleanly.
    if (!dryRun && crmLabelId && processedThreadIds.length > 0) {
      log(`\n── Phase 4.5: Labeling ${processedThreadIds.length} processed thread(s)`);
      const { gmail: primaryGmail } = mailboxClients.find(m => m.email === PRIMARY_MAILBOX)!;
      await Promise.all(
        processedThreadIds.map(tid =>
          primaryGmail.users.threads.modify({
            userId: 'me', id: tid, requestBody: { addLabelIds: [crmLabelId] },
          }).catch((err: any) => log(`   ⚠️ label ${tid}: ${err?.message}`))
        )
      );
      apiCall();
    }

    // ── Phase 5: Build topPriorities + dormant (Decide layer) ────────────────
    log('\n── Phase 5: Building topPriorities + dormant bucket');
    const eligible = authorities.filter(
      a => !['active', 'upsell', 'draft'].includes(a.pipelineStatus)
    );

    // Separate dormant (> 180 days silent) from active pipeline
    for (const a of eligible) {
      if (isDormant(a)) {
        const days = lastActivityDays(a);
        result.dormant.push({
          authorityId: a.id, authorityName: a.name,
          currentStatus: a.pipelineStatus,
          daysSilent: days !== null ? Math.floor(days) : 999,
        });
      }
    }
    result.dormant.sort((x, y) => y.daysSilent - x.daysSilent);
    log(`   Dormant: ${result.dormant.length}`);

    // topPriorities: non-dormant only, sorted by fresh-signal-weighted score
    const scored = eligible
      .filter(a => !isDormant(a))
      .map(a => ({ a, score: scorePriority(a, activityByAuth.get(a.id) ?? {}) }))
      .filter(x => x.score >= 2)
      .sort((x, y) => y.score - x.score)
      .slice(0, 5);

    result.topPriorities = scored.map(({ a, score }, i) => {
      const today = activityByAuth.get(a.id) ?? {};
      return {
        rank: i + 1, authorityId: a.id, authorityName: a.name,
        currentStatus: a.pipelineStatus,
        reason: buildReason(a, today),
        score,
        action: suggestAction(a, today),
      };
    });
    log(`   Top ${result.topPriorities.length} priorities ranked`);

    // ── Persist run record (non-dry-run only) ─────────────────────────────────
    // Stores the result in crm_runs/{YYYY-MM-DD} so the panel can show the
    // morning digest without David having to trigger it manually.
    if (!dryRun) {
      try {
        const dateKey = new Date().toISOString().slice(0, 10);
        await db.collection('crm_runs').doc(dateKey).set({
          ...result,
          savedAt: FieldValue.serverTimestamp(),
        });
        log(`   💾 run saved → crm_runs/${dateKey}`);
      } catch (err: any) {
        log(`   ⚠️ could not save run record: ${err?.message}`);
      }
    }

    log('\n✅ CRM agent run complete');
    return NextResponse.json(result);

  } catch (err: any) {
    log(`❌ Fatal: ${err?.message ?? err}`);
    console.error('[crm-agent/run]', err);
    return NextResponse.json({ ...result, error: err?.message ?? 'CRM agent error' }, { status: 500 });
  }
}

// ─── GET handler — Vercel Cron entry point ────────────────────────────────────
// Vercel Cron calls GET /api/admin/crm-agent/run daily at 08:07 IDT.
// Auth: Authorization: Bearer <CRON_SECRET> (set in Vercel env vars).
// Delegates to POST with dryRun: false so all logic stays in one place.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Build a synthetic POST request with admin key so requireAdminApi passes
  const synthetic = new NextRequest(request.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-agent-key': process.env.AGENT_API_KEY ?? '',
    },
    body: JSON.stringify({ dryRun: false }),
  });
  return POST(synthetic);
}
