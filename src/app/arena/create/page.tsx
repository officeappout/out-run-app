'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ArrowRight, Home, Building2, GraduationCap, Trees, Share2, Lock, Check, Megaphone, Shield, School } from 'lucide-react';
import { useUserStore } from '@/features/user';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useT } from '@/hooks/useT';
import { common } from '@/messages/ns/common';
import { community } from '@/messages/ns/community';
import { weekdayLabels } from '@/lib/i18n/units';
import { useArenaAccess } from '@/features/arena/hooks/useArenaAccess';
import { createGroup } from '@/features/arena/services/group.service';
import AccessCodeGate from '@/components/ui/AccessCodeGate';
import { pickTemplate } from '@/features/arena/services/message-templates.service';
import { APP_CONFIG_LINKS } from '@/lib/config/app-urls';
import type { AccessCodeResult } from '@/features/user/onboarding/services/access-code.service';
import UnitJoinSuccessBanner from '@/components/ui/UnitJoinSuccessBanner';
import type { CommunityGroup, CommunityGroupType } from '@/types/community.types';
import type { CreateGroupInput } from '@/features/arena/services/group.service';

// ─── Step types ───────────────────────────────────────────────────────────────

type Step = 'type' | 'info' | 'schedule' | 'invite' | 'outreach' | 'code_entry';

interface WizardState {
  groupType: CommunityGroupType | null;
  scopeId: string;
  authorityId: string;
  name: string;
  description: string;
  category: CommunityGroup['category'];
  isPublic: boolean;
  dayOfWeek: number;
  time: string;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  meetingAddress: string;
}

const INITIAL_STATE: WizardState = {
  groupType: null,
  scopeId: '',
  authorityId: '',
  name: '',
  description: '',
  category: 'running',
  isPublic: true,
  dayOfWeek: 6,
  time: '07:00',
  frequency: 'weekly',
  meetingAddress: '',
};



const CATEGORY_OPTIONS = [
  { value: 'running', labelKey: 'arenaCreate.category.running' },
  { value: 'walking', labelKey: 'arenaCreate.category.walking' },
  { value: 'calisthenics', labelKey: 'arenaCreate.category.calisthenics' },
  { value: 'yoga', labelKey: 'arenaCreate.category.yoga' },
  { value: 'cycling', labelKey: 'arenaCreate.category.cycling' },
  { value: 'other', labelKey: 'arenaCreate.category.other' },
] as const satisfies ReadonlyArray<{ value: CommunityGroup['category']; labelKey: string }>;

// ─── Main component ───────────────────────────────────────────────────────────

export default function CreateGroupPage() {
  const t = useT(community);
  const tc = useT(common);
  const router = useRouter();
  const { profile } = useUserStore();
  const isSuperAdmin = !!(profile?.core as any)?.isSuperAdmin;
  const { flags: featureFlags, loading: flagsLoading } = useFeatureFlags(isSuperAdmin);
  const access = useArenaAccess();

  // Route guard — the whole wizard creates league-type groups only.
  useEffect(() => {
    if (!flagsLoading && !featureFlags.enableLeagues) {
      router.replace('/home');
    }
  }, [flagsLoading, featureFlags.enableLeagues, router]);

  const [step, setStep] = useState<Step>('type');
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [isSaving, setIsSaving] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outreachSent, setOutreachSent] = useState(false);
  // 07.09.2026 — was a pre-formatted string built from result.unitId (a raw
  // Firestore doc id, e.g. "co_9307_nhcj_mh7v7n" for a hash-based unit —
  // not a display name). Holding the full result fixes that (unitPath has
  // the real name) and lets the shared UnitJoinSuccessBanner add the icon.
  const [codeSuccessResult, setCodeSuccessResult] = useState<AccessCodeResult | null>(null);
  const [createdGroupId, setCreatedGroupId] = useState<string | null>(null);
  // Invite code returned by createGroup — used to build the canonical
  // /join/<inviteCode> deep link (the old /join-group?id= route never existed).
  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(null);
  // Dynamic WhatsApp text for "אין לך קוד?" — loaded from pressure_messages
  const [dynamicNoCodeMessage, setDynamicNoCodeMessage] = useState<string | null>(null);

  const myUid = profile?.id ?? '';
  const myName = profile?.core?.name ?? 'אווטיר'; // i18n-allow-hebrew: data — saved as the group creator's name
  const myGender = profile?.core?.gender;

  // Load dynamic "אין לך קוד?" WhatsApp text from pressure_messages
  useEffect(() => {
    if (step !== 'code_entry') return;
    const gender = (myGender === 'male' || myGender === 'female' || myGender === 'other')
      ? myGender : 'male';
    let cancelled = false;
    pickTemplate('access_code_request', gender)
      .then((text) => { if (!cancelled && text) setDynamicNoCodeMessage(text); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [step, state.groupType, myGender]);

  /** Dynamic page title based on selected group type and user gender */
  const pageTitle = useMemo(() => {
    if (state.groupType === 'friends')    return t('arenaCreate.copy.titleFriends');
    if (state.groupType === 'family')     return t('arenaCreate.copy.titleFamily');
    if (state.groupType === 'school')     return t('arenaCreate.copy.titleSchool');
    if (state.groupType === 'military')   return t('arenaCreate.copy.titleUnit');
    if (state.groupType === 'neighborhood') return t('arenaCreate.title.neighborhood');
    return t('arenaCreate.copy.titleNew');
  }, [state.groupType, t]);

  function update<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  // Outreach-only types redirect to the outreach card instead of the group wizard.
  // Neighborhood is NOT here: tapping שכונה now creates a city-scoped neighborhood
  // group (renderInfoStep). The municipal-pressure / blurred-leaderboard state for
  // unconnected cities lives inline in the /community city segment instead.
  const OUTREACH_TYPES = new Set<CommunityGroupType>(['work', 'university']);
  // Org-code types go to the code-entry step
  const CODE_ENTRY_TYPES = new Set<CommunityGroupType>(['school', 'military']);

  const TYPE_CARDS = [
    {
      type: 'neighborhood' as CommunityGroupType,
      icon: <Home className="w-6 h-6" />,
      label: t('arenaCreate.card.neighborhood.label'),
      description: t('arenaCreate.card.neighborhood.desc'),
      available: access.hasCityAccess,
      lockedMsg: t('arenaCreate.copy.gpsLocked'),
      getScopeId: () => access.cityAuthorityId ?? '',
      getAuthorityId: () => access.cityAuthorityId ?? '',
    },
    {
      type: 'friends' as CommunityGroupType,
      icon: <span className="text-2xl leading-none">👥</span>,
      label: t('arenaCreate.card.friends.label'),
      description: t('arenaCreate.card.friends.desc'),
      available: true,
      lockedMsg: '',
      getScopeId: () => '',
      getAuthorityId: () => '',
    },
    {
      type: 'family' as CommunityGroupType,
      icon: <span className="text-2xl leading-none">👨‍👩‍👧</span>,
      label: t('arenaCreate.card.family.label'),
      description: t('arenaCreate.card.family.desc'),
      available: true,
      lockedMsg: '',
      getScopeId: () => '',
      getAuthorityId: () => '',
    },
    {
      type: 'work' as CommunityGroupType,
      icon: <Building2 className="w-6 h-6" />,
      label: t('arenaCreate.card.work.label'),
      description: t('arenaCreate.card.work.desc'),
      available: true,
      lockedMsg: '',
      getScopeId: () => access.orgId ?? '',
      getAuthorityId: () => access.cityAuthorityId ?? '',
    },
    {
      type: 'university' as CommunityGroupType,
      icon: <GraduationCap className="w-6 h-6" />,
      label: t('arenaCreate.card.university.label'),
      description: t('arenaCreate.card.university.desc'),
      available: true,
      lockedMsg: '',
      getScopeId: () => access.orgId ?? '',
      getAuthorityId: () => access.cityAuthorityId ?? '',
    },
    {
      type: 'park' as CommunityGroupType,
      icon: <Trees className="w-6 h-6" />,
      label: t('arenaCreate.card.park.label'),
      description: t('arenaCreate.card.park.desc'),
      available: true,
      lockedMsg: '',
      getScopeId: () => access.preferredParkId ?? '',
      getAuthorityId: () => access.cityAuthorityId ?? '',
    },
    {
      type: 'school' as CommunityGroupType,
      icon: <School className="w-6 h-6" />,
      label: t('arenaCreate.card.school.label'),
      description: t('arenaCreate.copy.schoolCardDesc'),
      available: true,
      lockedMsg: '',
      getScopeId: () => '',
      getAuthorityId: () => '',
    },
    {
      type: 'military' as CommunityGroupType,
      icon: <Shield className="w-6 h-6" />,
      label: t('arenaCreate.card.military.label'),
      description: t('arenaCreate.copy.unitCardDesc'),
      available: true,
      lockedMsg: '',
      getScopeId: () => '',
      getAuthorityId: () => '',
    },
  ];

  // ── Step: Type Selection ─────────────────────────────────────────────────

  function renderTypeStep() {
    return (
      <div className="space-y-3" dir="rtl">
        <p className="text-sm text-gray-500 px-1">{t('arenaCreate.copy.pickType')}</p>
        {TYPE_CARDS.map((card) => (
          <button
            key={card.type}
            disabled={!card.available}
            onClick={() => {
              update('groupType', card.type);
              update('scopeId', card.getScopeId());
              update('authorityId', card.getAuthorityId());
              // Social groups are always private
              if (card.type === 'friends' || card.type === 'family') {
                update('isPublic', false);
              }
              if (OUTREACH_TYPES.has(card.type)) {
                setStep('outreach');
              } else if (CODE_ENTRY_TYPES.has(card.type)) {
                setCodeSuccessResult(null);
                setStep('code_entry');
              } else {
                setStep('info');
              }
            }}
            className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-right ${
              card.available
                ? 'bg-white border-gray-100 hover:border-cyan-300 hover:shadow-sm active:scale-[0.98]'
                : 'bg-gray-50 border-gray-100 opacity-50 cursor-not-allowed'
            }`}
          >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${card.available ? 'bg-cyan-50 text-cyan-600' : 'bg-gray-100 text-gray-400'}`}>
              {card.available ? card.icon : <Lock className="w-5 h-5" />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-black text-gray-900">{card.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {card.available ? card.description : card.lockedMsg}
              </p>
            </div>
          </button>
        ))}
      </div>
    );
  }

  // ── Step: Basic Info ─────────────────────────────────────────────────────

  function renderInfoStep() {
    return (
      <div className="space-y-4" dir="rtl">
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">{t('arenaCreate.info.name')}</label>
          <input
            value={state.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder={t('arenaCreate.info.namePlaceholder')}
            className="w-full bg-gray-100 rounded-xl px-4 py-3 text-sm text-right outline-none focus:ring-2 focus:ring-cyan-400"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">{t('arenaCreate.info.category')}</label>
          <div className="grid grid-cols-3 gap-2">
            {CATEGORY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => update('category', opt.value)}
                className={`py-2.5 rounded-xl text-xs font-bold transition-all ${
                  state.category === opt.value
                    ? 'bg-cyan-500 text-on-brand'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t(opt.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">{t('arenaCreate.info.description')}</label>
          <textarea
            value={state.description}
            onChange={(e) => update('description', e.target.value)}
            placeholder={t('arenaCreate.copy.descriptionPlaceholder')}
            rows={3}
            className="w-full bg-gray-100 rounded-xl px-4 py-3 text-sm text-right outline-none focus:ring-2 focus:ring-cyan-400 resize-none"
          />
        </div>

        {/* Social groups are always private — show a badge instead of a toggle */}
        {(state.groupType === 'friends' || state.groupType === 'family') ? (
          <div className="flex items-center gap-2 bg-cyan-50 rounded-xl px-4 py-3 border border-cyan-100">
            <Lock className="w-4 h-4 text-cyan-500 flex-shrink-0" />
            <p className="text-sm font-bold text-cyan-700">{t('arenaCreate.info.privateBadge')}</p>
          </div>
        ) : (
          <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
            <div>
              <p className="text-sm font-bold text-gray-900">{t('arenaCreate.info.public')}</p>
              <p className="text-xs text-gray-500">{t('arenaCreate.info.publicHint')}</p>
            </div>
            <button
              onClick={() => update('isPublic', !state.isPublic)}
              className={`relative w-12 h-6 rounded-full transition-colors ${state.isPublic ? 'bg-cyan-500' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${state.isPublic ? 'right-1' : 'left-1'}`} />
            </button>
          </div>
        )}

        <button
          disabled={!state.name.trim()}
          onClick={() => setStep('schedule')}
          className="w-full py-3.5 rounded-2xl bg-brand-cta hover:brightness-105 text-on-brand font-black text-sm disabled:opacity-40 transition-opacity"
        >
          {t('arenaCreate.info.next')}
        </button>
      </div>
    );
  }

  // ── Step: Schedule & Location ────────────────────────────────────────────

  function renderScheduleStep() {
    return (
      <div className="space-y-4" dir="rtl">
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">{t('arenaCreate.schedule.day')}</label>
          <div className="grid grid-cols-4 gap-2">
            {weekdayLabels('long', tc).map((day, i) => (
              <button
                key={i}
                onClick={() => update('dayOfWeek', i)}
                className={`py-2.5 rounded-xl text-xs font-bold transition-all ${
                  state.dayOfWeek === i
                    ? 'bg-cyan-500 text-on-brand'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {day}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">{t('arenaCreate.schedule.time')}</label>
          <input
            type="time"
            value={state.time}
            onChange={(e) => update('time', e.target.value)}
            className="w-full bg-gray-100 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-cyan-400"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">{t('arenaCreate.schedule.frequency')}</label>
          <div className="grid grid-cols-3 gap-2">
            {([['weekly', 'arenaCreate.schedule.weekly'], ['biweekly', 'arenaCreate.schedule.biweekly'], ['monthly', 'arenaCreate.schedule.monthly']] as const).map(
              ([val, labelKey]) => (
                <button
                  key={val}
                  onClick={() => update('frequency', val)}
                  className={`py-2.5 rounded-xl text-xs font-bold transition-all ${
                    state.frequency === val
                      ? 'bg-cyan-500 text-on-brand'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {t(labelKey)}
                </button>
              ),
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">{t('arenaCreate.schedule.location')}</label>
          <input
            value={state.meetingAddress}
            onChange={(e) => update('meetingAddress', e.target.value)}
            placeholder={t('arenaCreate.schedule.locationPlaceholder')}
            className="w-full bg-gray-100 rounded-xl px-4 py-3 text-sm text-right outline-none focus:ring-2 focus:ring-cyan-400"
          />
        </div>

        <button
          onClick={() => setStep('invite')}
          className="w-full py-3.5 rounded-2xl bg-brand-cta hover:brightness-105 text-on-brand font-black text-sm"
        >
          {t('arenaCreate.schedule.next')}
        </button>
      </div>
    );
  }

  // ── Shared helpers for invite step ──────────────────────────────────────

  // Canonical group deep link — lands on the web /join/<inviteCode> page which
  // captures the pending group + invite code, then forwards into the app.
  function buildInviteLink(inviteCode: string) {
    return `${APP_CONFIG_LINKS.WEB_BASE_URL}/join/${inviteCode}`;
  }

  function buildShareMessage(inviteCode: string) {
    return t('arenaCreate.share.message', { name: state.name, link: buildInviteLink(inviteCode) });
  }

  function openWhatsAppFallback(msg: string) {
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  }

  async function ensureGroupCreated(): Promise<{ groupId: string; inviteCode: string } | null> {
    if (createdGroupId && createdInviteCode) {
      return { groupId: createdGroupId, inviteCode: createdInviteCode };
    }
    if (!myUid || !state.groupType) return null;

    setIsSaving(true);
    setError(null);
    try {
      const isSocial = state.groupType === 'friends' || state.groupType === 'family';
      const input: CreateGroupInput = {
        name: state.name,
        description: state.description,
        category: state.category,
        groupType: state.groupType,
        scopeId: isSocial ? null : state.scopeId,
        ...((!isSocial && state.authorityId) ? { authorityId: state.authorityId } : {}),
        isPublic: isSocial ? false : state.isPublic,
        ageRestriction: 'all',
        source: 'user',
        schedule: {
          dayOfWeek: state.dayOfWeek,
          time: state.time,
          frequency: state.frequency,
        },
        meetingLocation: state.meetingAddress
          ? { address: state.meetingAddress }
          : undefined,
      };
      const { groupId: id, inviteCode } = await createGroup(myUid, myName, input);
      setCreatedGroupId(id);
      setCreatedInviteCode(inviteCode);
      return { groupId: id, inviteCode };
    } catch (err) {
      console.error('[CreateGroup]', err);
      setError(t('arenaCreate.copy.createError'));
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  // ── Step: Viral Invite Gate ──────────────────────────────────────────────

  function renderInviteStep() {
    async function handleShareAndCreate() {
      if (isSharing || isSaving) return;
      setIsSharing(true);
      setError(null);

      try {
        const created = await ensureGroupCreated();
        if (!created) { setIsSharing(false); return; }

        const msg = buildShareMessage(created.inviteCode);

        if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
          try {
            await navigator.share({ title: t('arenaCreate.share.title', { name: state.name }), text: msg });
          } catch (shareErr: unknown) {
            const errName = (shareErr as { name?: string })?.name;
            if (errName !== 'AbortError') {
              openWhatsAppFallback(msg);
            }
          }
        } else {
          openWhatsAppFallback(msg);
        }

        router.push('/community?tab=leagues');
      } catch (err) {
        console.error('[ShareGroup]', err);
        setError(t('arenaCreate.copy.genericError'));
      } finally {
        setIsSharing(false);
      }
    }

    async function handleWhatsAppDirect() {
      if (isSharing || isSaving) return;
      setIsSharing(true);
      setError(null);

      try {
        const created = await ensureGroupCreated();
        if (!created) { setIsSharing(false); return; }

        openWhatsAppFallback(buildShareMessage(created.inviteCode));
        router.push('/community?tab=leagues');
      } catch (err) {
        console.error('[WhatsAppDirect]', err);
        setError(t('arenaCreate.copy.genericError'));
      } finally {
        setIsSharing(false);
      }
    }

    async function handleSkip() {
      if (isSaving) return;
      const created = await ensureGroupCreated();
      if (created) router.push('/community?tab=leagues');
    }

    const busy = isSaving || isSharing;

    return (
      <div className="space-y-5 text-center" dir="rtl">
        <div className="bg-gradient-to-b from-cyan-50 to-white rounded-3xl p-5 border border-cyan-100">
          <div
            className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center"
            style={{ boxShadow: '0 0 24px 6px rgba(0,186,247,0.25)' }}
          >
            <Share2 className="w-8 h-8 text-cyan-500" />
          </div>
          <h3 className="text-base font-black text-gray-900">{t('arenaCreate.copy.inviteOne')}</h3>
          <p className="text-xs text-gray-500 mt-1 max-w-[240px] mx-auto">
            {t('arenaCreate.invite.explainer')}
          </p>
        </div>

        {/* Primary: native share (falls back to WhatsApp automatically) */}
        <button
          onClick={handleShareAndCreate}
          disabled={busy}
          className="w-full py-4 rounded-2xl font-black text-white text-sm disabled:opacity-60 active:scale-[0.98] transition-all"
          style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)' }}
        >
          {busy ? t('arenaCreate.invite.creatingAndSending') : `🟢 ${t('arenaCreate.copy.shareAndOpen')}`}
        </button>

        {/* Fallback: guaranteed WhatsApp redirect */}
        <button
          onClick={handleWhatsAppDirect}
          disabled={busy}
          className="w-full py-3.5 rounded-2xl bg-white border border-green-200 text-green-700 font-bold text-sm disabled:opacity-40 active:scale-[0.98] transition-all"
        >
          📲 {t('arenaCreate.copy.openWhatsapp')}
        </button>

        {/* Skip: create without sharing */}
        <button
          onClick={handleSkip}
          disabled={busy}
          className="w-full py-3.5 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm disabled:opacity-40"
        >
          {isSaving ? t('arenaCreate.invite.creating') : t('arenaCreate.invite.skipPrivate')}
        </button>

        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  // ── Step: Org Code Entry (School / Military) ────────────────────────────

  function renderCodeEntryStep() {
    const isMilitary = state.groupType === 'military';
    const icon = isMilitary ? '🛡️' : '🏫';
    const title = isMilitary
      ? t('arenaCreate.copy.joinYourUnit')
      : t('arenaCreate.copy.joinYourSchool');
    const orgName = isMilitary ? t('arenaCreate.code.orgUnit') : t('arenaCreate.code.orgSchool');

    // Gender-aware fallback text; overridden by Firestore template when available
    // First person (the user speaks): "אשמח" is the same for everyone — the old female
    // branch "אשמחי" was not a Hebrew word.
    const fallbackNoCode = isMilitary
      ? t('arenaCreate.code.noCodeUnit')
      : t('arenaCreate.code.noCodeSchool');
    const noCodeWhatsapp = dynamicNoCodeMessage || fallbackNoCode;

    // How-it-works steps, gender-aware
    const howItWorks = isMilitary
      ? [
          t('arenaCreate.copy.getCodeUnit'),
          t('arenaCreate.copy.enterCode'),
          t('arenaCreate.copy.autoJoinUnit'),
        ]
      : [
          t('arenaCreate.copy.getCodeSchool'),
          t('arenaCreate.copy.enterCode'),
          t('arenaCreate.copy.autoJoinSchool'),
        ];

    function handleCodeSuccess(result: AccessCodeResult) {
      setCodeSuccessResult(result);
      setTimeout(() => router.push('/community?tab=leagues'), 1800);
    }

    function handleBack() {
      update('groupType', null);
      setCodeSuccessResult(null);
      setDynamicNoCodeMessage(null);
      setStep('type');
    }

    // Success overlay
    if (codeSuccessResult) {
      return (
        <div className="space-y-5 text-center py-8" dir="rtl">
          <div className="text-5xl mb-2">{icon}</div>
          <h3 className="text-xl font-black text-gray-900 mb-3">{t('arenaCreate.copy.welcomeToLeague')}</h3>
          <div className="flex justify-center">
            <UnitJoinSuccessBanner result={codeSuccessResult} />
          </div>
          <p className="text-sm text-gray-500">{t('arenaCreate.code.redirecting')}</p>
        </div>
      );
    }

    return (
      <div className="space-y-5" dir="rtl">
        {/* Explanation card */}
        <div className="bg-gradient-to-b from-indigo-50 to-white rounded-3xl p-5 border border-indigo-200/60">
          <div className="text-3xl text-center mb-2">{icon}</div>
          <h3 className="text-sm font-black text-gray-900 text-center mb-3">
            {isMilitary ? t('arenaCreate.code.howUnit') : t('arenaCreate.code.howSchool')}
          </h3>
          <div className="bg-white rounded-2xl p-3 border border-gray-100">
            <ol className="text-xs text-gray-700 space-y-2 list-decimal pr-4">
              {howItWorks.map((step, i) => (
                <li key={i} className={i === howItWorks.length - 1 ? 'font-bold text-indigo-600' : ''}>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Code entry gate */}
        <AccessCodeGate
          orgName={orgName}
          groupType={state.groupType}
          onSuccess={handleCodeSuccess}
          onSkip={handleBack}
        />

        {/* "אין לך קוד?" outreach section */}
        <div className="border-t border-gray-100 pt-4 space-y-3">
          <p className="text-xs text-gray-500 text-center font-bold">{t('arenaCreate.code.noCode')}</p>
          <button
            onClick={() =>
              window.open(
                `https://wa.me/?text=${encodeURIComponent(noCodeWhatsapp)}`,
                '_blank',
              )
            }
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-green-50 text-green-700 font-bold text-sm border border-green-100 active:scale-[0.98] transition-all"
          >
            {t('arenaCreate.code.sendToContact', { kind: isMilitary ? 'military' : 'school' })}
          </button>
        </div>

        {/* Back */}
        <button
          onClick={handleBack}
          className="w-full py-3 rounded-2xl bg-gray-100 text-gray-600 font-bold text-sm"
        >
          {t('arenaCreate.backToType')}
        </button>
      </div>
    );
  }

  // ── Step: B2B/B2E Outreach (Work / University) ─────────────────────────────

  function renderOutreachStep() {
    // ── Work / University ────────────────────────────────────────────────────
    const isWork = state.groupType === 'work';
    const kind = isWork ? 'work' : 'university';
    const icon = isWork ? '🏢' : '🎓';

    const shareText = t('arenaCreate.outreach.shareText', { kind });

    function handleShare() {
      window.open(
        `https://wa.me/?text=${encodeURIComponent(shareText)}`,
        '_blank',
      );
      setOutreachSent(true);
    }

    return (
      <div className="space-y-5 text-center" dir="rtl">
        <div className="bg-gradient-to-b from-amber-50 to-white rounded-3xl p-6 border border-amber-200/60">
          <div className="text-4xl mb-3">{icon}</div>
          <h3 className="text-base font-black text-gray-900">
            {t('arenaCreate.outreach.title', { kind })}
          </h3>
          <p className="text-xs text-gray-600 mt-2 leading-relaxed max-w-[280px] mx-auto">
            {t('arenaCreate.outreach.body', { kind })}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-right">
          <div className="flex items-start gap-3">
            <Megaphone className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-gray-900">
                {t('arenaCreate.outreach.how')}
              </p>
              <ol className="text-xs text-gray-600 mt-1.5 space-y-1 list-decimal pr-4">
                <li>{t('arenaCreate.outreach.step1', { kind })}</li>
                <li>{t('arenaCreate.outreach.step2')}</li>
                <li>{t('arenaCreate.outreach.step3', { kind })}</li>
              </ol>
            </div>
          </div>
        </div>

        <button
          onClick={handleShare}
          disabled={outreachSent}
          className={`w-full py-4 rounded-2xl font-black text-sm shadow-md active:scale-[0.98] transition-all ${
            outreachSent
              ? 'bg-green-500 text-white'
              : 'bg-gradient-to-l from-amber-500 to-orange-500 text-white'
          }`}
        >
          {outreachSent ? (
            <span className="flex items-center justify-center gap-2">
              <Check className="w-4 h-4" />{' '}{t('arenaCreate.outreach.sent', { icon })}
            </span>
          ) : (
            t('arenaCreate.outreach.send', { kind })
          )}
        </button>

        <button
          onClick={() => {
            update('groupType', null);
            setOutreachSent(false);
            setStep('type');
          }}
          className="w-full py-3 rounded-2xl bg-gray-100 text-gray-600 font-bold text-sm"
        >
          {t('arenaCreate.backToType')}
        </button>
      </div>
    );
  }

  // ─── Step label map ─────────────────────────────────────────────────────────

  const STEP_LABELS: Record<Step, string> = {
    type: t('arenaCreate.step.type'),
    info: t('arenaCreate.step.info'),
    schedule: t('arenaCreate.step.schedule'),
    invite: t('arenaCreate.step.invite'),
    outreach: t('arenaCreate.step.outreach'),
    code_entry: t('arenaCreate.step.codeEntry'),
  };

  const STEPS: Step[] = ['type', 'info', 'schedule', 'invite'];
  const currentIdx = STEPS.indexOf(step);

  if (flagsLoading || !featureFlags.enableLeagues) return null;

  return (
    <div
      className="min-h-[100dvh] bg-[#F8FAFC]"
      style={{ paddingBottom: '5rem' }}
    >
      {/* Header — pad below status bar so the back button isn't covered. */}
      <header
        className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="max-w-md mx-auto px-5 py-1.5 flex items-center justify-between" dir="rtl">
          <button
            onClick={() => {
              if (step === 'type') {
                router.push('/community?tab=leagues');
              } else if (step === 'outreach') {
                setStep('type');
                setOutreachSent(false);
              } else if (step === 'code_entry') {
                update('groupType', null);
                setCodeSuccessResult(null);
                setStep('type');
              } else {
                const prev = STEPS[currentIdx - 1];
                setStep(prev);
              }
            }}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
          >
            <ArrowRight className="w-4 h-4 text-gray-600" />
          </button>
          <h1 className="text-base font-black text-gray-900">{pageTitle}</h1>
          <div className="w-8" />
        </div>

        {/* Progress bar */}
        <div className="max-w-md mx-auto px-5 pb-3">
          <div className="flex gap-1.5">
            {STEPS.map((s, i) => (
              <div
                key={s}
                className={`flex-1 h-1.5 rounded-full transition-all duration-300 ${
                  i <= currentIdx ? 'bg-cyan-500' : 'bg-gray-100'
                }`}
              />
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5 text-right">{STEP_LABELS[step]}</p>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-md mx-auto px-4 pt-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.2 }}
          >
            {step === 'type' && renderTypeStep()}
            {step === 'outreach' && renderOutreachStep()}
            {step === 'code_entry' && renderCodeEntryStep()}
            {step === 'info' && renderInfoStep()}
            {step === 'schedule' && renderScheduleStep()}
            {step === 'invite' && renderInviteStep()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
