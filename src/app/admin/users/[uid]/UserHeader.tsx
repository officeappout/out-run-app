'use client';

import React from 'react';
import { ArrowRight, Calendar, Clock, Flame, MapPin, User } from 'lucide-react';
import type { AdminUserListItem } from '@/features/admin/services/users.service';
import type { UserFullProfile } from '@/types/user-profile';
import {
  ageFromBirthDate,
  churnRiskLevel,
  CHURN_RISK_STYLE,
  getUserLocation,
  parseBirthDate,
  type UserAuthorityInfo,
} from '../shared.utils';

interface Props {
  user: AdminUserListItem;
  fullProfile: UserFullProfile | null;
  authority: UserAuthorityInfo | null;
  onBack: () => void;
}

/**
 * Fixed header (I1): who this is at a glance. Everything here is read from
 * data the page already loads; nothing new is fetched.
 */
export default function UserHeader({ user, fullProfile, authority, onBack }: Props) {
  const city = getUserLocation(fullProfile, authority).city ?? user.cityName;
  const birth = parseBirthDate(fullProfile?.core?.birthDate);
  const age = birth ? ageFromBirthDate(birth) : null;
  const streak = (fullProfile?.progression as { currentStreak?: number } | undefined)?.currentStreak ?? 0;
  const risk = CHURN_RISK_STYLE[churnRiskLevel(user.lastWorkoutDate)];

  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div className="flex items-center gap-4 min-w-0">
        {user.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote avatar URL, same as before the refactor
          <img src={user.photoURL} alt={user.name} className="w-14 h-14 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-14 h-14 rounded-full bg-[#5BC2F2] text-white flex items-center justify-center font-black text-2xl shrink-0">
            {user.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-black text-gray-900">{user.name}</h2>
            <span className={`px-2.5 py-1 border rounded-full text-xs font-bold ${risk.bg} ${risk.text}`}>
              סיכון נטישה: {risk.label}
            </span>
          </div>
          <p className="text-gray-500 text-sm">{user.email || 'ללא אימייל'}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-gray-600 font-bold">
            <span className="flex items-center gap-1">
              <MapPin size={12} className="text-gray-400" />
              {city || 'עיר לא ידועה'}
            </span>
            <span className="flex items-center gap-1">
              <User size={12} className="text-gray-400" />
              {age !== null ? `גיל ${age}` : 'גיל לא ידוע'}
            </span>
            <span className="flex items-center gap-1">
              <Calendar size={12} className="text-gray-400" />
              הצטרפות: {user.joinDate ? user.joinDate.toLocaleDateString('he-IL') : 'לא ידוע'}
            </span>
            <span className="flex items-center gap-1 text-orange-700">
              <Flame size={12} />
              רצף: {streak}
            </span>
            <span
              className="flex items-center gap-1"
              title={user.lastWorkoutDate ? user.lastWorkoutDate.toLocaleString('he-IL') : undefined}
            >
              <Clock size={12} className="text-gray-400" />
              פעיל לאחרונה: {user.lastWorkoutDate ? user.lastWorkoutDate.toLocaleDateString('he-IL') : 'אין נתון'}
            </span>
          </div>
        </div>
      </div>
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 px-3 py-2 hover:bg-gray-100 rounded-lg transition-colors text-sm font-bold text-gray-600 shrink-0"
      >
        <ArrowRight size={18} />
        חזרה לרשימה
      </button>
    </div>
  );
}
