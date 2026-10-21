'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Megaphone, Check } from 'lucide-react';
import { useUserStore } from '@/features/user';
import { logMunicipalPressure } from '@/features/arena/services/pressure.service';
import { pickTemplate } from '@/features/arena/services/message-templates.service';
import type { Authority } from '@/types/admin-types';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';

const APP_URL = 'https://appout.co.il/';

// The default message (when no remote template exists) is community.json `pressure.message`.
// It is rendered with the template's own `${var}` placeholders as values, so it goes through
// substituteVars exactly like a remote template does.
const TEMPLATE_VARS = { contactPerson: '${contactPerson}', cityName: '${cityName}' };

function substituteVars(
  template: string,
  vars: Record<string, string>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    // Handle both ${key} and {{key}} patterns
    result = result
      .replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value)
      .replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

interface MunicipalPressureCardProps {
  cityName: string;
  authority: Authority | null;
}

export default function MunicipalPressureCard({ cityName, authority }: MunicipalPressureCardProps) {
  const profile = useUserStore((s) => s.profile);
  const [sent, setSent] = useState(false);
  const [messageText, setMessageText] = useState('');

  const t = useT(community);
  const gender = profile?.core?.gender ?? 'male';
  // Catalog copy: male / female / neutral (`other`) — gender batch 2 (21.10.2026). The Firestore
  // templates (pickTemplate below) only have male / female texts, so they keep the male fallback.
  const profileGender = profile?.core?.gender;
  const copyGender = profileGender === 'female' || profileGender === 'male' ? profileGender : 'other';
  const defaultTemplate = t('pressure.message', { ...TEMPLATE_VARS, gender: copyGender });

  // Prefer the authority's real name over the prop (which may be a fallback)
  const resolvedCityName = authority?.name || cityName;
  const resolvedContact = authority?.contactPersonName || t('pressure.defaultContact');
  const contactType = authority?.contactType ?? 'whatsapp';
  const contactValue = authority?.contactValue;

  // Build substitution map once, used by both the effect and the click handler
  const vars: Record<string, string> = {
    cityName: resolvedCityName,
    contactPerson: resolvedContact,
    contactPersonName: resolvedContact,
  };

  // Re-generate the message whenever the authority finishes loading or gender changes
  useEffect(() => {
    // Don't generate until authority has loaded (to avoid "העיר שלך")
    if (!authority) return;

    let cancelled = false;
    (async () => {
      let raw = await pickTemplate('city_pressure', gender);
      if (!raw) {
        raw = defaultTemplate;
      }
      if (cancelled) return;

      const finalText = substituteVars(raw, vars);
      setMessageText(finalText + '\n' + APP_URL);
    })();
    return () => { cancelled = true; };
  }, [gender, authority?.id, resolvedCityName, resolvedContact, defaultTemplate]);

  function buildFallbackMessage(): string {
    return substituteVars(defaultTemplate, vars) + '\n' + APP_URL;
  }

  async function handlePressure() {
    const uid = profile?.id;
    const authorityId = authority?.id;
    const text = messageText || buildFallbackMessage();

    let platform: 'whatsapp' | 'email' | 'link' | 'share' = 'share';

    if (contactType === 'whatsapp' && contactValue) {
      platform = 'whatsapp';
      const phone = contactValue.replace(/[^0-9]/g, '');
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
    } else if (contactType === 'email' && contactValue) {
      platform = 'email';
      window.open(
        `mailto:${contactValue}?subject=${encodeURIComponent(t('pressure.mailSubject', { city: resolvedCityName }))}&body=${encodeURIComponent(text)}`,
      );
    } else if (contactType === 'link' && contactValue) {
      platform = 'link';
      window.open(contactValue, '_blank');
    } else if (navigator.share) {
      platform = 'share';
      navigator.share({ text }).catch(() => {});
    } else if (navigator.clipboard) {
      platform = 'share';
      navigator.clipboard.writeText(text);
    }

    if (uid && authorityId) {
      const logged = await logMunicipalPressure(authorityId, uid, platform);
      if (logged) setSent(true);
    }
  }

  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/60 rounded-2xl p-5 shadow-sm" dir="rtl">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
          <Megaphone className="w-5 h-5 text-amber-600" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-black text-gray-900">
            {t('pressure.title', { city: resolvedCityName })}
          </h3>
          <p className="text-xs text-gray-600 mt-1 leading-relaxed">
            {t('pressure.body', { contact: resolvedContact, gender: copyGender })}
          </p>
        </div>
      </div>

      <button
        onClick={handlePressure}
        disabled={sent}
        className={`w-full mt-4 py-3 rounded-2xl font-black text-sm shadow-md active:scale-[0.98] transition-all ${
          sent
            ? 'bg-green-500 text-white'
            : 'bg-gradient-to-l from-amber-500 to-orange-500 text-white'
        }`}
      >
        {sent ? (
          <span className="flex items-center justify-center gap-2">
            <Check className="w-4 h-4" /> {t('pressure.sent')}
          </span>
        ) : (
          t('pressure.cta', { gender: copyGender })
        )}
      </button>
    </div>
  );
}
