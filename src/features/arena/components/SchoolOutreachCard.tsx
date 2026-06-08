'use client';

import React, { useState, useEffect } from 'react';
import { GraduationCap, Briefcase, Tent, Check } from 'lucide-react';
import { useUserStore } from '@/features/user';
import { pickTemplate } from '@/features/arena/services/message-templates.service';
import type { MessageCategory } from '@/types/message-template.types';

const APP_URL = 'https://appout.co.il/';

type OutreachOrgType = 'school' | 'company' | 'youth_movement';
type Gender = 'male' | 'female';

interface OrgCopy {
  icon: React.ComponentType<{ className?: string }>;
  cardGradient: string;
  cardBorder: string;
  iconBg: string;
  iconColor: string;
  buttonGradient: string;
  /** Remote template key in message-templates (falls back to defaults below) */
  templateKey: MessageCategory;
  defaultMale: string;
  defaultFemale: string;
  title: (orgName: string, g: Gender) => string;
  subtitle: (g: Gender) => string;
  buttonIdle: (g: Gender) => string;
  sentLabel: string;
}

const ORG_COPY: Record<OutreachOrgType, OrgCopy> = {
  school: {
    icon: GraduationCap,
    cardGradient: 'from-purple-50 to-indigo-50',
    cardBorder: 'border-purple-200/60',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
    buttonGradient: 'from-purple-500 to-indigo-500',
    templateKey: 'school_outreach',
    defaultMale:
      'היי, אני תלמיד ב-${orgName} ומתאמן עם Out. רציתי להציע שנביא את הפלטפורמה לבית הספר — זה בחינם ומדליק! 🔥',
    defaultFemale:
      'היי, אני תלמידה ב-${orgName} ומתאמנת עם Out. רציתי להציע שנביא את הפלטפורמה לבית הספר — זה בחינם ומדליק! 🔥',
    title: (orgName) => `רוצה להביא את Out ל${orgName}?`,
    subtitle: (g) =>
      `${g === 'female' ? 'דברי' : 'דבר'} עם המנהל/ת! ${g === 'female' ? 'שלחי' : 'שלח'} הודעה בוואטסאפ והמורה ישמע על Out.`,
    buttonIdle: (g) => `🏫 ${g === 'female' ? 'שלחי' : 'שלח'} הודעה למנהל/ת`,
    sentLabel: 'נשלח! תודה 🎓',
  },
  company: {
    icon: Briefcase,
    cardGradient: 'from-sky-50 to-blue-50',
    cardBorder: 'border-sky-200/60',
    iconBg: 'bg-sky-100',
    iconColor: 'text-sky-600',
    buttonGradient: 'from-sky-500 to-blue-500',
    templateKey: 'company_outreach',
    defaultMale:
      'היי, אני עובד ב-${orgName} ומתאמן עם Out. שווה שנביא את זה לארגון — בחינם ומחזק את הצוות! 💪',
    defaultFemale:
      'היי, אני עובדת ב-${orgName} ומתאמנת עם Out. שווה שנביא את זה לארגון — בחינם ומחזק את הצוות! 💪',
    title: (orgName) => `רוצה ש-Out יגיע ל${orgName}?`,
    subtitle: (g) =>
      `${g === 'female' ? 'דברי' : 'דבר'} עם מחלקת הרווחה / HR ושתפו את הצוות בוואטסאפ.`,
    buttonIdle: (g) => `🏢 ${g === 'female' ? 'שלחי' : 'שלח'} הודעה ל-HR`,
    sentLabel: 'נשלח! תודה 🤝',
  },
  youth_movement: {
    icon: Tent,
    cardGradient: 'from-emerald-50 to-teal-50',
    cardBorder: 'border-emerald-200/60',
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
    buttonGradient: 'from-emerald-500 to-teal-500',
    templateKey: 'youth_movement_outreach',
    defaultMale:
      'היי, אני חניך ב-${orgName} ומתאמן עם Out. בואו נביא את זה לתנועה — אימונים מגניבים בחינם! 🔥',
    defaultFemale:
      'היי, אני חניכה ב-${orgName} ומתאמנת עם Out. בואו נביא את זה לתנועה — אימונים מגניבים בחינם! 🔥',
    title: (orgName) => `רוצה את Out ב${orgName}?`,
    subtitle: (g) =>
      `${g === 'female' ? 'דברי' : 'דבר'} עם הרכז/ת ושתפו את החניכים בוואטסאפ.`,
    buttonIdle: (g) => `⛺ ${g === 'female' ? 'שלחי' : 'שלח'} הודעה לרכז/ת`,
    sentLabel: 'נשלח! תודה 🔥',
  },
};

interface SchoolOutreachCardProps {
  /** Display name of the organization (school / company / movement) */
  schoolName: string;
  /** Which organization vertical the copy + styling should target */
  orgType?: OutreachOrgType;
}

export default function SchoolOutreachCard({
  schoolName,
  orgType = 'school',
}: SchoolOutreachCardProps) {
  const profile = useUserStore((s) => s.profile);
  const [sent, setSent] = useState(false);
  const [messageText, setMessageText] = useState('');

  const gender: Gender = profile?.core?.gender === 'female' ? 'female' : 'male';
  const copy = ORG_COPY[orgType];
  const Icon = copy.icon;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let raw = await pickTemplate(copy.templateKey, gender);
      if (!raw) {
        raw = gender === 'female' ? copy.defaultFemale : copy.defaultMale;
      }
      if (cancelled) return;

      const finalText = raw
        .replace(/\$\{orgName\}/g, schoolName)
        .replace(/\{\{orgName\}\}/g, schoolName)
        // Backwards-compat with legacy school templates that used schoolName
        .replace(/\$\{schoolName\}/g, schoolName)
        .replace(/\{\{schoolName\}\}/g, schoolName);
      setMessageText(finalText + '\n' + APP_URL);
    })();
    return () => {
      cancelled = true;
    };
  }, [gender, schoolName, copy]);

  function handleShare() {
    const fallback = (gender === 'female' ? copy.defaultFemale : copy.defaultMale).replace(
      /\$\{orgName\}/g,
      schoolName,
    );
    const text = messageText || `${fallback}\n${APP_URL}`;

    // No pre-filled phone — let the user pick the right contact from their list
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    setSent(true);
  }

  return (
    <div
      className={`bg-gradient-to-br ${copy.cardGradient} border ${copy.cardBorder} rounded-2xl p-5 shadow-sm`}
      dir="rtl"
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-xl ${copy.iconBg} flex items-center justify-center flex-shrink-0`}
        >
          <Icon className={`w-5 h-5 ${copy.iconColor}`} />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-black text-gray-900">{copy.title(schoolName, gender)}</h3>
          <p className="text-xs text-gray-600 mt-1 leading-relaxed">{copy.subtitle(gender)}</p>
        </div>
      </div>

      <button
        onClick={handleShare}
        disabled={sent}
        className={`w-full mt-4 py-3 rounded-2xl font-black text-sm shadow-md active:scale-[0.98] transition-all ${
          sent ? 'bg-green-500 text-white' : `bg-gradient-to-l ${copy.buttonGradient} text-white`
        }`}
      >
        {sent ? (
          <span className="flex items-center justify-center gap-2">
            <Check className="w-4 h-4" /> {copy.sentLabel}
          </span>
        ) : (
          copy.buttonIdle(gender)
        )}
      </button>
    </div>
  );
}
