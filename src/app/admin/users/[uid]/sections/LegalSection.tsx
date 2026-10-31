'use client';

import React from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, FileText, Shield, X } from 'lucide-react';
import type { UserTabData } from '../tabs/types';

/** Health declaration (with signed PDF link) and terms of use. */
export default function LegalSection({ fullProfile, healthDeclarationPdfUrl }: Pick<UserTabData, 'fullProfile' | 'healthDeclarationPdfUrl'>) {
  return (
    <div>
      <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
        <Shield size={20} className="text-green-500" />
        הצהרות וחתימות
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Health Declaration Status */}
        {(() => {
          const healthAccepted = (fullProfile as any).healthDeclarationAccepted === true;
          const pdfUrl = healthDeclarationPdfUrl;
          const hasInjuries = fullProfile.health?.injuries && fullProfile.health.injuries.length > 0;
          return (
            <div className={`rounded-xl p-5 border-2 ${
              healthAccepted
                ? hasInjuries
                  ? 'bg-yellow-50 border-yellow-300'
                  : 'bg-green-50 border-green-300'
                : 'bg-gray-50 border-gray-300'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-base font-black text-gray-900">הצהרת בריאות</span>
                {healthAccepted ? (
                  hasInjuries ? (
                    <div className="flex items-center gap-2 text-yellow-700">
                      <AlertCircle size={24} className="text-yellow-600" />
                      <span className="font-bold">חתום</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-green-700">
                      <CheckCircle2 size={24} className="text-green-600" />
                      <span className="font-bold">חתום</span>
                    </div>
                  )
                ) : (
                  <div className="flex items-center gap-2 text-gray-500">
                    <X size={24} className="text-gray-400" />
                    <span className="font-bold">לא חתום</span>
                  </div>
                )}
              </div>
              <div className="text-sm text-gray-700 mt-2">
                {healthAccepted
                  ? hasInjuries
                    ? `⚠ יש ${fullProfile.health!.injuries.length} פציעות/בעיות רשומות`
                    : '✓ הושלם - ללא בעיות רפואיות'
                  : 'לא הושלם'}
              </div>
              {hasInjuries && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {fullProfile.health!.injuries.map((injury, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-medium"
                    >
                      {injury}
                    </span>
                  ))}
                </div>
              )}
              {/* View Signed PDF Button */}
              {pdfUrl && (
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-[#5BC2F2] hover:bg-[#4AADE3] text-white rounded-lg text-sm font-bold transition-colors"
                >
                  <FileText size={16} />
                  <span>צפה בהצהרה חתומה (PDF)</span>
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
          );
        })()}

        {/* Terms of Use Status */}
        {(() => {
          const hasSignedTerms = (fullProfile as any).healthTermsAccepted === true;
          const healthTimestamp = (fullProfile as any).healthTimestamp as string | undefined;
          const termsVersion = (fullProfile as any).termsVersion as string | undefined;
          return (
            <div className={`rounded-xl p-5 border-2 ${
              hasSignedTerms
                ? 'bg-green-50 border-green-300'
                : 'bg-gray-50 border-gray-300'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-base font-black text-gray-900">תנאי שימוש</span>
                {hasSignedTerms ? (
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle2 size={24} className="text-green-600" />
                    <span className="font-bold">חתום</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-gray-500">
                    <X size={24} className="text-gray-400" />
                    <span className="font-bold">לא חתום</span>
                  </div>
                )}
              </div>
              <div className="text-sm text-gray-700 mt-2">
                {hasSignedTerms
                  ? '✓ הושלם - חתום ואושר'
                  : 'לא הושלם'}
              </div>
              {hasSignedTerms && (
                <div className="mt-3 space-y-1">
                  {healthTimestamp && (
                    <div className="text-xs text-gray-600">
                      תאריך חתימה: {new Date(healthTimestamp).toLocaleDateString('he-IL')}
                    </div>
                  )}
                  {termsVersion && (
                    <div className="text-xs text-gray-500">
                      גרסת תנאים: v{termsVersion}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
