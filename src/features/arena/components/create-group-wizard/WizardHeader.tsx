'use client';

import React from 'react';
import { Check, X } from 'lucide-react';
import { STEPS } from './wizard-constants';
import { t } from './wizard-logic';
import type { WizardSuccessInfo } from './wizard-types';

/** Drag handle, title, close button and the step progress dots. */
export function WizardHeader({
  v2,
  successInfo,
  isEditMode,
  myGender,
  step,
  outreachMode,
  handleClose,
}: {
  v2: boolean;
  successInfo: WizardSuccessInfo | null;
  isEditMode: boolean;
  myGender: string | null | undefined;
  step: number;
  outreachMode: 'outreach' | null;
  handleClose: () => void;
}) {
  return (
    <div className="flex-shrink-0 px-5 pt-4 pb-3" dir="rtl">
      {/* Drag handle */}
      <div className={`mx-auto mb-4 rounded-full ${v2 ? 'h-1.5 w-10 bg-v2-pill-border' : 'w-10 h-1 bg-gray-200'}`} />

      <div className="flex items-center justify-between mb-4">
        <h2 className={v2 ? 'text-[22px] font-black !tracking-[-0.02em] text-v2-ink' : 'text-lg font-black text-gray-900'}>
          {successInfo
            ? (v2 ? 'הקהילה שלך באוויר!' : 'הקהילה שלך באוויר! 🚀')
            : isEditMode
              ? t('ערוך קהילה', 'ערכי קהילה', myGender)
              : t('צור קהילה חדשה', 'צורי קהילה חדשה', myGender)}
        </h2>
        <button
          onClick={handleClose}
          aria-label="סגירה"
          className={v2 ? 'grid h-9 w-9 place-items-center rounded-full bg-v2-surface ring-1 ring-inset ring-v2-hairline' : 'w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform'}
        >
          <X className={v2 ? 'h-4 w-4 text-v2-ink' : 'w-4 h-4 text-gray-500'} />
        </button>
      </div>

      {/* Step progress — hidden on success screen */}
      {!successInfo && (
        <>
          <div className="flex items-center gap-1.5">
            {STEPS.map((label, i) => (
              <React.Fragment key={i}>
                <div
                  className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black transition-all ${
                    v2
                      ? i < step
                        ? 'bg-v2-tint text-v2-deep'
                        : i === step
                        ? 'bg-v2-cta text-v2-on-cta shadow-v2-cta'
                        : 'bg-v2-surface text-v2-muted ring-1 ring-inset ring-v2-hairline'
                      : i < step
                      ? 'bg-cyan-500 text-white'
                      : i === step
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {i < step ? <Check className="w-3 h-3" /> : i + 1}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 rounded ${i < step ? (v2 ? 'bg-v2-accent' : 'bg-cyan-500') : (v2 ? 'bg-v2-hairline' : 'bg-gray-100')}`} />
                )}
              </React.Fragment>
            ))}
          </div>
          <p className={v2 ? 'mt-1.5 whitespace-nowrap text-center text-[12px] font-bold text-v2-muted' : 'text-[11px] text-gray-500 font-semibold mt-1.5 text-center'}>
            {outreachMode ? 'פנייה לארגון' : STEPS[step]}
          </p>
        </>
      )}
    </div>
  );
}
