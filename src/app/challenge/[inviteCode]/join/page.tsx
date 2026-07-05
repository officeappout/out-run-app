'use client';

export const dynamic = 'force-dynamic';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { signInGuest } from '@/lib/auth.service';
import { auth } from '@/lib/firebase';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTranslation } from '@/hooks/useTranslation';
import ChallengeLangToggle from '@/features/challenge/components/ChallengeLangToggle';

type Gender = 'male' | 'female' | 'other';

export default function ChallengeJoinPage() {
  const params     = useParams();
  const router     = useRouter();
  const inviteCode = typeof params.inviteCode === 'string' ? params.inviteCode : '';

  const { direction } = useLanguage();
  const { t } = useTranslation();

  const [name,   setName]   = useState('');
  const [age,    setAge]    = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const genderOptions: { value: Gender; label: string }[] = [
    { value: 'male',   label: t('challenge.join.gender.male')   },
    { value: 'female', label: t('challenge.join.gender.female') },
    { value: 'other',  label: t('challenge.join.gender.other')  },
  ];

  const isValid = name.trim().length >= 2 && Number(age) >= 5 && Number(age) <= 120 && gender !== null;

  const handleSubmit = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      await auth.signOut().catch(() => {});
      const { user, error: authError } = await signInGuest();
      if (authError || !user) throw new Error('auth-failed');

      const idToken = await user.getIdToken();
      if (!idToken) throw new Error('no-token');

      const res = await fetch('/api/challenge/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ inviteCode, name: name.trim(), age: Number(age), gender }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error === 'invalid-invite-code'
          ? t('challenge.join.error.invalidCode')
          : t('challenge.join.error.general'));
        setSubmitting(false);
        return;
      }

      const { groupId } = await res.json() as { groupId: string };

      sessionStorage.setItem('challenge_group_id', groupId);
      sessionStorage.setItem('challenge_name', name.trim());
      sessionStorage.setItem('challenge_gender', gender as string);

      router.push(`/challenge/${inviteCode}/timer`);
    } catch {
      setError(t('challenge.join.error.general'));
      setSubmitting(false);
    }
  };

  const textAlignClass = direction === 'rtl' ? 'text-right' : 'text-left';

  return (
    <div className="min-h-dvh bg-white flex flex-col items-center" dir={direction}>
      <div className="w-full max-w-sm flex flex-col flex-1 px-6 pt-10 pb-8">

        {/* Brand row + toggle */}
        <div className="flex items-center justify-between">
          <span className="text-2xl font-black tracking-wide" style={{ color: '#06b6d4' }}>OUT</span>
          <ChallengeLangToggle />
        </div>

        {/* Title */}
        <h1 className="mt-5 text-2xl font-black text-gray-900">{t('challenge.join.title')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('challenge.join.subtitle')}</p>

        {/* Form */}
        <div className="mt-8 flex flex-col gap-5 flex-1">

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              {t('challenge.join.nameLabel')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('challenge.join.namePlaceholder')}
              className={`w-full h-12 rounded-xl border border-gray-200 bg-gray-50 px-4 text-base text-gray-900 ${textAlignClass} outline-none focus:border-cyan-400 transition-colors`}
              autoComplete="given-name"
            />
          </div>

          {/* Age */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              {t('challenge.join.ageLabel')}
            </label>
            <input
              type="number"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder={t('challenge.join.agePlaceholder')}
              min={5}
              max={120}
              className={`w-full h-12 rounded-xl border border-gray-200 bg-gray-50 px-4 text-base text-gray-900 ${textAlignClass} outline-none focus:border-cyan-400 transition-colors`}
            />
          </div>

          {/* Gender */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              {t('challenge.join.genderLabel')}
            </label>
            <div className="flex gap-2">
              {genderOptions.map(({ value, label }) => (
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
            background: isValid && !submitting ? 'linear-gradient(135deg, #0e7490, #06b6d4)' : '#e2e8f0',
            color: isValid && !submitting ? '#fff' : '#9ca3af',
          }}
        >
          {submitting ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>{t('challenge.join.submit')} <span className="text-xl" aria-hidden>›</span></>
          )}
        </button>
        <p className="text-center text-xs text-gray-400 mt-3">{t('challenge.join.note')}</p>
      </div>
    </div>
  );
}
