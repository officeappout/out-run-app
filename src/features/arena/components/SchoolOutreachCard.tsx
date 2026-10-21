'use client';

import React, { useState, useEffect } from 'react';
import { GraduationCap, Briefcase, Tent, Check } from 'lucide-react';
import { useUserStore } from '@/features/user';
import { pickTemplate } from '@/features/arena/services/message-templates.service';
import type { MessageCategory } from '@/types/message-template.types';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';
import type { NamespaceKey } from '@/lib/i18n/catalogs';

type CommunityKey = NamespaceKey<typeof community>;

const APP_URL = 'https://appout.co.il/';

type OutreachOrgType = 'school' | 'company' | 'youth_movement';
type Gender = 'male' | 'female';

interface OrgCopy {
  icon: React.ComponentType<{ className?: string }>;
  cardGradient: string;
  cardBorder: string;
  iconBg: string;
  iconColor: string;
  buttonGradient: string;
  /** Remote template key in message-templates (falls back to `messageKey` below) */
  templateKey: MessageCategory;
  /** community.json keys — the default message is gendered and takes {orgName}. */
  messageKey: CommunityKey;
  titleKey: CommunityKey;
  subtitleKey: CommunityKey;
  ctaKey: CommunityKey;
  sentKey: CommunityKey;
}

const ORG_COPY: Record<OutreachOrgType, OrgCopy> = {
  school: {
    icon: GraduationCap,
    cardGradient: 'from-purple-50 to-indigo-50',
    cardBorder: 'border-purple-200/60',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
    buttonGradient: 'from-purple-500 to-indigo-500',
    templateKey: 'school_outreach',
    messageKey: 'outreach.school.message',
    titleKey: 'outreach.school.title',
    subtitleKey: 'outreach.school.subtitle',
    ctaKey: 'outreach.school.cta',
    sentKey: 'outreach.school.sent',
  },
  company: {
    icon: Briefcase,
    cardGradient: 'from-sky-50 to-blue-50',
    cardBorder: 'border-sky-200/60',
    iconBg: 'bg-sky-100',
    iconColor: 'text-sky-600',
    buttonGradient: 'from-sky-500 to-blue-500',
    templateKey: 'company_outreach',
    messageKey: 'outreach.company.message',
    titleKey: 'outreach.company.title',
    subtitleKey: 'outreach.company.subtitle',
    ctaKey: 'outreach.company.cta',
    sentKey: 'outreach.company.sent',
  },
  youth_movement: {
    icon: Tent,
    cardGradient: 'from-emerald-50 to-teal-50',
    cardBorder: 'border-emerald-200/60',
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
    buttonGradient: 'from-emerald-500 to-teal-500',
    templateKey: 'youth_movement_outreach',
    messageKey: 'outreach.youth.message',
    titleKey: 'outreach.youth.title',
    subtitleKey: 'outreach.youth.subtitle',
    ctaKey: 'outreach.youth.cta',
    sentKey: 'outreach.youth.sent',
  },
};

interface SchoolOutreachCardProps {
  /** Display name of the organization (school / company / movement) */
  schoolName: string;
  /** Which organization vertical the copy + styling should target */
  orgType?: OutreachOrgType;
}

export default function SchoolOutreachCard({
  schoolName,
  orgType = 'school',
}: SchoolOutreachCardProps) {
  const t = useT(community);
  const profile = useUserStore((s) => s.profile);
  const [sent, setSent] = useState(false);
  const [messageText, setMessageText] = useState('');

  const gender: Gender = profile?.core?.gender === 'female' ? 'female' : 'male';
  // Catalog copy: male / female / neutral (`other`) — gender batch 2 (21.10.2026). The Firestore
  // templates (pickTemplate) only have male / female texts, so `gender` keeps the male fallback for them.
  const rawGender = profile?.core?.gender;
  const copyGender = rawGender === 'female' || rawGender === 'male' ? rawGender : 'other';
  const copy = ORG_COPY[orgType];
  const Icon = copy.icon;
  // Rendered with the template's own `${orgName}` placeholder as the value, so the default goes
  // through the same placeholder substitution as a remote template.
  const defaultTemplate = t(copy.messageKey, { orgName: '${orgName}', gender: copyGender });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let raw = await pickTemplate(copy.templateKey, gender);
      if (!raw) {
        raw = defaultTemplate;
      }
      if (cancelled) return;

      const finalText = raw
        .replace(/\$\{orgName\}/g, schoolName)
        .replace(/\{\{orgName\}\}/g, schoolName)
        // Backwards-compat with legacy school templates that used schoolName
        .replace(/\$\{schoolName\}/g, schoolName)
        .replace(/\{\{schoolName\}\}/g, schoolName);
      setMessageText(finalText + '\n' + APP_URL);
    })();
    return () => {
      cancelled = true;
    };
  }, [gender, schoolName, copy, defaultTemplate]);

  function handleShare() {
    const fallback = defaultTemplate.replace(
      /\$\{orgName\}/g,
      schoolName,
    );
    const text = messageText || `${fallback}\n${APP_URL}`;

    // No pre-filled phone — let the user pick the right contact from their list
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    setSent(true);
  }

  return (
    <div
      className={`bg-gradient-to-br ${copy.cardGradient} border ${copy.cardBorder} rounded-2xl p-5 shadow-sm`}
      dir="rtl"
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-xl ${copy.iconBg} flex items-center justify-center flex-shrink-0`}
        >
          <Icon className={`w-5 h-5 ${copy.iconColor}`} />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-black text-gray-900">{t(copy.titleKey, { orgName: schoolName })}</h3>
          <p className="text-xs text-gray-600 mt-1 leading-relaxed">{t(copy.subtitleKey, { gender: copyGender })}</p>
        </div>
      </div>

      <button
        onClick={handleShare}
        disabled={sent}
        className={`w-full mt-4 py-3 rounded-2xl font-black text-sm shadow-md active:scale-[0.98] transition-all ${
          sent ? 'bg-green-500 text-white' : `bg-gradient-to-l ${copy.buttonGradient} text-white`
        }`}
      >
        {sent ? (
          <span className="flex items-center justify-center gap-2">
            <Check className="w-4 h-4" /> {t(copy.sentKey)}
          </span>
        ) : (
          t(copy.ctaKey, { gender: copyGender })
        )}
      </button>
    </div>
  );
}
