'use client';

import React from 'react';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';
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
  const t = useT(community);
  const isWork       = groupType === 'work';
  /** ICU select value for the work / campus copy (anything but 'work' is the campus text, as before). */
  const org          = isWork ? 'work' : 'other';
  const recipient    = isWork ? 'HR / מנהל ישיר' : 'אגודת הסטודנטים'; // i18n-allow-hebrew: legacy v1 (enable_home_v2 on) — v1 button text only
  const icon         = isWork ? '🏢' : '🎓';

  const shareText = t('createGroup.outreach.shareText', { org });

  const sendOutreach = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank');
    onSend();
  };

  const v2 = React.useContext(WizardV2);
  if (v2) {
    const OrgIcon = isWork ? Briefcase : GraduationCap;
    const howSteps = [
      t('createGroup.outreach.howStep1', { org }),
      t('createGroup.outreach.howStep2'),
      t('createGroup.outreach.howStep3', { org }),
    ];
    return (
      <div className="space-y-4 pt-4 text-right" dir="rtl">
        <div className="rounded-v2-card bg-v2-tint px-5 py-6 text-center">
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-white text-v2-deep shadow-v2-ring" aria-hidden>
            <OrgIcon size={26} strokeWidth={2.4} />
          </span>
          <h3 className="text-[17px] font-black text-v2-ink">{t('createGroup.outreach.title', { org })}</h3>
          <p className="mx-auto mt-1.5 max-w-[290px] text-[14px] font-semibold leading-relaxed text-v2-ink-2">
            {t('createGroup.outreach.body', { org })}
          </p>
        </div>

        <div className="rounded-[20px] bg-white p-4 shadow-v2-ring">
          <p className="mb-3 text-[15px] font-black text-v2-ink">{t('createGroup.outreach.how')}</p>
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
            ? <><Check className="h-4 w-4" strokeWidth={2.8} />{t('createGroup.outreach.sent')}</>
            : <><Send className="h-4 w-4" />{t('createGroup.outreach.send', { org })}</>}
        </button>

        <button
          type="button"
          onClick={onContinue}
          className="h-11 w-full whitespace-nowrap rounded-full text-[14px] font-extrabold text-v2-muted transition-transform duration-150 ease-v2 active:scale-[0.97]"
        >
          {outreachSent ? t('createGroup.outreach.continueSent') : t('createGroup.outreach.continueUnsent')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 pt-4 text-right" dir="rtl">
      <div className="bg-gradient-to-b from-amber-50 to-white rounded-3xl p-6 border border-amber-200/60 text-center">
        <div className="text-4xl mb-3">{icon}</div>
        <h3 className="text-base font-black text-gray-900">
          {t('createGroup.outreach.title', { org })}
        </h3>
        <p className="text-xs text-gray-600 mt-2 leading-relaxed max-w-[280px] mx-auto">
          {t('createGroup.outreach.body', { org })}
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <p className="text-sm font-bold text-gray-900 mb-2">{t('createGroup.outreach.how')}</p>
        <ol className="text-xs text-gray-600 space-y-1.5 list-decimal pr-4">
          <li>{t('createGroup.outreach.howStep1', { org })}</li>
          <li>{t('createGroup.outreach.howStep2')}</li>
          <li>{t('createGroup.outreach.howStep3', { org })}</li>
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
          ? `✅ נשלח! תודה ${icon}` // i18n-allow-hebrew: legacy v1 (enable_home_v2 on)
          : `📩 שלח הודעה ל${recipient}` /* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}
      </button>

      <button
        onClick={onContinue}
        className="w-full py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm active:scale-[0.98] transition-all"
      >
        {outreachSent ? 'המשך ליצירת הקבוצה →' /* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */ : t('createGroup.outreach.continueUnsent')}
      </button>
    </div>
  );
}
