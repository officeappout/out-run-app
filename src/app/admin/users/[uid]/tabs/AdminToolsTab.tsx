'use client';

import React from 'react';
import EconomySection from '../sections/EconomySection';
import EventTimeline from '../sections/EventTimeline';
import PushHistory from '../sections/PushHistory';
import type { UserTabData } from './types';

type Props = Pick<UserTabData, 'user' | 'fullProfile' | 'workoutHistory' | 'analyticsEvents' | 'pushHistory'>;

/** ניהול: XP/economy/gamification, event and push logs, security, raw JSON. */
export default function AdminToolsTab({ user, fullProfile, workoutHistory, analyticsEvents, pushHistory }: Props) {
  return (
    <div className="space-y-6">
      <EconomySection user={user} fullProfile={fullProfile} workoutHistory={workoutHistory} />
      <EventTimeline analyticsEvents={analyticsEvents} />
      <PushHistory pushHistory={pushHistory} />
      {/* Account Security */}
      <div>
        <h3 className="text-lg font-black text-gray-900 mb-4">אבטחת חשבון</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">אימייל מאובטח</p>
            <p className="font-bold text-gray-900">{(fullProfile as any)?.securedEmail || 'לא הוגדר'}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">טלפון מאובטח</p>
            <p className="font-bold text-gray-900">{(fullProfile as any)?.securedPhone || 'לא הוגדר'}</p>
          </div>
        </div>
      </div>
      {/* Raw Onboarding Data (expandable) */}
      <details className="bg-gray-50 rounded-xl p-4">
        <summary className="text-sm font-bold text-gray-700 cursor-pointer">נתונים גולמיים (JSON)</summary>
        <pre className="text-xs text-gray-600 mt-3 bg-white rounded-lg p-3 overflow-x-auto max-h-96 overflow-y-auto">
          {JSON.stringify({
            onboardingAnswers: (fullProfile as any)?.onboardingAnswers,
            assignedResults: (fullProfile as any)?.assignedResults,
            lifestyle: fullProfile.lifestyle,
            health: fullProfile.health,
            running: fullProfile.running,
          }, null, 2)}
        </pre>
      </details>
    </div>
  );
}
