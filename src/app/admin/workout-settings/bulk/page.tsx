'use client';

export const dynamic = 'force-dynamic';

import React, { useState } from 'react';
import { collection, addDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Upload, FileText, CheckCircle2, AlertTriangle, Loader } from 'lucide-react';
import Link from 'next/link';

const WORKOUT_METADATA_COLLECTION = 'workoutMetadata';

interface BulkUploadResult {
  success: number;
  errors: number;
  errorsList: string[];
}

export default function BulkUploadPage() {
  const [csvInput, setCsvInput] = useState<string>('');
  const [contentType, setContentType] = useState<'phrases' | 'notifications' | 'descriptions'>('phrases');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<BulkUploadResult | null>(null);

  const parseCSV = (text: string): any[] => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(',').map(h => h.trim());
    const rows: any[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      if (values.length !== headers.length) continue;
      
      const row: any = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      rows.push(row);
    }
    
    return rows;
  };

  const parseJSON = (text: string): any[] => {
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (error) {
      throw new Error('Invalid JSON format');
    }
  };

  const handleUpload = async () => {
    if (!csvInput.trim()) {
      alert('אנא הזן נתונים להעלאה');
      return;
    }

    setUploading(true);
    setResult(null);

    try {
      let items: any[] = [];
      
      // Try to parse as JSON first, then CSV
      try {
        items = parseJSON(csvInput);
      } catch {
        items = parseCSV(csvInput);
      }

      if (items.length === 0) {
        throw new Error('לא נמצאו פריטים להעלאה');
      }

      const batch = writeBatch(db);
      const errors: string[] = [];
      let successCount = 0;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        try {
          let collectionPath = '';
          const data: any = {
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };

          if (contentType === 'phrases') {
            collectionPath = `${WORKOUT_METADATA_COLLECTION}/motivationalPhrases/phrases`;
            data.location = item.location || item.מיקום || 'home';
            data.persona = item.persona || item.פרסונה || '';
            data.timeOfDay = item.timeOfDay || item.שעת_יום || 'any';
            data.gender = item.gender || item.מגדר || 'both';
            data.phrase = item.phrase || item.משפט || item.text || item.טקסט || '';
            
            if (!data.phrase) {
              errors.push(`שורה ${i + 1}: חסר משפט`);
              continue;
            }
          } else if (contentType === 'notifications') {
            collectionPath = `${WORKOUT_METADATA_COLLECTION}/notifications/notifications`;
            data.triggerType = item.triggerType || item.סוג_טריגר || 'Inactivity';
            data.persona = item.persona || item.פרסונה || '';
            data.gender = item.gender || item.מגדר || 'both';
            data.psychologicalTrigger = item.psychologicalTrigger || item.טריגר_פסיכולוגי || 'FOMO';
            data.text = item.text || item.טקסט || item.notificationText || '';
            
            if (data.triggerType === 'Inactivity') {
              data.daysInactive = parseInt(item.daysInactive || item.ימים_ללא_אימון || '1');
            }
            
            if (!data.text) {
              errors.push(`שורה ${i + 1}: חסר טקסט התראה`);
              continue;
            }
          } else if (contentType === 'descriptions') {
            collectionPath = `${WORKOUT_METADATA_COLLECTION}/smartDescriptions/descriptions`;
            data.location = item.location || item.מיקום || 'home';
            data.persona = item.persona || item.פרסונה || '';
            data.gender = item.gender || item.מגדר || 'both';
            data.description = item.description || item.תיאור || item.text || item.טקסט || '';
            
            if (!data.description) {
              errors.push(`שורה ${i + 1}: חסר תיאור`);
              continue;
            }
          }

          const docRef = collection(db, collectionPath);
          await addDoc(docRef, data);
          successCount++;
        } catch (error: any) {
          errors.push(`שורה ${i + 1}: ${error.message || 'שגיאה לא ידועה'}`);
        }
      }

      setResult({
        success: successCount,
        errors: errors.length,
        errorsList: errors,
      });
    } catch (error: any) {
      alert(`שגיאה בהעלאה: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const getCSVTemplate = () => {
    if (contentType === 'phrases') {
      return `location,persona,timeOfDay,gender,phrase
home,parent,morning,both,גם ביום עמוס, 5 דקות זה כל מה שצריך
park,student,any,male,אימון בפארק זה דרך מעולה להתחיל את היום`;
    } else if (contentType === 'notifications') {
      return `triggerType,persona,daysInactive,gender,psychologicalTrigger,text
Inactivity,parent,2,both,FOMO,כבר @ימי_אי_פעילות ימים שלא ראינו אותך. @בוא/י נחזור לשגרה!
Scheduled,student,,female,Challenge,השעה @שעה, זמן מושלם ל-@מטרה. @את/ה @מוכן/ה?`;
    } else {
      return `location,persona,gender,description
home,parent,both,אימון מושלם ל-@שם ב-@מיקום. מתמקד ב-@שריר
park,student,male,אימון @קטגוריה שמתאים ל-@מטרה שלך. @בוא/י נתחיל!`;
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
          <p className="text-gray-500 mt-2">העלה משפטים, התראות ותיאורים בקובץ CSV או JSON</p>
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
        <div className="flex gap-2">
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
                  <span className="font-bold text-red-600">{result.errors}</span> שגיאות
                </p>
                <div className="mt-3 p-3 bg-white rounded-lg border border-gray-200 max-h-40 overflow-y-auto">
                  {result.errorsList.map((error, index) => (
                    <p key={index} className="text-xs text-red-600 mb-1">{error}</p>
                  ))}
                </div>
              </>
            )}
          </div>
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
              {contentType === 'phrases' && (
                <>
                  <li>location / מיקום</li>
                  <li>persona / פרסונה</li>
                  <li>phrase / משפט / טקסט</li>
                  <li>timeOfDay / שעת_יום (אופציונלי)</li>
                  <li>gender / מגדר (male, female, both - ברירת מחדל: both)</li>
                </>
              )}
              {contentType === 'notifications' && (
                <>
                  <li>triggerType / סוג_טריגר</li>
                  <li>persona / פרסונה</li>
                  <li>text / טקסט / notificationText</li>
                  <li>gender / מגדר (male, female, both - ברירת מחדל: both)</li>
                  <li>psychologicalTrigger / טריגר_פסיכולוגי (אופציונלי)</li>
                  <li>daysInactive / ימים_ללא_אימון (רק ל-Inactivity)</li>
                </>
              )}
              {contentType === 'descriptions' && (
                <>
                  <li>location / מיקום</li>
                  <li>persona / פרסונה</li>
                  <li>description / תיאור / טקסט</li>
                  <li>gender / מגדר (male, female, both - ברירת מחדל: both)</li>
                </>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
