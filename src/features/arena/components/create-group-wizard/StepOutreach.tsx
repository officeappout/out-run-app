'use client';

import React from 'react';
import { Check, Send, Briefcase, GraduationCap } from 'lucide-react';
import type { CommunityGroupType } from '@/types/community.types';
import { WizardV2, V2C } from './wizard-v2';

// ── Outreach interstitial (work / university) ─────────────────────────────────

export function StepOutreach({
  groupType,
  outreachSent,
  onSend,
  onContinue,
}: {
  groupType: CommunityGroupType;
  outreachSent: boolean;
  onSend: () => void;
  onContinue: () => void;
}) {
  const isWork       = groupType === 'work';
  const label        = isWork ? 'מקום העבודה' : 'הקמפוס';
  const recipient    = isWork ? 'HR / מנהל ישיר' : 'אגודת הסטודנטים';
  const icon         = isWork ? '🏢' : '🎓';
  const orgLabel     = isWork ? 'החברה' : 'הקמפוס';

  const shareText =
    `היי, אני מתאמן/ת עם Out ורוצה להביא את הפלטפורמה ל${label} שלנו! Out זו ליגת כושר עירונית שמחברת אנשים לאימונים חכמים בחוץ. בואו נדבר!\n\nhttps://appout.co.il/`;

  const sendOutreach = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank');
    onSend();
  };

  const v2 = React.useContext(WizardV2);
  if (v2) {
    const OrgIcon = isWork ? Briefcase : GraduationCap;
    const howSteps = [`שלחו את ההודעה ל${recipient}`, 'הם יצרו קשר עם Out', `הליגה הרשמית של ${orgLabel} נפתחת!`];
    return (
      <div className="space-y-4 pt-4 text-right" dir="rtl">
        <div className="rounded-v2-card bg-v2-tint px-5 py-6 text-center">
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-white text-v2-deep shadow-v2-ring" aria-hidden>
            <OrgIcon size={26} strokeWidth={2.4} />
          </span>
          <h3 className="text-[17px] font-black text-v2-ink">רוצים ליגה רשמית ל{label}?</h3>
          <p className="mx-auto mt-1.5 max-w-[290px] text-[14px] font-semibold leading-relaxed text-v2-ink-2">
            פנו ל{recipient} ובקשו שישתפו פעולה עם Out — ואנחנו נפתח את הליגה הרשמית!
          </p>
        </div>

        <div className="rounded-[20px] bg-white p-4 shadow-v2-ring">
          <p className="mb-3 text-[15px] font-black text-v2-ink">איך זה עובד?</p>
          <ol className="space-y-2.5">
            {howSteps.map((txt, i) => (
              <li key={i} className="flex items-center gap-2.5">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-v2-tint text-[12px] font-black text-v2-deep">{i + 1}</span>
                <span className="text-[14px] font-semibold text-v2-ink-2">{txt}</span>
              </li>
            ))}
          </ol>
        </div>

        <button
          type="button"
          onClick={sendOutreach}
          disabled={outreachSent}
          className={`flex h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full text-[15px] font-extrabold ${V2C.press} ${
            outreachSent ? V2C.chipOn : 'bg-white text-v2-deep shadow-v2-ring'
          }`}
        >
          {outreachSent
            ? <><Check className="h-4 w-4" strokeWidth={2.8} />נשלח! תודה</>
            : <><Send className="h-4 w-4" />שלח הודעה ל{recipient}</>}
        </button>

        <button
          type="button"
          onClick={onContinue}
          className="h-11 w-full whitespace-nowrap rounded-full text-[14px] font-extrabold text-v2-muted transition-transform duration-150 ease-v2 active:scale-[0.97]"
        >
          {outreachSent ? 'המשך ליצירת הקבוצה' : 'המשך בלי לשלוח'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 pt-4 text-right" dir="rtl">
      <div className="bg-gradient-to-b from-amber-50 to-white rounded-3xl p-6 border border-amber-200/60 text-center">
        <div className="text-4xl mb-3">{icon}</div>
        <h3 className="text-base font-black text-gray-900">
          רוצים ליגה רשמית ל{label}?
        </h3>
        <p className="text-xs text-gray-600 mt-2 leading-relaxed max-w-[280px] mx-auto">
          פנו ל{recipient} ובקשו שישתפו פעולה עם Out — ואנחנו נפתח את הליגה הרשמית!
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <p className="text-sm font-bold text-gray-900 mb-2">איך זה עובד?</p>
        <ol className="text-xs text-gray-600 space-y-1.5 list-decimal pr-4">
          <li>שלחו את ההודעה ל{recipient}</li>
          <li>הם יצרו קשר עם Out</li>
          <li>הליגה הרשמית של {orgLabel} נפתחת!</li>
        </ol>
      </div>

      <button
        onClick={sendOutreach}
        disabled={outreachSent}
        className={`w-full py-4 rounded-2xl font-black text-sm shadow-md active:scale-[0.98] transition-all ${
          outreachSent
            ? 'bg-emerald-500 text-white'
            : 'bg-gradient-to-l from-amber-500 to-orange-500 text-white'
        }`}
      >
        {outreachSent
          ? `✅ נשלח! תודה ${icon}`
          : `📩 שלח הודעה ל${recipient}`}
      </button>

      <button
        onClick={onContinue}
        className="w-full py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm active:scale-[0.98] transition-all"
      >
        {outreachSent ? 'המשך ליצירת הקבוצה →' : 'המשך בלי לשלוח'}
      </button>
    </div>
  );
}
