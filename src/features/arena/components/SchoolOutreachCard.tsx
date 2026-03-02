'use client';

import React, { useState, useEffect } from 'react';
import { GraduationCap, Check } from 'lucide-react';
import { useUserStore } from '@/features/user';
import { pickTemplate } from '@/features/arena/services/message-templates.service';

const APP_URL = 'https://appout.co.il/';

const DEFAULT_MALE =
  'היי, אני תלמיד ב-${schoolName} ומתאמן עם Out. רציתי להציע שנביא את הפלטפורמה לבית הספר — זה בחינם ומדליק! 🔥';
const DEFAULT_FEMALE =
  'היי, אני תלמידה ב-${schoolName} ומתאמנת עם Out. רציתי להציע שנביא את הפלטפורמה לבית הספר — זה בחינם ומדליק! 🔥';

interface SchoolOutreachCardProps {
  schoolName: string;
}

export default function SchoolOutreachCard({ schoolName }: SchoolOutreachCardProps) {
  const profile = useUserStore((s) => s.profile);
  const [sent, setSent] = useState(false);
  const [messageText, setMessageText] = useState('');

  const gender = profile?.core?.gender ?? 'male';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let raw = await pickTemplate('school_outreach', gender);
      if (!raw) {
        raw = gender === 'female' ? DEFAULT_FEMALE : DEFAULT_MALE;
      }
      if (cancelled) return;

      const finalText = raw
        .replace(/\$\{schoolName\}/g, schoolName)
        .replace(/\{\{schoolName\}\}/g, schoolName);
      setMessageText(finalText + '\n' + APP_URL);
    })();
    return () => { cancelled = true; };
  }, [gender, schoolName]);

  function handleShare() {
    const text = messageText || `${DEFAULT_MALE.replace('${schoolName}', schoolName)}\n${APP_URL}`;

    // No pre-filled phone — let the student pick their principal from contacts
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    setSent(true);
  }

  return (
    <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200/60 rounded-2xl p-5 shadow-sm" dir="rtl">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
          <GraduationCap className="w-5 h-5 text-purple-600" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-black text-gray-900">
            {gender === 'female' ? 'רוצה' : 'רוצה'} להביא את Out ל{schoolName}?
          </h3>
          <p className="text-xs text-gray-600 mt-1 leading-relaxed">
            {gender === 'female' ? 'דברי' : 'דבר'} עם המנהל/ת! {gender === 'female' ? 'שלחי' : 'שלח'} הודעה בוואטסאפ והמורה ישמע על Out.
          </p>
        </div>
      </div>

      <button
        onClick={handleShare}
        disabled={sent}
        className={`w-full mt-4 py-3 rounded-2xl font-black text-sm shadow-md active:scale-[0.98] transition-all ${
          sent
            ? 'bg-green-500 text-white'
            : 'bg-gradient-to-l from-purple-500 to-indigo-500 text-white'
        }`}
      >
        {sent ? (
          <span className="flex items-center justify-center gap-2">
            <Check className="w-4 h-4" /> נשלח! תודה 🎓
          </span>
        ) : (
          `🏫 ${gender === 'female' ? 'שלחי' : 'שלח'} הודעה למנהל/ת`
        )}
      </button>
    </div>
  );
}
