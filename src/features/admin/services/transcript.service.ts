import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { getDriveClient, PRIMARY_MAILBOX } from '@/lib/google-service-account';
import { createInsight } from './insights.service';
import type { InsightSource, InsightCategory } from '@/types/admin-types';

// ─── Config ───────────────────────────────────────────────────────────────────

const EXTRACTION_MODEL = 'claude-sonnet-4-6';   // clean ID — no date suffix
// Hebrew tokenizes ~1.33 chars/token (measured). 120K chars ≈ 90K tokens ≈ a ~2h meeting —
// a single call at that size must still finish inside the 60s function window. Over this we fail
// gracefully (chunking not yet implemented). Measured baseline: 40K chars / 30K tokens = ~32s.
const MAX_TRANSCRIPT_CHARS = 120_000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TranscriptExtraction {
  summary: string;
  actionItems: string[];
  entityType: 'authority' | 'user' | 'general';
  authorityName: string | null;
  category: InsightCategory;
  concepts: string[];
}

export interface ProcessedTranscript {
  insightId: string;
  summary: string;
  actionItems: string[];
  entityType: string;
  category: InsightCategory;
  authorityId: string | null;
  authorityName: string | null;
  concepts: string[];
  transcriptUrl: string;
  tasksCreated: number;
  log: string[];
}

// ─── Drive: read transcript text ─────────────────────────────────────────────

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const GDOC_MIME = 'application/vnd.google-apps.document';

export async function readTranscriptFromDrive(fileId: string): Promise<string> {
  const drive = await getDriveClient(PRIMARY_MAILBOX);

  const meta = await drive.files.get({
    fileId,
    fields: 'mimeType',
    supportsAllDrives: true,
  });
  const mimeType = meta.data.mimeType ?? '';

  if (mimeType === GDOC_MIME) {
    const res = await drive.files.export(
      { fileId, mimeType: 'text/plain' },
      { responseType: 'text' }
    );
    return (res.data as string) ?? '';
  }

  if (mimeType === DOCX_MIME) {
    const res = await (drive.files.get as any)(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' }
    );
    const mammoth = await import('mammoth');
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(res.data as ArrayBuffer) });
    return value;
  }

  const res = await (drive.files.get as any)(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'text' }
  );
  return (res.data as string) ?? '';
}

// ─── Claude: extract structured info from transcript text ─────────────────────

// JSON schema for structured outputs — guarantees schema-valid JSON, no regex cleanup.
const EXTRACTION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary:       { type: 'string' },
    actionItems:   { type: 'array', items: { type: 'string' } },
    entityType:    { enum: ['authority', 'user', 'general'] },
    authorityName: { type: ['string', 'null'] },
    category:      { enum: ['client_meeting', 'strategy', 'training', 'other'] },
    concepts:      { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'actionItems', 'entityType', 'authorityName', 'category', 'concepts'],
};

export async function extractFromTranscript(text: string): Promise<TranscriptExtraction> {
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: 3072,
    thinking: { type: 'disabled' },   // keep fast for the 60s scan window; enable adaptive if substance-classification underperforms
    output_config: { format: { type: 'json_schema', schema: EXTRACTION_SCHEMA } },
    messages: [{
      role: 'user',
      content: `אתה עוזר CRM של חברת OUT (אפליקציית כושר לרשויות ישראליות).
קרא את *כל* התמלול — מהתחלה ועד הסוף — וחלץ:

1. summary — סיכום בעברית, 3-5 משפטים, המכסה את כל הפגישה (לא רק הפתיחה).
2. actionItems — רשימת משימות, כל אחת משפט אחד.
3. entityType — ציר ניתוב: "authority" (רשות/עירייה) · "user" (ספורטאי/משתמש) · "general".
4. authorityName — שם הרשות המלא כפי שמופיע, או null.
5. category — ציר המהות של הפגישה. סווג לפי ה*מהות הדומיננטית*, לא לפי הפתיחה:
   • "client_meeting" — עסקה, מחיר, אחוזים, חוזה, רכש, תקצוב, מו"מ מסחרי.
   • "strategy" — כיוון, החלטות פנימיות, תכנון.
   • "training" — תוכן אימון/ספורט, שיחת מאמן↔ספורטאי.
   • "other" — לא מתאים לאף אחד.
   כלל הכרעה: מהות עסקית מנצחת מסגור חברתי/אימוני. פגישה שנפתחה
   ב-8 דקות שיחת כושר ואז עברה למו"מ על עסקה = "client_meeting", לא "training".
6. concepts — בחר רלוונטיים: "פנייה לנשים", "בקשת פיצ'ר", "תקצוב", "חוזה", "מדידה/KPI", "שיווק", "מוניציפלי", "משתמש פעיל", "תלונה", "שבח", "תחרות".

התמלול עשוי לכלול תוויות דובר (למשל "דוד:", "נציג העירייה:"). השתמש בהן
כדי לזהות מי אמר מה — במיוחד מי הציע עסקה/מחיר — לצורך סיווג המהות.

תמלול:
---
${text}
---`,
    }],
  });

  const raw = msg.content[0]?.type === 'text' ? msg.content[0].text : '';
  // structured outputs guarantees schema-valid JSON; parse directly, defensive fallback just in case.
  try {
    return JSON.parse(raw) as TranscriptExtraction;
  } catch {
    return { summary: raw.slice(0, 500), actionItems: [], entityType: 'general', authorityName: null, category: 'other', concepts: [] };
  }
}

// ─── Fuzzy authority resolution ───────────────────────────────────────────────

// Ordered longest-first so "מועצה אזורית" is stripped before "מועצה"
const AUTHORITY_PREFIXES = [
  'המועצה האזורית', 'המועצה המקומית', 'הועדה המקומית',
  'מועצה אזורית', 'מועצה מקומית', 'מועצה דתית',
  'ועדה מקומית', 'עיריית', 'עירית',
];

function normalizeName(name: string): string {
  let n = name.trim();
  for (const prefix of AUTHORITY_PREFIXES) {
    if (n.startsWith(prefix + ' ')) { n = n.slice(prefix.length).trim(); break; }
  }
  return n
    .replace(/[-–]/g, ' ')  // "תל-אביב" → "תל אביב"
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  const row = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = i;
    for (let j = 1; j <= n; j++) {
      const val = row[j];
      row[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, row[j], row[j - 1]);
      prev = val;
    }
    row[0] = i + 1;
  }
  return row[n];
}

export async function resolveAuthority(name: string): Promise<{ id: string; name: string } | null> {
  const db = getAdminDb();

  // 1. Exact match (fast path)
  const exact = await db.collection('authorities').where('name', '==', name).limit(1).get();
  if (!exact.empty) return { id: exact.docs[0].id, name: exact.docs[0].data().name as string };

  // 2. Fuzzy: load all names (field mask — payload is tiny), compare normalized
  const all = await (db.collection('authorities') as any).select('name').get();
  const normalizedInput = normalizeName(name);
  if (normalizedInput.length < 3) return null;

  let best: { id: string; name: string } | null = null;
  let bestDist = Infinity;

  for (const docSnap of all.docs) {
    const authorityName = docSnap.data().name as string;
    const dist = levenshtein(normalizedInput, normalizeName(authorityName));
    if (dist < bestDist) { bestDist = dist; best = { id: docSnap.id, name: authorityName }; }
  }

  // Accept if ≤ 2 edits (handles אשכלון/אשקלון, קרית/קריית, etc.)
  return best && bestDist <= 2 ? best : null;
}

// ─── Firestore: append meeting entry to authority activityLog ─────────────────

export async function appendToActivityLog(
  authorityId: string,
  summary: string,
  transcriptUrl: string,
  date: Date,
): Promise<void> {
  const db = getAdminDb();
  await db.collection('authorities').doc(authorityId).update({
    activityLog: FieldValue.arrayUnion({
      id: crypto.randomUUID(),
      type: 'meeting',
      content: summary,
      gmailUrl: transcriptUrl,
      date: Timestamp.fromDate(date),
      createdAt: Timestamp.now(),
      createdBy: 'transcript-agent',
    }),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

// ─── Firestore: convert action items to authority tasks ───────────────────────

export async function appendTasksFromActionItems(
  authorityId: string,
  actionItems: string[],
  sourceLabel: string,
): Promise<void> {
  if (!actionItems.length) return;
  const db = getAdminDb();

  const tasks = actionItems.map(title => ({
    id: crypto.randomUUID(),
    title,
    description: `מתמלול: ${sourceLabel}`,
    status: 'pending',
    createdAt: Timestamp.now(),
    createdBy: 'transcript-agent',
  }));

  await db.collection('authorities').doc(authorityId).update({
    tasks: FieldValue.arrayUnion(...tasks),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

// ─── Full pipeline for one transcript ────────────────────────────────────────

export async function processTranscript({
  text,
  fileId,
  fileName,
  source = 'meeting',
  date = new Date(),
  hintAuthorityId,
}: {
  text: string;
  fileId?: string;
  fileName?: string;
  source?: InsightSource;
  date?: Date;
  hintAuthorityId?: string;
}): Promise<ProcessedTranscript> {
  // Soft ceiling — chunking not yet implemented. Fail gracefully BEFORE any Claude call or Firestore write.
  if (text.length > MAX_TRANSCRIPT_CHARS) {
    throw new Error(
      `תמלול חורג מהתקרה (${text.length.toLocaleString()} תווים, מקס' ${MAX_TRANSCRIPT_CHARS.toLocaleString()}). ` +
      `עיבוד chunking עדיין לא ממומש — יש לפצל את הקובץ ידנית.`
    );
  }

  const log: string[] = [];
  const push = (s: string) => log.push(s);
  const transcriptUrl = fileId ? `https://drive.google.com/file/d/${fileId}/view` : '';
  const sourceLabel = fileName ?? fileId ?? 'תמלול';

  push('🧠 מחלץ סיכום...');
  const extraction = await extractFromTranscript(text);
  push(`✅ entityType=${extraction.entityType} | category=${extraction.category} | concepts: ${extraction.concepts.join(', ') || 'none'}`);

  let authorityId = hintAuthorityId ?? null;
  let authorityName: string | null = extraction.authorityName;

  if (!authorityId && extraction.authorityName) {
    push(`🔍 fuzzy match: "${extraction.authorityName}"`);
    const found = await resolveAuthority(extraction.authorityName);
    if (found) {
      authorityId = found.id;
      authorityName = found.name;
      push(`✅ ${found.name} (${found.id})`);
    } else {
      push(`⚠️ לא נמצאה: ${extraction.authorityName}`);
    }
  }

  push('💾 שומר insight...');
  const insightId = await createInsight({
    source,
    date,
    transcriptUrl,
    summary: extraction.summary,
    actionItems: extraction.actionItems,
    entityType: authorityId ? 'authority' : extraction.entityType,
    category: extraction.category,
    authorityId: authorityId ?? undefined,
    authorityName: authorityName ?? undefined,
    concepts: extraction.concepts,
  });
  push(`✅ insights/${insightId}`);

  let tasksCreated = 0;

  if (authorityId) {
    push(`📋 activityLog → ${authorityName}`);
    try {
      await appendToActivityLog(authorityId, extraction.summary, transcriptUrl, date);
      push('✅ activityLog עודכן');
    } catch (err: any) {
      push(`⚠️ activityLog נכשל: ${err?.message}`);
    }

    if (extraction.actionItems.length) {
      push(`📌 יוצר ${extraction.actionItems.length} משימות...`);
      try {
        await appendTasksFromActionItems(authorityId, extraction.actionItems, sourceLabel);
        tasksCreated = extraction.actionItems.length;
        push(`✅ ${tasksCreated} משימות נוצרו`);
      } catch (err: any) {
        push(`⚠️ משימות נכשלו: ${err?.message}`);
      }
    }
  }

  return {
    insightId,
    summary: extraction.summary,
    actionItems: extraction.actionItems,
    entityType: authorityId ? 'authority' : extraction.entityType,
    category: extraction.category,
    authorityId,
    authorityName,
    concepts: extraction.concepts,
    transcriptUrl,
    tasksCreated,
    log,
  };
}
