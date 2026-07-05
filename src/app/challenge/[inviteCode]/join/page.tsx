'use client';

export const dynamic = 'force-dynamic';

/**
 * /challenge/[inviteCode]/join
 *
 * Quick registration form for challenge booth.
 * Collects: name + age (single number) + gender.
 * No phone field.
 *
 * On submit:
 *   1. signInGuest() — creates anonymous Firebase session
 *   2. POST /api/challenge/join — saves minimal profile + triple-write membership
 *   3. Saves groupId + uid to sessionStorage for downstream pages
 *   4. Redirects to /challenge/[inviteCode]/timer
 */

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { signInGuest } from '@/lib/auth.service';
import { auth } from '@/lib/firebase';

type Gender = 'male' | 'female' | 'other';

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'male',   label: 'גבר'   },
  { value: 'female', label: 'אישה'  },
  { value: 'other',  label: 'אחר'   },
];

export default function ChallengeJoinPage() {
  const params     = useParams();
  const router     = useRouter();
  const inviteCode = typeof params.inviteCode === 'string' ? params.inviteCode : '';

  const [name,   setName]   = useState('');
  const [age,    setAge]    = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const isValid = name.trim().length >= 2 && Number(age) >= 5 && Number(age) <= 120 && gender !== null;

  const handleSubmit = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      // 1. Ensure anonymous auth session exists
      let uid = auth.currentUser?.uid;
      if (!uid) {
        const { user, error: authError } = await signInGuest();
        if (authError || !user) throw new Error('auth-failed');
        uid = user.uid;
      }

      // 2. Get ID token
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('no-token');

      // 3. Join challenge group + save profile
      const res = await fetch('/api/challenge/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          inviteCode,
          name: name.trim(),
          age: Number(age),
          gender,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        if (body.error === 'invalid-invite-code') {
          setError('קישור לא תקין. אנא נסה שוב.');
        } else {
          setError('שגיאה — אנא נסה שוב.');
        }
        setSubmitting(false);
        return;
      }

      const { groupId } = await res.json() as { groupId: string };

      // 4. Persist groupId for the timer + done pages
      sessionStorage.setItem('challenge_group_id', groupId);
      sessionStorage.setItem('challenge_name', name.trim());

      // 5. Go to timer
      router.push(`/challenge/${inviteCode}/timer`);
    } catch {
      setError('שגיאה — אנא נסה שוב.');
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-dvh bg-white flex flex-col items-center" dir="rtl">
      <div className="w-full max-w-sm flex flex-col flex-1 px-6 pt-10 pb-8">

        {/* Brand */}
        <span className="text-2xl font-black tracking-wide" style={{ color: '#06b6d4' }}>OUT</span>

        {/* Title */}
        <h1 className="mt-5 text-2xl font-black text-gray-900">אתגר ה-L-Sit</h1>
        <p className="mt-1 text-sm text-gray-500">כמה שניות תחזיק?</p>

        {/* Form */}
        <div className="mt-8 flex flex-col gap-5 flex-1">

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">שם</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="הכנס שם"
              className="w-full h-12 rounded-xl border border-gray-200 bg-gray-50 px-4 text-base text-gray-900 text-right outline-none focus:border-cyan-400 transition-colors"
              autoComplete="given-name"
            />
          </div>

          {/* Age */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">גיל</label>
            <input
              type="number"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="גיל"
              min={5}
              max={120}
              className="w-full h-12 rounded-xl border border-gray-200 bg-gray-50 px-4 text-base text-gray-900 text-right outline-none focus:border-cyan-400 transition-colors"
            />
          </div>

          {/* Gender */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">מין</label>
            <div className="flex gap-2">
              {GENDER_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setGender(value)}
                  className="flex-1 h-12 rounded-xl border text-sm font-semibold transition-colors"
                  style={
                    gender === value
                      ? { background: '#cffafe', borderColor: '#06b6d4', color: '#0e7490' }
                      : { background: '#f8fafc', borderColor: '#e2e8f0', color: '#374151' }
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-500 text-center">{error}</p>
          )}
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!isValid || submitting}
          className="mt-6 w-full h-14 rounded-2xl text-white text-lg font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
          style={{
            background: isValid && !submitting
              ? 'linear-gradient(135deg, #0e7490, #06b6d4)'
              : '#e2e8f0',
            color: isValid && !submitting ? '#fff' : '#9ca3af',
          }}
        >
          {submitting ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>התחל אתגר <span className="text-xl">›</span></>
          )}
        </button>
        <p className="text-center text-xs text-gray-400 mt-3">בלי הרשמה · נכנסים ישר</p>
      </div>
    </div>
  );
}
