'use client';

import React from 'react';
import { Shield, Mail, AlertCircle, User, Bell, BellOff, Smartphone } from 'lucide-react';
import type { UserTabData } from '../tabs/types';

/** Account, push and attribution chips (moved from the old page header). */
export default function AccountChips({ user, fullProfile }: Pick<UserTabData, 'user' | 'fullProfile'>) {
  return (
    <div>
      <h3 className="text-lg font-black text-gray-900 mb-4">חשבון והתראות</h3>
      <div className="flex flex-wrap items-center gap-2">
        {/* Account Security Badge */}
        {(() => {
          const accountStatus = (fullProfile as any).accountStatus;
          const accountMethod = (fullProfile as any).accountMethod;
          const hasEmail = !!fullProfile.core?.email;
          const isAnon = fullProfile.core?.isAnonymous === true;

          if (accountStatus === 'secured') {
            if (accountMethod === 'google') {
              return (
                <span className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold flex items-center gap-1">
                  <Shield size={12} />
                  חשבון מאובטח (Google)
                </span>
              );
            } else if (accountMethod === 'email') {
              return (
                <span className="px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold flex items-center gap-1">
                  <Mail size={12} />
                  חשבון מאובטח (Email)
                </span>
              );
            } else {
              return (
                <span className="px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold flex items-center gap-1">
                  <Shield size={12} />
                  חשבון מאובטח
                </span>
              );
            }
          } else if (accountStatus === 'unsecured') {
            return (
              <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-bold flex items-center gap-1">
                <AlertCircle size={12} />
                ללא גיבוי
              </span>
            );
          } else if (isAnon && !hasEmail) {
            return (
              <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-bold flex items-center gap-1">
                <User size={12} />
                אורח (ישן)
              </span>
            );
          } else if (!isAnon && hasEmail) {
            return (
              <span className="px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold flex items-center gap-1">
                <Shield size={12} />
                רשום (ישן)
              </span>
            );
          }
          return null;
        })()}
        {user.pushEnabled ? (
          <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold flex items-center gap-1">
            <Bell size={12} />
            התראות פעילות
          </span>
        ) : (
          <span className="px-2.5 py-1 bg-gray-100 text-gray-500 rounded-full text-xs font-bold flex items-center gap-1">
            <BellOff size={12} />
            התראות כבויות
          </span>
        )}
        <span
          className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${
            user.fcmTokenCount > 0
              ? 'bg-blue-100 text-blue-700'
              : 'bg-gray-100 text-gray-500'
          }`}
          title={`${user.fcmTokenCount} מכשיר${user.fcmTokenCount === 1 ? '' : 'ים'} רשומ${user.fcmTokenCount === 1 ? '' : 'ים'} ל-FCM`}
        >
          <Smartphone size={12} />
          {user.fcmTokenCount} מכשירים
        </span>
        {/*
          Growth Hub — Tier 3 Marketing Attribution badges.
          Three render branches, in priority order:
            1. user.marketingAttribution missing entirely
               → legacy user, render nothing.
            2. source === 'organic'
               → single calm gray chip — no paid acquisition.
            3. source is a real platform string
               → triple chip set (campaign · source · medium),
                 each guarded with a ?? 'לא ידוע' fallback so
                 partial attribution docs still render cleanly.
        */}
        {user.marketingAttribution && (
          user.marketingAttribution.source === 'organic' ? (
            <span
              className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-bold flex items-center gap-1"
              title="המשתמש הגיע ישירות (ללא קמפיין שיווקי)"
            >
              <span aria-hidden="true">🟢</span>
              הגעה: אורגני
            </span>
          ) : (
            <>
              <span
                className="px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold flex items-center gap-1"
                title={`קמפיין שיווקי: ${user.marketingAttribution.campaign ?? 'ללא'}`}
              >
                <span aria-hidden="true">📢</span>
                קמפיין: {user.marketingAttribution.campaign ?? 'ללא'}
              </span>
              <span
                className="px-2.5 py-1 bg-sky-100 text-sky-700 rounded-full text-xs font-bold flex items-center gap-1"
                title={`מקור תנועה: ${user.marketingAttribution.source ?? 'לא ידוע'}`}
              >
                <span aria-hidden="true">📍</span>
                מקור: {user.marketingAttribution.source ?? 'לא ידוע'}
              </span>
              <span
                className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-bold flex items-center gap-1"
                title={`מדיה: ${user.marketingAttribution.medium ?? 'לא ידוע'}`}
              >
                <span aria-hidden="true">📱</span>
                מדיה: {user.marketingAttribution.medium ?? 'לא ידוע'}
              </span>
            </>
          )
        )}
      </div>
    </div>
  );
}
