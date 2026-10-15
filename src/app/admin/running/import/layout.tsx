'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { isRootAdmin } from '@/config/feature-flags';

/**
 * One-off seed / migration pages for the running engine. Nothing links to
 * them, and several delete whole categories of templates (clean-upload,
 * clean-upload-fartlek) or write and delete onboarding questions
 * (decision-tree) on a single click, non-transactionally. They stay
 * reachable for OUT root admins only, behind a warning. The real importers
 * (workouts, programs) are untouched.
 */
const ONE_OFF = [
  '3k-program',
  '5k-program',
  'clean-upload',
  'clean-upload-fartlek',
  'decision-tree',
  'fix-profiles',
  'rank-hills',
  'tag-beginners',
];

export default function RunningImportLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const slug = pathname?.split('/').filter(Boolean)[3] ?? '';
  const oneOff = ONE_OFF.includes(slug);
  const [email, setEmail] = useState<string | null | undefined>(undefined);

  useEffect(() => onAuthStateChanged(auth, (u) => setEmail(u?.email ?? null)), []);

  if (!oneOff) return <>{children}</>;
  if (email === undefined) return null;
  if (!isRootAdmin(email)) {
    return (
      <div className="max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-slate-700" dir="rtl">
        <h1 className="mb-2 text-xl font-black text-slate-900">כלי חד־פעמי</h1>
        <p>זה כלי הזנה חד־פעמי של מנוע הריצה, והוא זמין למנהלי OUT בלבד.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700" dir="rtl">
        כלי הזנה חד־פעמי. חלק מהפעולות כאן מוחקות ומחליפות נתונים חיים בלחיצה אחת, בלי אפשרות לבטל. להריץ רק אם אתה יודע בדיוק מה הוא עושה.
      </div>
      {children}
    </div>
  );
}
