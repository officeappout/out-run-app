'use client';

import React from 'react';
import { CheckCircle2, Dumbbell, Package } from 'lucide-react';
import type { UserTabData } from '../tabs/types';

/** Equipment inventory + sports and location preferences. */
export default function EquipmentAndSports({ fullProfile, gearDefinitions }: Pick<UserTabData, 'fullProfile' | 'gearDefinitions'>) {
  const getEquipmentNames = (equipmentIds: string[]): string[] => {
    return equipmentIds
      .map((id) => {
        const gear = gearDefinitions.find((g) => g.id === id);
        return gear?.name?.he || gear?.name?.en || id;
      })
      .filter(Boolean);
  };

  return (
    <>
      {/* 4. Equipment Inventory */}
      <div>
        <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
          <Package size={20} className="text-purple-500" />
          ציוד מפורט
        </h3>
        <div className="space-y-3">
          {(fullProfile?.equipment?.home?.length || 0) > 0 && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
              <div className="text-sm font-bold text-purple-700 mb-2">ציוד בית</div>
              <div className="flex flex-wrap gap-2">
                {getEquipmentNames(fullProfile.equipment.home).map((name, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1.5 bg-white border border-purple-300 text-purple-700 rounded-full text-sm font-medium shadow-sm"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {(fullProfile?.equipment?.office?.length || 0) > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="text-sm font-bold text-blue-700 mb-2">ציוד משרד</div>
              <div className="flex flex-wrap gap-2">
                {getEquipmentNames(fullProfile.equipment.office).map((name, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1.5 bg-white border border-blue-300 text-blue-700 rounded-full text-sm font-medium shadow-sm"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {(fullProfile?.equipment?.outdoor?.length || 0) > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="text-sm font-bold text-green-700 mb-2">ציוד חוץ</div>
              <div className="flex flex-wrap gap-2">
                {getEquipmentNames(fullProfile.equipment.outdoor).map((name, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1.5 bg-white border border-green-300 text-green-700 rounded-full text-sm font-medium shadow-sm"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {fullProfile?.core?.hasGymAccess && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-amber-600" />
                <span className="text-sm font-bold text-amber-700">גישה לחדר כושר</span>
              </div>
            </div>
          )}
          {(fullProfile?.equipment?.home?.length || 0) === 0 && 
           (fullProfile?.equipment?.office?.length || 0) === 0 &&
           (fullProfile?.equipment?.outdoor?.length || 0) === 0 &&
           !fullProfile?.core?.hasGymAccess && (
            <div className="text-gray-500 text-sm bg-gray-50 rounded-xl p-4 text-center">
              אין ציוד רשום
            </div>
          )}
        </div>
      </div>
      {/* 4.5 Sports & Location Preferences (BI) */}
      {(() => {
        const oa = (fullProfile as any).onboardingAnswers;
        const prefLocation: string[] | undefined = oa?.preferredLocation;
        const prefSports: string[] | undefined = oa?.preferredSports || oa?.sportsPreferences;
        if (!prefLocation?.length && !prefSports?.length) return null;

        // Human-readable location labels
        const LOCATION_LABELS: Record<string, { he: string; icon: string }> = {
          studio: { he: 'סטודיו / חוגים', icon: '🏢' },
          park:   { he: 'גינת כושר', icon: '🌳' },
          home:   { he: 'אימון ביתי', icon: '🏠' },
          gym:    { he: 'חדר כושר', icon: '🏋️' },
          none:   { he: 'אחר', icon: '✨' },
        };

        // Human-readable sport labels
        const SPORT_LABELS: Record<string, string> = {
          running: 'ריצה',
          walking: 'הליכה',
          cycling: 'אופניים',
          calisthenics: 'קליסטניקס',
          crossfit: 'קרוספיט',
          functional: 'אימון פונקציונלי',
          movement: 'מובמנט',
          basketball: 'כדורסל',
          football: 'כדורגל',
          tennis_padel: 'טניס ופאדל',
          yoga: 'יוגה',
          pilates: 'פילאטיס',
          stretching: 'מתיחות',
          boxing: 'איגרוף',
          kickboxing: 'קיקבוקסינג',
          mma: 'MMA',
          jiu_jitsu: 'ג\'יו ג\'יטסו',
          climbing: 'טיפוס',
          hiking: 'הליכות שטח',
          strength: 'כוח',
          cardio: 'קרדיו',
        };

        return (
          <div>
            <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
              <Dumbbell size={20} className="text-blue-500" />
              העדפות ספורט ומיקום
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Preferred Locations */}
              {prefLocation && prefLocation.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <div className="text-sm font-bold text-blue-700 mb-3">מיקום אימון מועדף</div>
                  <div className="flex flex-wrap gap-2">
                    {prefLocation.map((loc, idx) => {
                      const info = LOCATION_LABELS[loc] || { he: loc, icon: '📍' };
                      return (
                        <span
                          key={idx}
                          className="px-3 py-1.5 bg-white border border-blue-300 text-blue-700 rounded-full text-sm font-medium shadow-sm flex items-center gap-1.5"
                        >
                          <span>{info.icon}</span>
                          <span>{info.he}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Preferred Sports (ranked) */}
              {prefSports && prefSports.length > 0 && (
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                  <div className="text-sm font-bold text-purple-700 mb-3">ענפי ספורט (לפי סדר העדפה)</div>
                  <div className="flex flex-wrap gap-2">
                    {prefSports.map((sport, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1.5 bg-white border border-purple-300 text-purple-700 rounded-full text-sm font-medium shadow-sm flex items-center gap-1.5"
                      >
                        <span className="bg-purple-200 text-purple-800 text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                          {idx + 1}
                        </span>
                        <span>{SPORT_LABELS[sport] || sport}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </>
  );
}
