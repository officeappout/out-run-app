'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import {
  seedMilitaryDemo,
  seedSchoolDemo,
  seedMilitaryAndSchoolDemo,
} from '@/features/admin/services/seed-military-school-demo';
import { CheckCircle2, AlertCircle, Loader2, Play, Shield, GraduationCap } from 'lucide-react';

type Phase = 'idle' | 'running' | 'done' | 'error';

export default function SeedMilitarySchoolPage() {
  const [milPhase, setMilPhase]   = useState<Phase>('idle');
  const [schPhase, setSchPhase]   = useState<Phase>('idle');
  const [bothPhase, setBothPhase] = useState<Phase>('idle');
  const [log, setLog]             = useState<string[]>([]);
  const [errorMsg, setErrorMsg]   = useState('');

  function withLogCapture(fn: () => Promise<void>) {
    return async () => {
      setLog([]);
      setErrorMsg('');
      const origLog = console.log;
      console.log = (...args: unknown[]) => {
        origLog(...args);
        const msg = args
          .map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a)))
          .join(' ');
        setLog((prev) => [...prev, msg]);
      };
      try {
        await fn();
      } finally {
        console.log = origLog;
      }
    };
  }

  const handleMilitary = withLogCapture(async () => {
    setMilPhase('running');
    try {
      const res = await seedMilitaryDemo();
      setMilPhase(res.success ? 'done' : 'error');
      if (!res.success) setErrorMsg(res.message);
    } catch (err: unknown) {
      setMilPhase('error');
      setErrorMsg((err as Error)?.message ?? 'Unknown error');
    }
  });

  const handleSchool = withLogCapture(async () => {
    setSchPhase('running');
    try {
      const res = await seedSchoolDemo();
      setSchPhase(res.success ? 'done' : 'error');
      if (!res.success) setErrorMsg(res.message);
    } catch (err: unknown) {
      setSchPhase('error');
      setErrorMsg((err as Error)?.message ?? 'Unknown error');
    }
  });

  const handleBoth = withLogCapture(async () => {
    setBothPhase('running');
    try {
      const res = await seedMilitaryAndSchoolDemo();
      setBothPhase(res.success ? 'done' : 'error');
      if (!res.success) setErrorMsg(res.message);
    } catch (err: unknown) {
      setBothPhase('error');
      setErrorMsg((err as Error)?.message ?? 'Unknown error');
    }
  });

  const isAnyRunning =
    milPhase === 'running' || schPhase === 'running' || bothPhase === 'running';

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-8" dir="rtl">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Shield className="text-emerald-500" size={28} />
          <GraduationCap className="text-blue-500" size={28} />
          <h1 className="text-2xl font-black text-gray-900">
            הזנת דמו — צבאי + בית ספר
          </h1>
        </div>
        <p className="text-gray-500 text-sm">
          יוצר נתוני בדיקה ל-2 סצנריות: גדוד 890 (3 פלוגות × 10 חיילים) + בית
          ספר רבין (3 כיתות × 10 תלמידים). כולל feed_posts ל-30 יום אחרונים עם
          שדות סקופ מתאימים.
        </p>
      </div>

      {/* Warning */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <strong>שים לב:</strong> הסקריפט יוסיף נתונים חדשים בכל ריצה. הרץ פעם
        אחת בלבד. לאיפוס — מחק ב-Firestore את הדוקומנטים עם
        {' '}<code className="font-mono bg-amber-100 px-1 rounded">military-demo-*</code> /
        {' '}<code className="font-mono bg-amber-100 px-1 rounded">school-demo-*</code> ואז הרץ שוב.
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        {/* Military only */}
        {milPhase === 'idle' && !isAnyRunning && (
          <button
            onClick={handleMilitary}
            className="flex items-center gap-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl transition-all"
          >
            <Shield size={18} />
            סיד צבאי בלבד (גדוד 890)
          </button>
        )}
        {milPhase === 'running' && (
          <div className="flex items-center gap-2 text-emerald-600 font-semibold">
            <Loader2 size={20} className="animate-spin" />
            <span>מאכלס נתונים צבאיים...</span>
          </div>
        )}
        {milPhase === 'done' && (
          <div className="flex items-center gap-2 text-green-600 font-bold">
            <CheckCircle2 size={20} />
            סיד צבאי הושלם!
          </div>
        )}

        {/* School only */}
        {schPhase === 'idle' && !isAnyRunning && (
          <button
            onClick={handleSchool}
            className="flex items-center gap-2 px-5 py-3 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl transition-all"
          >
            <GraduationCap size={18} />
            סיד בית ספר בלבד (רבין)
          </button>
        )}
        {schPhase === 'running' && (
          <div className="flex items-center gap-2 text-blue-600 font-semibold">
            <Loader2 size={20} className="animate-spin" />
            <span>מאכלס נתוני בית ספר...</span>
          </div>
        )}
        {schPhase === 'done' && (
          <div className="flex items-center gap-2 text-green-600 font-bold">
            <CheckCircle2 size={20} />
            סיד בית ספר הושלם!
          </div>
        )}

        {/* Both */}
        {bothPhase === 'idle' && !isAnyRunning && (
          <button
            onClick={handleBoth}
            className="flex items-center gap-2 px-5 py-3 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-xl transition-all"
          >
            <Play size={18} />
            הרץ את שניהם ביחד
          </button>
        )}
        {bothPhase === 'running' && (
          <div className="flex items-center gap-2 text-gray-600 font-semibold">
            <Loader2 size={20} className="animate-spin" />
            <span>מאכלס שני סידים... אל תסגור את הדף</span>
          </div>
        )}
        {bothPhase === 'done' && (
          <div className="flex items-center gap-2 text-green-600 font-bold text-lg">
            <CheckCircle2 size={24} />
            שני הסידים הושלמו בהצלחה!
          </div>
        )}
      </div>

      {/* Error display */}
      {(milPhase === 'error' || schPhase === 'error' || bothPhase === 'error') && (
        <div className="flex items-start gap-2 text-red-600">
          <AlertCircle size={20} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-bold">שגיאה:</p>
            <p className="text-sm font-mono mt-1">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Live log */}
      {log.length > 0 && (
        <div className="bg-gray-950 rounded-xl p-4 font-mono text-xs text-green-400 space-y-1 max-h-80 overflow-y-auto">
          {log.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )}

      {/* Schema notes */}
      <details className="bg-gray-50 rounded-xl p-4 text-xs text-gray-600 space-y-1 cursor-pointer">
        <summary className="font-bold text-gray-800 mb-2">
          מידע טכני — שדות שנוצרים
        </summary>
        <p className="font-semibold mt-2">משתמשים צבאיים (users):</p>
        <p>core.tenantId = &quot;battalion-890&quot;</p>
        <p>core.unitId = &quot;company-a|b|c&quot;</p>
        <p>core.authorityId = &quot;battalion-890&quot;</p>
        <p>core.ageGroup = &quot;adult&quot;</p>
        <p className="font-semibold mt-2">feed_posts צבאיים:</p>
        <p>authorityId, tenantId, unitId, ageGroup:adult, gender, groupIds:[]</p>
        <p className="font-semibold mt-2">משתמשים — בית ספר (users):</p>
        <p>core.schoolId = &quot;school-rabin&quot;</p>
        <p>core.classId = &quot;class-10a|10b|11a&quot;</p>
        <p>core.affiliations[0].type = &quot;school&quot;</p>
        <p>core.ageGroup = &quot;minor&quot;</p>
        <p className="font-semibold mt-2">feed_posts בית ספר:</p>
        <p>schoolId, authorityId, classId, ageGroup:minor, gender, groupIds:[]</p>
        <p className="font-semibold mt-2">Firestore indexes needed (future):</p>
        <p>feed_posts: tenantId + createdAt DESC</p>
        <p>feed_posts: tenantId + unitId + createdAt DESC</p>
        <p>feed_posts: schoolId + classId + createdAt DESC</p>
      </details>
    </div>
  );
}
