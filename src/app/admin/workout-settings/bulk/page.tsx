'use client';

export const dynamic = 'force-dynamic';

import React, { useState } from 'react';
import { collection, addDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Upload, FileText, CheckCircle2, AlertTriangle, Loader, Bug } from 'lucide-react';
import Link from 'next/link';

const WORKOUT_METADATA_COLLECTION = 'workoutMetadata';

interface BulkUploadResult {
  success: number;
  errors: number;
  errorsList: string[];
  /** Detailed per-row diagnostics visible in UI */
  diagnostics: RowDiagnostic[];
}

interface RowDiagnostic {
  row: number;
  status: 'ok' | 'skipped' | 'error';
  reason: string;
  rawLine?: string;
  parsedFields?: Record<string, string>;
}

// Valid values for validation
const VALID_DAY_PERIODS = ['start_of_week', 'mid_week', 'weekend', 'all', ''];
const VALID_GENDERS = ['male', 'female', 'both', ''];
const VALID_TRIGGER_TYPES = ['Inactivity', 'Scheduled', 'Location_Based', 'Habit_Maintenance', 'Proximity'];
const VALID_LOCATIONS = ['home', 'park', 'street', 'office', 'school', 'gym', 'airport', 'library', ''];

export default function BulkUploadPage() {
  const [csvInput, setCsvInput] = useState<string>('');
  const [contentType, setContentType] = useState<'titles' | 'phrases' | 'notifications' | 'descriptions'>('titles');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<BulkUploadResult | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // ============================================================================
  // CSV PARSER — handles quoted fields, commas in text, last-column merging
  // ============================================================================

  /**
   * Parse a single CSV line respecting quoted fields.
   * Handles: "field with, comma", regular fields, and as a fallback
   * merges excess columns into the last field (for unquoted text with commas).
   */
  const parseCSVLine = (line: string, expectedColumns: number): string[] => {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      
      if (ch === '"') {
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          // Escaped quote ""
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

    // KEY FIX: If we got more fields than expected, merge the extras into the last field.
    // This handles the common case where the text/description column contains commas
    // and the user didn't quote the field.
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
      
      // Skip truly empty lines
      if (!rawLine.trim()) {
        diagnostics.push({ row: i + 1, status: 'skipped', reason: 'שורה ריקה', rawLine });
        continue;
      }

      const values = parseCSVLine(rawLine, expectedColumns);

      // If we got FEWER columns than expected, that's a real problem
      if (values.length < expectedColumns) {
        diagnostics.push({
          row: i + 1,
          status: 'skipped',
          reason: `מספר עמודות שגוי: נמצאו ${values.length}, צפוי ${expectedColumns}. ייתכן שחסרים שדות.`,
          rawLine,
        });
        console.warn(`[BulkUpload] Row ${i + 1} SKIPPED: got ${values.length} cols, expected ${expectedColumns}. Raw: "${rawLine}"`);
        continue;
      }

      const row: any = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });

      diagnostics.push({
        row: i + 1,
        status: 'ok',
        reason: 'פורס בהצלחה',
        rawLine,
        parsedFields: { ...row },
      });
      rows.push(row);
    }

    console.log(`[BulkUpload] Parsed ${rows.length} rows from ${lines.length - 1} data lines. Skipped: ${diagnostics.filter(d => d.status === 'skipped').length}`);
    return { items: rows, diagnostics };
  };

  const parseJSON = (text: string): any[] => {
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (error) {
      throw new Error('Invalid JSON format');
    }
  };

  // ============================================================================
  // FIELD VALIDATION HELPERS
  // ============================================================================

  /** Validate a row and return warnings (non-blocking) and errors (blocking) */
  const validateRow = (item: any, rowNum: number): { warnings: string[]; errors: string[] } => {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Validate dayPeriod if present
    const dp = item.dayPeriod || item.תקופה_בשבוע || '';
    if (dp && !VALID_DAY_PERIODS.includes(dp)) {
      warnings.push(`dayPeriod לא תקין: "${dp}" (ערכים תקפים: start_of_week, mid_week, weekend, all)`);
    }

    // Validate gender if present
    const gender = item.gender || item.מגדר || '';
    if (gender && !VALID_GENDERS.includes(gender)) {
      warnings.push(`gender לא תקין: "${gender}" (ערכים תקפים: male, female, both)`);
    }

    // Validate location if present
    const location = item.location || item.מיקום || '';
    if (location && !VALID_LOCATIONS.includes(location)) {
      warnings.push(`location לא תקין: "${location}"`);
    }

    // Validate minLevel / maxLevel
    const rawMin = item.minLevel ?? item.רמה_מינימלית ?? item.min_level ?? '';
    const rawMax = item.maxLevel ?? item.רמה_מקסימלית ?? item.max_level ?? '';
    if (rawMin !== '' && rawMax !== '') {
      const nMin = parseInt(String(rawMin));
      const nMax = parseInt(String(rawMax));
      if (!isNaN(nMin) && !isNaN(nMax) && nMin > nMax) {
        warnings.push(`minLevel (${nMin}) גדול מ-maxLevel (${nMax})`);
      }
    }

    // Content-type-specific validation
    if (contentType === 'titles') {
      const text = item.text || item.טקסט || item.title || item.כותרת || '';
      if (!text) errors.push('חסר שדה text/טקסט/כותרת');
    } else if (contentType === 'phrases') {
      const phrase = item.phrase || item.משפט || item.text || item.טקסט || '';
      if (!phrase) errors.push('חסר שדה phrase/משפט/טקסט');
    } else if (contentType === 'notifications') {
      const text = item.text || item.טקסט || item.notificationText || '';
      if (!text) errors.push('חסר שדה text/טקסט');
      const trigger = item.triggerType || item.סוג_טריגר || '';
      if (trigger && !VALID_TRIGGER_TYPES.includes(trigger)) {
        warnings.push(`triggerType לא תקין: "${trigger}"`);
      }
    } else if (contentType === 'descriptions') {
      const desc = item.description || item.תיאור || item.text || item.טקסט || '';
      if (!desc) errors.push('חסר שדה description/תיאור/טקסט');
    }

    return { warnings, errors };
  };

  // ============================================================================
  // UPLOAD HANDLER
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
      
      // Try to parse as JSON first, then CSV
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

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const rowNum = i + 1;

        try {
          // Pre-validate
          const validation = validateRow(item, rowNum);
          
          // Log warnings to console
          if (validation.warnings.length > 0) {
            console.warn(`[BulkUpload] Row ${rowNum} warnings:`, validation.warnings);
          }

          // Block on errors
          if (validation.errors.length > 0) {
            const errMsg = `שורה ${rowNum}: ${validation.errors.join(', ')}`;
            errors.push(errMsg);
            allDiagnostics.push({
              row: rowNum,
              status: 'error',
              reason: validation.errors.join('; '),
              parsedFields: item,
            });
            console.error(`[BulkUpload] Row ${rowNum} REJECTED:`, validation.errors, item);
            continue;
          }
          
          let collectionPath = '';
          const data: any = {
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };

          // Golden Content enrichment fields (shared across ALL content types)
          const enrichSportType = item.sportType || item.סוג_ספורט || '';
          const enrichMotivation = item.motivationStyle || item.סגנון_מוטיבציה || '';
          const enrichExperience = item.experienceLevel || item.רמת_ניסיון || '';
          const enrichProgress = item.progressRange || item.טווח_התקדמות || '';
          const enrichDayPeriod = item.dayPeriod || item.תקופה_בשבוע || '';
          const enrichProgramId = item.programId || item.תוכנית || item.id_תוכנית || '';
          const enrichMinLevel = item.minLevel ?? item.רמה_מינימלית ?? item.min_level ?? '';
          const enrichMaxLevel = item.maxLevel ?? item.רמה_מקסימלית ?? item.max_level ?? '';

          // Shared enrichment — applied identically to ALL content types
          const applySharedFields = () => {
            if (enrichSportType) data.sportType = enrichSportType;
            if (enrichMotivation) data.motivationStyle = enrichMotivation;
            if (enrichExperience) data.experienceLevel = enrichExperience;
            if (enrichProgress) data.progressRange = enrichProgress;
            if (enrichDayPeriod) data.dayPeriod = enrichDayPeriod;
            if (enrichProgramId) data.programId = enrichProgramId;
            if (enrichMinLevel !== '' && enrichMinLevel !== undefined) data.minLevel = parseInt(String(enrichMinLevel)) || undefined;
            if (enrichMaxLevel !== '' && enrichMaxLevel !== undefined) data.maxLevel = parseInt(String(enrichMaxLevel)) || undefined;
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
            
            // Notification-specific fields
            if (data.triggerType === 'Inactivity') {
              const rawDays = item.daysInactive || item.ימים_ללא_אימון || '1';
              data.daysInactive = parseInt(rawDays) || 1;
            }
            if (data.triggerType === 'Proximity') {
              const rawDist = item.distanceMeters || item.מרחק_במטרים || '500';
              data.distanceMeters = parseInt(rawDist) || 500;
            }
          } else if (contentType === 'descriptions') {
            collectionPath = `${WORKOUT_METADATA_COLLECTION}/smartDescriptions/descriptions`;
            data.location = item.location || item.מיקום || 'home';
            data.persona = item.persona || item.פרסונה || '';
            data.gender = item.gender || item.מגדר || 'both';
            data.description = item.description || item.תיאור || item.text || item.טקסט || '';
            applySharedFields();
          }

          // Add warnings to error list (non-blocking but visible)
          if (validation.warnings.length > 0) {
            errors.push(`שורה ${rowNum} (אזהרה): ${validation.warnings.join(', ')}`);
          }

          const docRef = collection(db, collectionPath);
          await addDoc(docRef, data);
          successCount++;
          
          allDiagnostics.push({
            row: rowNum,
            status: 'ok',
            reason: `נשמר בהצלחה${validation.warnings.length > 0 ? ` (${validation.warnings.length} אזהרות)` : ''}`,
            parsedFields: data,
          });
        } catch (error: any) {
          const errMsg = `שורה ${rowNum}: ${error.message || 'שגיאה בשמירה ל-Firestore'}`;
          errors.push(errMsg);
          allDiagnostics.push({
            row: rowNum,
            status: 'error',
            reason: error.message || 'Firestore write error',
            parsedFields: item,
          });
          console.error(`[BulkUpload] Row ${rowNum} FAILED:`, error, item);
        }
      }

      console.log(`[BulkUpload] Complete: ${successCount} success, ${errors.length} errors/warnings`);

      setResult({
        success: successCount,
        errors: errors.length,
        errorsList: errors,
        diagnostics: allDiagnostics,
      });
    } catch (error: any) {
      alert(`שגיאה בהעלאה: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const getCSVTemplate = () => {
    if (contentType === 'titles') {
      return `category,location,persona,timeOfDay,gender,sportType,motivationStyle,experienceLevel,progressRange,dayPeriod,programId,minLevel,maxLevel,text
strength,home,parent,morning,both,calisthenics,encouraging,beginner,0-20,start_of_week,,,,"אימון כוח בוקר ל@פרסונה"
general,park,,any,both,,,,90-100,all,push,5,10,"אימון בפארק — @זמן_יום טוב! @את/ה כמעט ב-@רמה_הבאה!"
mobility,library,student,any,both,flexibility,zen,beginner,,weekend,,,,"הפסקת @קטגוריה של @זמן_אימון דקות — @עצימות"
skills,home,student,evening,female,,tough,advanced,,,upper_body,8,15,"אימון סקילס ערב — @בוא/י נתחיל"`;
    } else if (contentType === 'phrases') {
      return `location,persona,timeOfDay,gender,sportType,motivationStyle,experienceLevel,progressRange,dayPeriod,programId,minLevel,maxLevel,phrase
home,parent,morning,both,,encouraging,beginner,0-20,start_of_week,,,,גם ביום עמוס, 5 דקות זה כל מה שצריך
library,student,any,both,,zen,beginner,,weekend,,,,הפסקת תנועה ב@מיקום — @זמן_אימון דקות ומיקוד ב@מיקוד
park,student,any,male,running,tough,intermediate,90-100,,pull,3,8,@את/ה ב-@אחוז_התקדמות! עוד קצת ל-@רמה_הבאה`;
    } else if (contentType === 'notifications') {
      return `triggerType,persona,daysInactive,distanceMeters,gender,psychologicalTrigger,sportType,motivationStyle,experienceLevel,progressRange,dayPeriod,programId,minLevel,maxLevel,text
Inactivity,parent,2,,both,FOMO,,,beginner,0-20,start_of_week,,,,כבר @ימי_אי_פעילות ימים שלא ראינו אותך. @בוא/י נחזור לשגרה!
Proximity,student,,500,female,Challenge,running,tough,advanced,90-100,,push,5,15,@את/ה במרחק @מרחק מהפארק. זמן ל-@שם_תוכנית! (@אחוז_התקדמות)`;
    } else {
      return `location,persona,gender,sportType,motivationStyle,experienceLevel,progressRange,dayPeriod,programId,minLevel,maxLevel,description
home,parent,both,,encouraging,beginner,0-20,start_of_week,,,,אימון מושלם ל-@שם ב-@מיקום. מתמקד ב-@שריר
library,student,both,flexibility,zen,beginner,,weekend,,,,אימון @קטגוריה @עצימות — מיקוד ב@מיקוד, @זמן_אימון דקות
park,student,male,running,tough,advanced,90-100,,legs,5,12,אימון @קטגוריה שמתאים ל-@מטרה שלך. @את/ה ב-@אחוז_התקדמות!`;
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
          <p className="text-gray-500 mt-2">העלה כותרות, משפטים, התראות ותיאורים בקובץ CSV או JSON</p>
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
          <button
            onClick={() => setContentType('titles')}
            className={`px-4 py-2 rounded-xl font-bold transition-all ${
              contentType === 'titles'
                ? 'bg-cyan-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            כותרות אימון
          </button>
          <button
            onClick={() => setContentType('phrases')}
            className={`px-4 py-2 rounded-xl font-bold transition-all ${
              contentType === 'phrases'
                ? 'bg-cyan-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            משפטים מוטיבציוניים
          </button>
          <button
            onClick={() => setContentType('notifications')}
            className={`px-4 py-2 rounded-xl font-bold transition-all ${
              contentType === 'notifications'
                ? 'bg-cyan-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            התראות
          </button>
          <button
            onClick={() => setContentType('descriptions')}
            className={`px-4 py-2 rounded-xl font-bold transition-all ${
              contentType === 'descriptions'
                ? 'bg-cyan-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            תיאורים חכמים
          </button>
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

          {/* Per-Row Diagnostics (collapsible) */}
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
              <li className="font-bold mt-2">שדות Golden Content (אופציונלי, כל הסוגים):</li>
              <li>sportType / סוג_ספורט (basketball, soccer, tennis, padel, running, walking, cycling, swimming, calisthenics, crossfit, functional, movement, yoga, pilates, flexibility, climbing, skate_roller, martial_arts)</li>
              <li>motivationStyle / סגנון_מוטיבציה (tough, encouraging, scientific, funny, military, zen)</li>
              <li>experienceLevel / רמת_ניסיון (beginner, intermediate, advanced, pro)</li>
              <li>progressRange / טווח_התקדמות (0-20, 20-90, 90-100) - מפעיל בונוס Level-Up ב-90-100</li>
              <li className="font-bold mt-2">שדה קרבה (רק להתראות Proximity):</li>
              <li>distanceMeters / מרחק_במטרים (למשל: 500 = 500 מטר)</li>
              <li className="font-bold mt-2">מיקומים תקפים:</li>
              <li>home, park, office, street, gym, school, airport, library</li>
              <li className="font-bold mt-2">תקופה בשבוע (dayPeriod / תקופה_בשבוע):</li>
              <li>start_of_week (א-ב), mid_week (ג-ה), weekend (ו-ש), all (כל הימים)</li>
              <li className="font-bold mt-2">סינון לפי תוכנית ורמה (אופציונלי):</li>
              <li>programId / תוכנית / id_תוכנית — מזהה תוכנית (push, pull, upper_body, all, או ריק לכללי). סינון קשיח — לא מתאים = ניקוד 0</li>
              <li>minLevel / רמה_מינימלית / min_level — רמה מינימלית בתוכנית (מספר)</li>
              <li>maxLevel / רמה_מקסימלית / max_level — רמה מקסימלית בתוכנית (מספר)</li>
              <li className="text-amber-600">תוכן לתוכנית ראשית (Master) יוצג גם למשתמשים בתת-תוכניות שלה</li>
              <li className="font-bold mt-2">תגיות דינמיות חדשות:</li>
              <li>@זמן_אימון (משך בדקות), @עצימות (קליל/מאתגר/שורף), @מיקוד (שריר דומיננטי), @קטגוריה (שם קטגוריה)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
