'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { seedSderotDemo, enrichWorkoutMetadata, enrichSderotUsers } from '@/features/admin/services/seed-sderot-demo';
import { CheckCircle2, AlertCircle, Loader2, Play, Building2, Wrench, UserCog } from 'lucide-react';

type Phase = 'idle' | 'running' | 'done' | 'error';

export default function SeedSderotPage() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [enrichPhase, setEnrichPhase] = useState<Phase>('idle');
  const [usersEnrichPhase, setUsersEnrichPhase] = useState<Phase>('idle');
  const [log, setLog] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  function withLogCapture(fn: () => Promise<void>) {
    return async () => {
      setLog([]);
      setErrorMsg('');
      const origLog = console.log;
      console.log = (...args: unknown[]) => {
        origLog(...args);
        const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
        setLog(prev => [...prev, msg]);
      };
      try {
        await fn();
      } finally {
        console.log = origLog;
      }
    };
  }

  const handleSeed = withLogCapture(async () => {
    setPhase('running');
    try {
      const result = await seedSderotDemo();
      setPhase(result.success ? 'done' : 'error');
      if (!result.success) setErrorMsg(result.message);
    } catch (err: unknown) {
      setPhase('error');
      setErrorMsg((err as Error)?.message ?? 'Unknown error');
    }
  });

  const handleEnrich = withLogCapture(async () => {
    setEnrichPhase('running');
    try {
      const result = await enrichWorkoutMetadata();
      setEnrichPhase(result.success ? 'done' : 'error');
      if (!result.success) setErrorMsg('Enrichment failed');
    } catch (err: unknown) {
      setEnrichPhase('error');
      setErrorMsg((err as Error)?.message ?? 'Unknown error');
    }
  });

  const handleUsersEnrich = withLogCapture(async () => {
    setUsersEnrichPhase('running');
    try {
      const result = await enrichSderotUsers();
      setUsersEnrichPhase(result.success ? 'done' : 'error');
      if (!result.success) setErrorMsg('User enrichment failed');
    } catch (err: unknown) {
      setUsersEnrichPhase('error');
      setErrorMsg((err as Error)?.message ?? 'Unknown error');
    }
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-8" dir="rtl">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Building2 className="text-cyan-500" size={28} />
          <h1 className="text-2xl font-black text-gray-900">הזנת דמו שדרות</h1>
        </div>
        <p className="text-gray-500 text-sm">
          מאכלס את ה-Firestore בנתוני הדמו: 14 שכונות, 150 משתמשים, 600+ אימונים, פארקים, מסלולים וקהילה.
        </p>
      </div>

      {/* Warning */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <strong>שים לב:</strong> הסקריפט יוסיף נתונים חדשים לכל ריצה. הרץ פעם אחת בלבד.
        אם צריך לאפס — מחק ידנית מ-Firestore ואז הרץ שוב.
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        {phase === 'idle' && (
          <button
            onClick={handleSeed}
            className="flex items-center gap-2 px-6 py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded-xl transition-all"
          >
            <Play size={18} />
            הרץ סיד שדרות
          </button>
        )}

        {enrichPhase === 'idle' && (
          <button
            onClick={handleEnrich}
            className="flex items-center gap-2 px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-xl transition-all"
          >
            <Wrench size={18} />
            העשר אימונים קיימים (hour/dayOfWeek)
          </button>
        )}
        {enrichPhase === 'running' && (
          <div className="flex items-center gap-2 text-purple-600 font-semibold">
            <Loader2 size={20} className="animate-spin" />
            <span>מעשיר אימונים...</span>
          </div>
        )}
        {enrichPhase === 'done' && (
          <div className="flex items-center gap-2 text-green-600 font-bold">
            <CheckCircle2 size={20} />
            העשרת אימונים הושלמה!
          </div>
        )}

        {usersEnrichPhase === 'idle' && (
          <button
            onClick={handleUsersEnrich}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl transition-all"
          >
            <UserCog size={18} />
            העשר משתמשים (פרסונות + נתיבים + ריצה)
          </button>
        )}
        {usersEnrichPhase === 'running' && (
          <div className="flex items-center gap-2 text-emerald-600 font-semibold">
            <Loader2 size={20} className="animate-spin" />
            <span>מעשיר פרופילי משתמשים...</span>
          </div>
        )}
        {usersEnrichPhase === 'done' && (
          <div className="flex items-center gap-2 text-green-600 font-bold">
            <CheckCircle2 size={20} />
            העשרת משתמשים הושלמה!
          </div>
        )}
      </div>

      {phase === 'running' && (
        <div className="flex items-center gap-2 text-cyan-600 font-semibold">
          <Loader2 size={20} className="animate-spin" />
          <span>מאכלס נתונים... אל תסגור את הדף</span>
        </div>
      )}

      {phase === 'done' && (
        <div className="flex items-center gap-2 text-green-600 font-bold text-lg">
          <CheckCircle2 size={24} />
          הסיד הושלם בהצלחה! אפשר להיכנס לדשבורד שדרות.
        </div>
      )}

      {phase === 'error' && (
        <div className="flex items-start gap-2 text-red-600">
          <AlertCircle size={20} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-bold">שגיאה בהרצת הסיד:</p>
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
    </div>
  );
}
