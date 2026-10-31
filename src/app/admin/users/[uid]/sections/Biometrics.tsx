'use client';

import React from 'react';
import { TrendingUp } from 'lucide-react';
import type { UserTabData } from '../tabs/types';

/** Height, weight, birth date. */
export default function Biometrics({ fullProfile }: Pick<UserTabData, 'fullProfile'>) {
  return (
    <div>
      <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
        <TrendingUp size={20} className="text-purple-500" />
        ביומטריה
      </h3>
      <div className="grid grid-cols-2 gap-4 mb-4">
        {((fullProfile.core as any).height) ? (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
            <div className="text-sm text-gray-600 mb-1">גובה</div>
            <div className="font-bold text-gray-900">{(fullProfile.core as any).height} ס"מ</div>
          </div>
        ) : (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <div className="text-sm text-gray-600 mb-1">גובה</div>
            <div className="text-sm text-gray-500 italic">טרם סופק</div>
          </div>
        )}
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
          <div className="text-sm text-gray-600 mb-1">משקל</div>
          <div className="font-bold text-gray-900">{fullProfile?.core?.weight || 'טרם סופק'} ק"ג</div>
        </div>
        {(() => {
          // Robust birthDate parsing — handles Date objects, Firestore Timestamps, ISO strings
          const rawBirthDate = fullProfile?.core?.birthDate;
          let parsedDate: Date | null = null;
          if (rawBirthDate) {
            if (rawBirthDate instanceof Date && !isNaN(rawBirthDate.getTime())) {
              parsedDate = rawBirthDate;
            } else if (typeof (rawBirthDate as any)?.toDate === 'function') {
              parsedDate = (rawBirthDate as any).toDate();
            } else if (typeof rawBirthDate === 'string') {
              const d = new Date(rawBirthDate);
              if (!isNaN(d.getTime())) parsedDate = d;
            } else if (typeof (rawBirthDate as any)?.seconds === 'number') {
              parsedDate = new Date((rawBirthDate as any).seconds * 1000);
            }
          }
          return parsedDate ? (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
              <div className="text-sm text-gray-600 mb-1">תאריך לידה</div>
              <div className="font-bold text-gray-900">
                {parsedDate.toLocaleDateString('he-IL')}
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <div className="text-sm text-gray-600 mb-1">תאריך לידה</div>
              <div className="text-sm text-gray-500 italic">טרם סופק</div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
