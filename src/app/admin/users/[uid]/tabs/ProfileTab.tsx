'use client';

import React from 'react';
import { Building2, MapPin } from 'lucide-react';
import { safeRenderText } from '@/lib/utils/render-helpers';
import { getUserLocation } from '../../shared.utils';
import OnboardingInput from '../sections/OnboardingInput';
import EquipmentAndSports from '../sections/EquipmentAndSports';
import TrainingProfile from '../sections/TrainingProfile';
import Biometrics from '../sections/Biometrics';
import LegalSection from '../sections/LegalSection';
import type { UserTabData } from './types';

type Props = Pick<UserTabData, 'fullProfile' | 'gearDefinitions' | 'authority' | 'healthDeclarationPdfUrl'>;

/**
 * שאלונים ופרופיל: everything the user entered, plus identity and legal. The levels the
 * questionnaire assigned live only in התקדמות (owner 01.11: answers here, levels once).
 */
export default function ProfileTab({ fullProfile, gearDefinitions, authority, healthDeclarationPdfUrl }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-black text-gray-900 mb-1">קלט אונבורדינג</h3>
        <p className="text-xs text-gray-400 mb-4">מה המשתמש/ת הזין/ה בהרשמה</p>
        <div className="space-y-6">
          <OnboardingInput fullProfile={fullProfile} />
          <EquipmentAndSports fullProfile={fullProfile} gearDefinitions={gearDefinitions} />
        </div>
      </div>

      <TrainingProfile fullProfile={fullProfile} />

      {/* 1. User Identity & Location */}
        <div>
          <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
            <MapPin size={20} className="text-blue-500" />
          זהות ומקום מגורים
          </h3>
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5 space-y-4">
          {(() => {
            const location = getUserLocation(fullProfile, authority);
            return (
              <>
                {location.city && (
                  <div>
                    <div className="text-sm text-gray-600 mb-1">עיר</div>
                    <div className="font-bold text-gray-900 text-lg">{location.city}</div>
                  </div>
                )}
                {location.neighborhood && (
                  <div>
                    <div className="text-sm text-gray-600 mb-1">שכונה</div>
                    <div className="font-bold text-gray-900 text-lg">{location.neighborhood}</div>
                  </div>
                )}
                {!location.city && !location.neighborhood && (
                  <div className="text-sm text-gray-500 italic">טרם סופק</div>
                )}
              </>
            );
          })()}
          {authority && (
            <div className="pt-3 border-t border-blue-200">
            <div className="flex items-center gap-2 mb-2">
              <Building2 size={18} className="text-blue-600" />
              <div className="text-sm text-gray-600">רשות משויכת</div>
            </div>
              <div className="font-bold text-gray-900 text-base">
              {safeRenderText(authority.name)}
              {authority.type === 'city' && ' (עירייה)'}
              {authority.type === 'regional_council' && ' (מועצה אזורית)'}
              {authority.type === 'local_council' && ' (מועצה מקומית)'}
            </div>
              {authority.id && (
                <div className="text-xs text-gray-500 mt-1">ID: {authority.id}</div>
              )}
        </div>
      )}
        </div>
      </div>

      <Biometrics fullProfile={fullProfile} />
      <LegalSection fullProfile={fullProfile} healthDeclarationPdfUrl={healthDeclarationPdfUrl} />
    </div>
  );
}
