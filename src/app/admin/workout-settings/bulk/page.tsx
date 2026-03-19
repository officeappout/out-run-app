'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useMemo } from 'react';
import { collection, writeBatch, doc, serverTimestamp, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Upload, FileText, CheckCircle2, AlertTriangle, Loader, Bug, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { getAvailableContentTags } from '@/features/content/branding/core/branding.utils';

const WORKOUT_METADATA_COLLECTION = 'workoutMetadata';
const BATCH_SIZE = 400;

type ContentType = 'titles' | 'phrases' | 'notifications' | 'descriptions' | 'coachTips';

interface BulkUploadResult {
  success: number;
  errors: number;
  errorsList: string[];
  diagnostics: RowDiagnostic[];
}

interface RowDiagnostic {
  row: number;
  status: 'ok' | 'skipped' | 'error';
  reason: string;
  rawLine?: string;
  parsedFields?: Record<string, string>;
}

const VALID_DAY_PERIODS = ['start_of_week', 'mid_week', 'weekend', 'all', ''];
const VALID_GENDERS = ['male', 'female', 'both', ''];
const VALID_TRIGGER_TYPES = ['Inactivity', 'Scheduled', 'Location_Based', 'Habit_Maintenance', 'Proximity'];
const VALID_LOCATIONS = ['home', 'park', 'street', 'office', 'school', 'gym', 'airport', 'library', 'desk', 'any', ''];
const VALID_VARIANTS = ['balanced', 'intense', 'naked', 'easy', 'all', ''];

const CONTENT_TYPE_BUTTONS: { key: ContentType; label: string }[] = [
  { key: 'titles', label: 'כותרות אימון' },
  { key: 'phrases', label: 'משפטים מוטיבציוניים' },
  { key: 'notifications', label: 'התראות' },
  { key: 'descriptions', label: 'תיאורים חכמים' },
  { key: 'coachTips', label: 'הערות מאמן' },
];

const COLLECTION_PATHS: Record<ContentType, string> = {
  titles: `${WORKOUT_METADATA_COLLECTION}/workoutTitles/titles`,
  phrases: `${WORKOUT_METADATA_COLLECTION}/motivationalPhrases/phrases`,
  notifications: `${WORKOUT_METADATA_COLLECTION}/notifications/notifications`,
  descriptions: `${WORKOUT_METADATA_COLLECTION}/smartDescriptions/descriptions`,
  coachTips: `${WORKOUT_METADATA_COLLECTION}/logicCues/cues`,
};

/**
 * FNV-1a 32-bit hash → hex string.
 * Deterministic, fast, good distribution for short strings.
 */
function fnv1aHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Generate a deterministic Firestore document ID from content fields.
 * Same content → same ID → re-upload overwrites instead of duplicating.
 */
function generateDocId(text: string, persona: string, bundleId: string, gender: string): string {
  const raw = [text.trim(), persona.trim(), bundleId.trim(), gender.trim()]
    .filter(Boolean)
    .join('|');
  return fnv1aHash(raw);
}

export default function BulkUploadPage() {
  const [csvInput, setCsvInput] = useState<string>('');
  const [contentType, setContentType] = useState<ContentType>('titles');
  const [uploading, setUploading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [result, setResult] = useState<BulkUploadResult | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Build the approved @tag set once for validation
  const approvedTags = useMemo(() => {
    const tags = getAvailableContentTags();
    return new Set(tags.map(t => t.tag));
  }, []);

  // ============================================================================
  // CSV PARSER
  // ============================================================================

  const parseCSVLine = (line: string, expectedColumns: number): string[] => {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());

    if (expectedColumns > 0 && fields.length > expectedColumns) {
      const metaFields = fields.slice(0, expectedColumns - 1);
      const textParts = fields.slice(expectedColumns - 1);
      metaFields.push(textParts.join(', '));
      return metaFields;
    }

    return fields;
  };

  const parseCSV = (text: string): { items: any[]; diagnostics: RowDiagnostic[] } => {
    const lines = text.trim().split('\n').map(l => l.replace(/\r$/, ''));
    const diagnostics: RowDiagnostic[] = [];

    if (lines.length < 2) {
      return { items: [], diagnostics: [{ row: 0, status: 'error', reason: 'CSV חייב להכיל לפחות שורת כותרות ושורת נתונים אחת' }] };
    }

    const headers = lines[0].split(',').map(h => h.trim());
    const expectedColumns = headers.length;
    const rows: any[] = [];

    console.log(`[BulkUpload] CSV headers (${expectedColumns} columns):`, headers);

    for (let i = 1; i < lines.length; i++) {
      const rawLine = lines[i];
      if (!rawLine.trim()) {
        diagnostics.push({ row: i + 1, status: 'skipped', reason: 'שורה ריקה', rawLine });
        continue;
      }

      const values = parseCSVLine(rawLine, expectedColumns);

      if (values.length < expectedColumns) {
        diagnostics.push({
          row: i + 1,
          status: 'skipped',
          reason: `מספר עמודות שגוי: נמצאו ${values.length}, צפוי ${expectedColumns}. ייתכן שחסרים שדות.`,
          rawLine,
        });
        continue;
      }

      const row: any = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });

      diagnostics.push({ row: i + 1, status: 'ok', reason: 'פורס בהצלחה', rawLine, parsedFields: { ...row } });
      rows.push(row);
    }

    console.log(`[BulkUpload] Parsed ${rows.length} rows from ${lines.length - 1} data lines.`);
    return { items: rows, diagnostics };
  };

  const parseJSON = (text: string): any[] => {
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      throw new Error('Invalid JSON format');
    }
  };

  // ============================================================================
  // TAG VALIDATION
  // ============================================================================

  /** Extract all @tags from a text string and check against the approved set */
  const validateTags = (text: string): string[] => {
    if (!text) return [];
    const warnings: string[] = [];
    // Match @word patterns (Hebrew + Latin + digits + underscores + slashes)
    const tagPattern = /@[\u0590-\u05FFa-zA-Z0-9_/]+/g;
    const found = text.match(tagPattern);
    if (!found) return [];

    for (const tag of found) {
      if (!approvedTags.has(tag)) {
        warnings.push(`תגית לא מוכרת: "${tag}"`);
      }
    }
    return warnings;
  };

  // ============================================================================
  // FIELD VALIDATION
  // ============================================================================

  const validateRow = (item: any, rowNum: number): { warnings: string[]; errors: string[] } => {
    const warnings: string[] = [];
    const errors: string[] = [];

    const dp = item.dayPeriod || item.תקופה_בשבוע || '';
    if (dp && !VALID_DAY_PERIODS.includes(dp)) {
      warnings.push(`dayPeriod לא תקין: "${dp}" (ערכים תקפים: start_of_week, mid_week, weekend, all)`);
    }

    const gender = item.gender || item.מגדר || '';
    if (gender && !VALID_GENDERS.includes(gender)) {
      warnings.push(`gender לא תקין: "${gender}" (ערכים תקפים: male, female, both)`);
    }

    const location = item.location || item.מיקום || '';
    if (location && !VALID_LOCATIONS.includes(location)) {
      warnings.push(`location לא תקין: "${location}"`);
    }

    const rawMin = item.minLevel ?? item.רמה_מינימלית ?? item.min_level ?? '';
    const rawMax = item.maxLevel ?? item.רמה_מקסימלית ?? item.max_level ?? '';
    if (rawMin !== '' && rawMax !== '') {
      const nMin = parseInt(String(rawMin));
      const nMax = parseInt(String(rawMax));
      if (!isNaN(nMin) && !isNaN(nMax) && nMin > nMax) {
        warnings.push(`minLevel (${nMin}) גדול מ-maxLevel (${nMax})`);
      }
    }

    // Per-type content field validation
    let textContent = '';

    if (contentType === 'titles') {
      textContent = item.text || item.טקסט || item.title || item.כותרת || '';
      if (!textContent) errors.push('חסר שדה text/טקסט/כותרת');
    } else if (contentType === 'phrases') {
      textContent = item.phrase || item.משפט || item.text || item.טקסט || '';
      if (!textContent) errors.push('חסר שדה phrase/משפט/טקסט');
    } else if (contentType === 'notifications') {
      textContent = item.text || item.טקסט || item.notificationText || '';
      if (!textContent) errors.push('חסר שדה text/טקסט');
      const trigger = item.triggerType || item.סוג_טריגר || '';
      if (trigger && !VALID_TRIGGER_TYPES.includes(trigger)) {
        warnings.push(`triggerType לא תקין: "${trigger}"`);
      }
    } else if (contentType === 'descriptions') {
      textContent = item.description || item.תיאור || item.text || item.טקסט || '';
      if (!textContent) errors.push('חסר שדה description/תיאור/טקסט');
    } else if (contentType === 'coachTips') {
      textContent = item.text || item.טקסט || item.cue || item.הערה || '';
      if (!textContent) errors.push('חסר שדה text/טקסט/cue/הערה');
      const variant = item.variant || item.וריאנט || '';
      if (!variant) {
        errors.push('חסר שדה variant/וריאנט (חובה: balanced, intense, naked, easy, all)');
      } else if (!VALID_VARIANTS.includes(variant)) {
        errors.push(`variant לא תקין: "${variant}" (ערכים: balanced, intense, naked, easy, all)`);
      }
    }

    // Tag validation on the text content
    if (textContent) {
      const tagWarnings = validateTags(textContent);
      warnings.push(...tagWarnings);
    }

    return { warnings, errors };
  };

  // ============================================================================
  // UPLOAD HANDLER (writeBatch)
  // ============================================================================

  const handleUpload = async () => {
    if (!csvInput.trim()) {
      alert('אנא הזן נתונים להעלאה');
      return;
    }

    setUploading(true);
    setResult(null);
    setShowDiagnostics(false);

    try {
      let items: any[] = [];
      let parseDiagnostics: RowDiagnostic[] = [];

      try {
        items = parseJSON(csvInput);
        console.log(`[BulkUpload] Parsed as JSON: ${items.length} items`);
      } catch {
        const csvResult = parseCSV(csvInput);
        items = csvResult.items;
        parseDiagnostics = csvResult.diagnostics;
      }

      if (items.length === 0) {
        const skipInfo = parseDiagnostics.filter(d => d.status === 'skipped');
        const hint = skipInfo.length > 0
          ? ` (${skipInfo.length} שורות נדחו בפירסור: ${skipInfo.map(d => `שורה ${d.row}: ${d.reason}`).join('; ')})`
          : '';
        throw new Error(`לא נמצאו פריטים להעלאה${hint}`);
      }

      const errors: string[] = [];
      const allDiagnostics: RowDiagnostic[] = [...parseDiagnostics];
      let successCount = 0;

      // Prepare all valid documents first, then write in batches
      const validDocs: { data: any; collectionPath: string; docId: string; rowNum: number; warningCount: number }[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const rowNum = i + 1;

        const validation = validateRow(item, rowNum);

        if (validation.warnings.length > 0) {
          errors.push(`שורה ${rowNum} (אזהרה): ${validation.warnings.join(', ')}`);
        }

        if (validation.errors.length > 0) {
          errors.push(`שורה ${rowNum}: ${validation.errors.join(', ')}`);
          allDiagnostics.push({ row: rowNum, status: 'error', reason: validation.errors.join('; '), parsedFields: item });
          continue;
        }

        let collectionPath = '';
        const data: any = {
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        // Shared enrichment fields
        const enrichSportType = item.sportType || item.סוג_ספורט || '';
        const enrichMotivation = item.motivationStyle || item.סגנון_מוטיבציה || '';
        const enrichExperience = item.experienceLevel || item.רמת_ניסיון || '';
        const enrichProgress = item.progressRange || item.טווח_התקדמות || '';
        const enrichDayPeriod = item.dayPeriod || item.תקופה_בשבוע || '';
        const enrichProgramId = item.programId || item.תוכנית || item.id_תוכנית || '';
        const enrichMinLevel = item.minLevel ?? item.רמה_מינימלית ?? item.min_level ?? '';
        const enrichMaxLevel = item.maxLevel ?? item.רמה_מקסימלית ?? item.max_level ?? '';
        const enrichBundleId = item.bundleId || item.באנדל || item.id_באנדל || '';

        const applySharedFields = () => {
          if (enrichSportType) data.sportType = enrichSportType;
          if (enrichMotivation) data.motivationStyle = enrichMotivation;
          if (enrichExperience) data.experienceLevel = enrichExperience;
          if (enrichProgress) data.progressRange = enrichProgress;
          if (enrichDayPeriod) data.dayPeriod = enrichDayPeriod;
          if (enrichProgramId) data.programId = enrichProgramId;
          if (enrichMinLevel !== '' && enrichMinLevel !== undefined) data.minLevel = parseInt(String(enrichMinLevel)) || undefined;
          if (enrichMaxLevel !== '' && enrichMaxLevel !== undefined) data.maxLevel = parseInt(String(enrichMaxLevel)) || undefined;
          if (enrichBundleId) data.bundleId = enrichBundleId;
        };

        if (contentType === 'titles') {
          collectionPath = `${WORKOUT_METADATA_COLLECTION}/workoutTitles/titles`;
          data.category = item.category || item.קטגוריה || 'general';
          data.location = item.location || item.מיקום || '';
          data.persona = item.persona || item.פרסונה || '';
          data.timeOfDay = item.timeOfDay || item.שעת_יום || 'any';
          data.gender = item.gender || item.מגדר || 'both';
          data.text = item.text || item.טקסט || item.title || item.כותרת || '';
          applySharedFields();
        } else if (contentType === 'phrases') {
          collectionPath = `${WORKOUT_METADATA_COLLECTION}/motivationalPhrases/phrases`;
          data.location = item.location || item.מיקום || 'home';
          data.persona = item.persona || item.פרסונה || '';
          data.timeOfDay = item.timeOfDay || item.שעת_יום || 'any';
          data.gender = item.gender || item.מגדר || 'both';
          data.phrase = item.phrase || item.משפט || item.text || item.טקסט || '';
          applySharedFields();
        } else if (contentType === 'notifications') {
          collectionPath = `${WORKOUT_METADATA_COLLECTION}/notifications/notifications`;
          data.triggerType = item.triggerType || item.סוג_טריגר || 'Inactivity';
          data.persona = item.persona || item.פרסונה || '';
          data.gender = item.gender || item.מגדר || 'both';
          data.psychologicalTrigger = item.psychologicalTrigger || item.טריגר_פסיכולוגי || 'FOMO';
          data.text = item.text || item.טקסט || item.notificationText || '';
          data.calendarIntegration = false;
          applySharedFields();
          if (data.triggerType === 'Inactivity') {
            data.daysInactive = parseInt(item.daysInactive || item.ימים_ללא_אימון || '1') || 1;
          }
          if (data.triggerType === 'Proximity') {
            data.distanceMeters = parseInt(item.distanceMeters || item.מרחק_במטרים || '500') || 500;
          }
        } else if (contentType === 'descriptions') {
          collectionPath = `${WORKOUT_METADATA_COLLECTION}/smartDescriptions/descriptions`;
          data.location = item.location || item.מיקום || 'home';
          data.persona = item.persona || item.פרסונה || '';
          data.gender = item.gender || item.מגדר || 'both';
          data.description = item.description || item.תיאור || item.text || item.טקסט || '';
          applySharedFields();
        } else if (contentType === 'coachTips') {
          collectionPath = `${WORKOUT_METADATA_COLLECTION}/logicCues/cues`;
          data.variant = item.variant || item.וריאנט || 'all';
          data.persona = item.persona || item.פרסונה || '';
          data.location = item.location || item.מיקום || '';
          data.timeOfDay = item.timeOfDay || item.שעת_יום || 'any';
          data.gender = item.gender || item.מגדר || 'both';
          data.text = item.text || item.טקסט || item.cue || item.הערה || '';
          applySharedFields();
        }

        // Deterministic ID: text + persona + bundleId + gender
        const textForId = data.text || data.phrase || data.description || data.cue || '';
        const docId = generateDocId(textForId, data.persona || '', data.bundleId || '', data.gender || '');
        validDocs.push({ data, collectionPath, docId, rowNum, warningCount: validation.warnings.length });
      }

      // Write in batches of BATCH_SIZE using deterministic IDs (upsert)
      for (let batchStart = 0; batchStart < validDocs.length; batchStart += BATCH_SIZE) {
        const batchSlice = validDocs.slice(batchStart, batchStart + BATCH_SIZE);
        const batch = writeBatch(db);

        for (const { data, collectionPath, docId } of batchSlice) {
          const docRef = doc(db, collectionPath, docId);
          batch.set(docRef, data, { merge: true });
        }

        try {
          await batch.commit();
          for (const { rowNum, data, warningCount } of batchSlice) {
            successCount++;
            allDiagnostics.push({
              row: rowNum,
              status: 'ok',
              reason: `נשמר בהצלחה${warningCount > 0 ? ` (${warningCount} אזהרות)` : ''}`,
              parsedFields: data,
            });
          }
          console.log(`[BulkUpload] Batch committed: ${batchSlice.length} docs (${batchStart + 1}–${batchStart + batchSlice.length})`);
        } catch (error: any) {
          for (const { rowNum, data } of batchSlice) {
            errors.push(`שורה ${rowNum}: ${error.message || 'Firestore batch write error'}`);
            allDiagnostics.push({ row: rowNum, status: 'error', reason: error.message || 'Batch write error', parsedFields: data });
          }
          console.error(`[BulkUpload] Batch FAILED (rows ${batchStart + 1}–${batchStart + batchSlice.length}):`, error);
        }
      }

      console.log(`[BulkUpload] Complete: ${successCount} success, ${errors.length} errors/warnings`);
      setResult({ success: successCount, errors: errors.length, errorsList: errors, diagnostics: allDiagnostics });
    } catch (error: any) {
      alert(`שגיאה בהעלאה: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  // ============================================================================
  // CLEAR COLLECTION
  // ============================================================================

  const handleClearCollection = async () => {
    const label = CONTENT_TYPE_BUTTONS.find(b => b.key === contentType)?.label || contentType;
    const confirmed = window.confirm(
      `האם אתה בטוח שברצונך למחוק את כל התוכן מסוג "${label}"?\n\nפעולה זו בלתי הפיכה!`
    );
    if (!confirmed) return;

    const doubleConfirm = window.confirm(
      `אישור סופי: כל המסמכים באוסף "${label}" יימחקו לצמיתות.\n\nלחץ OK להמשך.`
    );
    if (!doubleConfirm) return;

    setClearing(true);
    try {
      const colPath = COLLECTION_PATHS[contentType];
      const snap = await getDocs(collection(db, colPath));
      if (snap.empty) {
        alert('האוסף כבר ריק.');
        setClearing(false);
        return;
      }

      const batchOps: ReturnType<typeof writeBatch>[] = [];
      let current = writeBatch(db);
      let count = 0;

      for (const d of snap.docs) {
        current.delete(d.ref);
        count++;
        if (count % BATCH_SIZE === 0) {
          batchOps.push(current);
          current = writeBatch(db);
        }
      }
      batchOps.push(current);

      for (const b of batchOps) {
        await b.commit();
      }

      alert(`נמחקו ${snap.size} מסמכים מ-"${label}" בהצלחה.`);
      console.log(`[BulkUpload] Cleared ${snap.size} docs from ${colPath}`);
    } catch (error: any) {
      alert(`שגיאה במחיקה: ${error.message}`);
      console.error('[BulkUpload] Clear failed:', error);
    } finally {
      setClearing(false);
    }
  };

  // ============================================================================
  // CSV TEMPLATES
  // ============================================================================

  const getCSVTemplate = () => {
    if (contentType === 'titles') {
      return `category,location,persona,timeOfDay,gender,sportType,motivationStyle,experienceLevel,progressRange,dayPeriod,programId,minLevel,maxLevel,bundleId,text
strength,home,parent,morning,both,calisthenics,encouraging,beginner,0-20,start_of_week,,,,morning_parent,"אימון כוח בוקר ל@פרסונה"
general,park,,any,both,,,,90-100,all,push,5,10,levelup_push,"אימון בפארק — @זמן_יום טוב! @את/ה כמעט ב-@רמה_הבאה!"
mobility,library,student,any,both,flexibility,zen,beginner,,weekend,,,,,"הפסקת @קטגוריה של @זמן_אימון דקות — @עצימות"`;
    } else if (contentType === 'phrases') {
      return `location,persona,timeOfDay,gender,sportType,motivationStyle,experienceLevel,progressRange,dayPeriod,programId,minLevel,maxLevel,bundleId,phrase
home,parent,morning,both,,encouraging,beginner,0-20,start_of_week,,,,morning_parent,גם ביום עמוס, 5 דקות זה כל מה שצריך
park,student,any,male,running,tough,intermediate,90-100,,pull,3,8,levelup_push,@את/ה ב-@אחוז_התקדמות! עוד קצת ל-@רמה_הבאה`;
    } else if (contentType === 'notifications') {
      return `triggerType,persona,daysInactive,distanceMeters,gender,psychologicalTrigger,sportType,motivationStyle,experienceLevel,progressRange,dayPeriod,programId,minLevel,maxLevel,bundleId,text
Inactivity,parent,2,,both,FOMO,,,beginner,0-20,start_of_week,,,,,כבר @ימי_אי_פעילות ימים שלא ראינו אותך. @בוא/י נחזור לשגרה!
Proximity,student,,500,female,Challenge,running,tough,advanced,90-100,,push,5,15,,@את/ה במרחק @מרחק מהפארק. זמן ל-@שם_תוכנית!`;
    } else if (contentType === 'descriptions') {
      return `location,persona,gender,sportType,motivationStyle,experienceLevel,progressRange,dayPeriod,programId,minLevel,maxLevel,bundleId,description
home,parent,both,,encouraging,beginner,0-20,start_of_week,,,,morning_parent,אימון מושלם ל-@שם ב-@מיקום. מתמקד ב-@שריר
park,student,male,running,tough,advanced,90-100,,legs,5,12,,אימון @קטגוריה שמתאים ל-@מטרה שלך. @את/ה ב-@אחוז_התקדמות!`;
    } else {
      // coachTips
      return `variant,persona,location,timeOfDay,gender,sportType,motivationStyle,experienceLevel,progressRange,dayPeriod,programId,minLevel,maxLevel,bundleId,text
balanced,,,any,both,,,,,all,,,,,היום אנחנו עובדים על @סקייל_נוכחי. מיקוד: @מיקוד_פיזיולוגי. @סטטוס_נפח
intense,,,any,both,,,,,all,push,5,15,,רמה גבוהה — @מיקוד_פיזיולוגי. @סיבת_רצף. שים לב לפער: @פער_שבועי
easy,,,any,both,,,,,all,,,,,יום טכני — @סקייל_נוכחי ברמה מופחתת. @סיבת_רצף
all,parent,,morning,both,,encouraging,beginner,,start_of_week,,,,morning_parent,@סיבת_רצף. נפח שבועי: @סטטוס_נפח`;
    }
  };

  return (
    <div className="space-y-6 text-slate-900" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-3xl font-black text-gray-900 flex items-center gap-3">
            <Upload size={32} className="text-cyan-500" />
            העלאה מרוכזת
          </h1>
          <p className="text-gray-500 mt-2">העלה כותרות, משפטים, התראות, תיאורים והערות מאמן בקובץ CSV או JSON</p>
        </div>
        <Link
          href="/admin/workout-settings"
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors"
        >
          חזרה
        </Link>
      </div>

      {/* Content Type Selector */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <label className="block text-sm font-bold text-gray-700 mb-2">סוג תוכן</label>
        <div className="flex gap-2 flex-wrap">
          {CONTENT_TYPE_BUTTONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setContentType(key)}
              className={`px-4 py-2 rounded-xl font-bold transition-all ${
                contentType === key
                  ? key === 'coachTips' ? 'bg-emerald-500 text-white' : 'bg-cyan-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Input Area */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <FileText size={20} className="text-cyan-500" />
            הזן נתונים (CSV או JSON)
          </h2>
          <button
            onClick={() => setCsvInput(getCSVTemplate())}
            className="text-sm text-cyan-600 hover:text-cyan-700 font-bold"
          >
            טען תבנית
          </button>
        </div>
        
        <textarea
          value={csvInput}
          onChange={(e) => setCsvInput(e.target.value)}
          rows={15}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 font-mono text-sm bg-white text-slate-900"
          placeholder="הדבק כאן CSV או JSON..."
        />
        
        <div className="mt-4 flex items-center gap-4">
          <button
            onClick={handleUpload}
            disabled={uploading || !csvInput.trim()}
            className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? (
              <>
                <Loader size={18} className="animate-spin" />
                מעלה...
              </>
            ) : (
              <>
                <Upload size={18} />
                העלה נתונים
              </>
            )}
          </button>
          <span className="text-xs text-gray-400">כתיבה באצוות של {BATCH_SIZE} מסמכים · העלאה חוזרת דורסת כפילויות</span>
          <div className="flex-1" />
          <button
            onClick={handleClearCollection}
            disabled={clearing || uploading}
            className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl font-bold hover:bg-red-100 transition-colors border border-red-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {clearing ? (
              <>
                <Loader size={14} className="animate-spin" />
                מוחק...
              </>
            ) : (
              <>
                <Trash2 size={14} />
                נקה אוסף
              </>
            )}
          </button>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className={`bg-white rounded-2xl border p-6 shadow-sm ${
          result.errors === 0 ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'
        }`}>
          <div className="flex items-center gap-3 mb-4">
            {result.errors === 0 ? (
              <CheckCircle2 size={24} className="text-green-600" />
            ) : (
              <AlertTriangle size={24} className="text-yellow-600" />
            )}
            <h3 className="text-lg font-bold text-gray-900">
              {result.errors === 0 ? 'העלאה הושלמה בהצלחה!' : 'העלאה הושלמה עם שגיאות'}
            </h3>
          </div>
          
          <div className="space-y-2">
            <p className="text-sm text-gray-700">
              <span className="font-bold text-green-600">{result.success}</span> פריטים הועלו בהצלחה
            </p>
            {result.errors > 0 && (
              <>
                <p className="text-sm text-gray-700">
                  <span className="font-bold text-red-600">{result.errors}</span> שגיאות / אזהרות
                </p>
                <div className="mt-3 p-3 bg-white rounded-lg border border-gray-200 max-h-40 overflow-y-auto">
                  {result.errorsList.map((error, index) => (
                    <p key={index} className={`text-xs mb-1 ${error.includes('אזהרה') ? 'text-amber-600' : 'text-red-600'}`}>{error}</p>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Per-Row Diagnostics */}
          {result.diagnostics && result.diagnostics.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setShowDiagnostics(!showDiagnostics)}
                className="flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-800 transition-colors"
              >
                <Bug size={16} />
                {showDiagnostics ? 'הסתר' : 'הצג'} דוח אבחון ({result.diagnostics.length} שורות)
              </button>
              
              {showDiagnostics && (
                <div className="mt-3 border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-3 py-2 text-right font-bold text-gray-600 w-16">שורה</th>
                        <th className="px-3 py-2 text-right font-bold text-gray-600 w-20">סטטוס</th>
                        <th className="px-3 py-2 text-right font-bold text-gray-600">פירוט</th>
                        <th className="px-3 py-2 text-right font-bold text-gray-600">שדות שזוהו</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {result.diagnostics.map((d, idx) => (
                        <tr key={idx} className={
                          d.status === 'ok' ? 'bg-green-50/50' :
                          d.status === 'skipped' ? 'bg-yellow-50/50' :
                          'bg-red-50/50'
                        }>
                          <td className="px-3 py-2 font-mono font-bold">{d.row}</td>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              d.status === 'ok' ? 'bg-green-100 text-green-700' :
                              d.status === 'skipped' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {d.status === 'ok' ? 'הצלחה' : d.status === 'skipped' ? 'נדלג' : 'שגיאה'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-700">{d.reason}</td>
                          <td className="px-3 py-2 text-gray-500 font-mono max-w-[300px] truncate">
                            {d.parsedFields ? Object.entries(d.parsedFields)
                              .filter(([, v]) => v !== '' && v !== undefined)
                              .map(([k, v]) => `${k}=${typeof v === 'string' && v.length > 20 ? v.substring(0, 20) + '…' : v}`)
                              .join(' | ')
                            : d.rawLine ? (d.rawLine.length > 60 ? d.rawLine.substring(0, 60) + '…' : d.rawLine) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Instructions */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <h3 className="text-lg font-bold text-gray-900 mb-4">הוראות</h3>
        <div className="space-y-3 text-sm text-gray-700">
          <div>
            <p className="font-bold mb-1">פורמט CSV:</p>
            <p className="text-gray-600">שורה ראשונה: כותרות (location, persona, phrase, וכו')</p>
            <p className="text-gray-600">שורות נוספות: נתונים מופרדים בפסיקים</p>
          </div>
          <div>
            <p className="font-bold mb-1">פורמט JSON:</p>
            <p className="text-gray-600">מערך של אובייקטים: [{"{"}"location": "home", "persona": "parent", ...{"}"}]</p>
          </div>
          <div>
            <p className="font-bold mb-1">שדות נדרשים:</p>
            <ul className="list-disc list-inside text-gray-600 space-y-1">
              {contentType === 'titles' && (
                <>
                  <li>category / קטגוריה (strength, volume, endurance, skills, mobility, hiit, general)</li>
                  <li>text / טקסט / כותרת</li>
                  <li>location / מיקום (אופציונלי)</li>
                  <li>persona / פרסונה (אופציונלי)</li>
                  <li>timeOfDay / שעת_יום (אופציונלי)</li>
                  <li>gender / מגדר (male, female, both)</li>
                </>
              )}
              {contentType === 'phrases' && (
                <>
                  <li>location / מיקום</li>
                  <li>persona / פרסונה</li>
                  <li>phrase / משפט / טקסט</li>
                  <li>timeOfDay / שעת_יום (אופציונלי)</li>
                  <li>gender / מגדר (male, female, both)</li>
                </>
              )}
              {contentType === 'notifications' && (
                <>
                  <li>triggerType / סוג_טריגר</li>
                  <li>persona / פרסונה</li>
                  <li>text / טקסט / notificationText</li>
                  <li>gender / מגדר (male, female, both)</li>
                  <li>psychologicalTrigger / טריגר_פסיכולוגי (אופציונלי)</li>
                  <li>daysInactive / ימים_ללא_אימון (רק ל-Inactivity)</li>
                </>
              )}
              {contentType === 'descriptions' && (
                <>
                  <li>location / מיקום</li>
                  <li>persona / פרסונה</li>
                  <li>description / תיאור / טקסט</li>
                  <li>gender / מגדר (male, female, both)</li>
                </>
              )}
              {contentType === 'coachTips' && (
                <>
                  <li className="text-emerald-700 font-bold">variant / וריאנט (חובה: balanced, intense, naked, easy, all)</li>
                  <li>text / טקסט / cue / הערה</li>
                  <li>persona / פרסונה (אופציונלי)</li>
                  <li>location / מיקום (אופציונלי)</li>
                  <li>timeOfDay / שעת_יום (אופציונלי)</li>
                  <li>gender / מגדר (male, female, both)</li>
                </>
              )}

              <li className="font-bold mt-2">שדות משותפים (אופציונלי, כל הסוגים):</li>
              <li className="text-indigo-700 font-bold">bundleId / באנדל / id_באנדל — מזהה באנדל לסנכרון תוכן (כותרת + תיאור + משפט + הערה באותו סיפור). הכותרת היא ה-Anchor — התיאורים והמשפטים שחולקים את אותו bundleId מקבלים +50 בניקוד</li>
              <li>sportType / סוג_ספורט (basketball, soccer, tennis, padel, running, walking, cycling, swimming, calisthenics, crossfit, functional, movement, yoga, pilates, flexibility, climbing, skate_roller, martial_arts)</li>
              <li>motivationStyle / סגנון_מוטיבציה (tough, encouraging, scientific, funny, military, zen)</li>
              <li>experienceLevel / רמת_ניסיון (beginner, intermediate, advanced, pro)</li>
              <li>progressRange / טווח_התקדמות (0-20, 20-90, 90-100) - מפעיל בונוס Level-Up ב-90-100</li>
              <li className="font-bold mt-2">שדה קרבה (רק להתראות Proximity):</li>
              <li>distanceMeters / מרחק_במטרים (למשל: 500 = 500 מטר)</li>
              <li className="font-bold mt-2">מיקומים תקפים:</li>
              <li>home, park, office, street, gym, school, airport, library, any (תוכן שלא תלוי במיקום)</li>
              <li className="font-bold mt-2">תקופה בשבוע (dayPeriod / תקופה_בשבוע):</li>
              <li>start_of_week (א-ב), mid_week (ג-ה), weekend (ו-ש), all (כל הימים)</li>
              <li className="font-bold mt-2">סינון לפי תוכנית ורמה (אופציונלי):</li>
              <li>programId / תוכנית / id_תוכנית — מזהה תוכנית (push, pull, upper_body, all, או ריק לכללי)</li>
              <li>minLevel / רמה_מינימלית — רמה מינימלית בתוכנית (מספר)</li>
              <li>maxLevel / רמה_מקסימלית — רמה מקסימלית בתוכנית (מספר)</li>
              <li className="text-amber-600">תוכן לתוכנית ראשית (Master) יוצג גם למשתמשים בתת-תוכניות שלה</li>
            </ul>
          </div>

          {/* Dynamic Tags Reference */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="font-bold mb-2 text-gray-900">תגיות דינמיות (@ Tags):</p>
            <p className="text-xs text-gray-500 mb-3">ניתן לשלב את התגיות הבאות בטקסט — המערכת תחליף אותן בערכים דינמיים לפי המשתמש. תגיות לא מוכרות יזוהו כאזהרה בעת ההעלאה.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-xs">
              <div>
                <p className="font-bold text-gray-800 mb-1">זיהוי ומשתמש:</p>
                <ul className="space-y-0.5 text-gray-600 mb-2">
                  <li><code className="bg-gray-100 px-1 rounded">@שם</code> שם המשתמש</li>
                  <li><code className="bg-gray-100 px-1 rounded">@פרסונה</code> פרסונת המשתמש</li>
                  <li><code className="bg-gray-100 px-1 rounded">@מיקום</code> מיקום האימון</li>
                  <li><code className="bg-gray-100 px-1 rounded">@מטרה</code> מטרת המשתמש</li>
                  <li><code className="bg-gray-100 px-1 rounded">@ספורט</code> סוג הספורט</li>
                  <li><code className="bg-gray-100 px-1 rounded">@רמה</code> רמת ניסיון</li>
                  <li><code className="bg-gray-100 px-1 rounded">@מגדר</code> מגדר</li>
                </ul>
                <p className="font-bold text-gray-800 mb-1">אימון וניתוח:</p>
                <ul className="space-y-0.5 text-gray-600 mb-2">
                  <li><code className="bg-gray-100 px-1 rounded">@זמן_אימון</code> משך בדקות</li>
                  <li><code className="bg-gray-100 px-1 rounded">@עצימות</code> קליל / מאתגר / שורף</li>
                  <li><code className="bg-gray-100 px-1 rounded">@מיקוד</code> שריר דומיננטי</li>
                  <li><code className="bg-gray-100 px-1 rounded">@קטגוריה</code> קטגוריית אימון</li>
                  <li><code className="bg-gray-100 px-1 rounded">@שריר</code> שריר עיקרי</li>
                  <li><code className="bg-gray-100 px-1 rounded">@ציוד</code> ציוד נדרש</li>
                  <li><code className="bg-gray-100 px-1 rounded">@שם_תרגיל</code> שם התרגיל</li>
                </ul>
                <p className="font-bold text-gray-800 mb-1">התקדמות ורמות:</p>
                <ul className="space-y-0.5 text-gray-600 mb-2">
                  <li><code className="bg-gray-100 px-1 rounded">@שם_תוכנית</code> שם תוכנית</li>
                  <li><code className="bg-gray-100 px-1 rounded">@אחוז_התקדמות</code> אחוז התקדמות</li>
                  <li><code className="bg-gray-100 px-1 rounded">@רמה_הבאה</code> רמה הבאה</li>
                  <li><code className="bg-gray-100 px-1 rounded">@תרגיל_יעד</code> תרגיל יעד</li>
                  <li><code className="bg-gray-100 px-1 rounded">@ערך_יעד</code> ערך יעד</li>
                  <li><code className="bg-gray-100 px-1 rounded">@אחוז_התקדמות_רמה</code> התקדמות רמה</li>
                </ul>
              </div>
              <div>
                <p className="font-bold text-gray-800 mb-1">מגדר (פניות):</p>
                <ul className="space-y-0.5 text-gray-600 mb-2">
                  <li><code className="bg-gray-100 px-1 rounded">@את/ה</code> את / אתה</li>
                  <li><code className="bg-gray-100 px-1 rounded">@מוכן/ה</code> מוכנה / מוכן</li>
                  <li><code className="bg-gray-100 px-1 rounded">@בוא/י</code> בואי / בוא</li>
                  <li><code className="bg-gray-100 px-1 rounded">@תוכל/י</code> תוכלי / תוכל</li>
                  <li><code className="bg-gray-100 px-1 rounded">@תרצה/י</code> תרצי / תרצה</li>
                  <li><code className="bg-gray-100 px-1 rounded">@עשית/ה</code> עשית</li>
                </ul>
                <p className="font-bold text-gray-800 mb-1">זמן ומיקום:</p>
                <ul className="space-y-0.5 text-gray-600 mb-2">
                  <li><code className="bg-gray-100 px-1 rounded">@שעה</code> שעה נוכחית</li>
                  <li><code className="bg-gray-100 px-1 rounded">@זמן_יום</code> בוקר / צהריים / ערב</li>
                  <li><code className="bg-gray-100 px-1 rounded">@מרחק</code> מרחק לפארק</li>
                  <li><code className="bg-gray-100 px-1 rounded">@זמן_הגעה</code> זמן הגעה</li>
                  <li><code className="bg-gray-100 px-1 rounded">@ימי_אי_פעילות</code> ימים ללא אימון</li>
                </ul>
                <p className="font-bold text-emerald-700 mb-1">הערות מאמן (חדש):</p>
                <ul className="space-y-0.5 text-gray-600 mb-2">
                  <li><code className="bg-emerald-50 px-1 rounded text-emerald-800">@פער_שבועי</code> דומיין עם אחוז ההשלמה הנמוך ביותר</li>
                  <li><code className="bg-emerald-50 px-1 rounded text-emerald-800">@סיבת_רצף</code> חזרה הדרגתית / בונוס עקביות</li>
                  <li><code className="bg-emerald-50 px-1 rounded text-emerald-800">@סקייל_נוכחי</code> שלב ההתקדמות הנוכחי</li>
                  <li><code className="bg-emerald-50 px-1 rounded text-emerald-800">@מיקוד_פיזיולוגי</code> כוח / היפרטרופיה / סיבולת</li>
                  <li><code className="bg-emerald-50 px-1 rounded text-emerald-800">@סטטוס_נפח</code> סטטוס נפח שבועי מול מכסה</li>
                </ul>
                <p className="font-bold text-gray-800 mb-1">ריצה:</p>
                <ul className="space-y-0.5 text-gray-600 mb-2">
                  <li><code className="bg-gray-100 px-1 rounded">@קצב_בסיס</code> קצב בסיס (דק&apos;/ק&quot;מ, למשל 5:30)</li>
                  <li><code className="bg-gray-100 px-1 rounded">@מרחק_יעד</code> מרחק מטרה (2/3/5/10 ק&quot;מ)</li>
                  <li><code className="bg-gray-100 px-1 rounded">@שלב_תוכנית</code> שלב בתוכנית (בניית בסיס / בנייה / שיא / הורדת עומסים)</li>
                  <li><code className="bg-gray-100 px-1 rounded">@סוג_ריצה</code> קטגוריית ריצה (אינטרוולים / טמפו / ריצה ארוכה / התאוששות)</li>
                  <li><code className="bg-gray-100 px-1 rounded">@שבוע</code> מספר השבוע הנוכחי בתוכנית (למשל 4)</li>
                  <li><code className="bg-gray-100 px-1 rounded">@שבוע_מתוך</code> שבוע מתוך סה&quot;כ (למשל &quot;שבוע 4 מתוך 12&quot;)</li>
                </ul>
                <p className="font-bold text-gray-800 mb-1">Logic Cue:</p>
                <ul className="space-y-0.5 text-gray-600">
                  <li><code className="bg-gray-100 px-1 rounded">@סיבת_עצימות</code> סיבת עצימות</li>
                  <li><code className="bg-gray-100 px-1 rounded">@סוג_אתגר</code> סוג אתגר</li>
                  <li><code className="bg-gray-100 px-1 rounded">@התאמת_ציוד</code> התאמת ציוד</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
