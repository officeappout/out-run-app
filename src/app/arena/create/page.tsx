'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ArrowRight, Home, Building2, GraduationCap, Trees, Share2, Lock, Check, Megaphone, Shield, School } from 'lucide-react';
import { useUserStore } from '@/features/user';
import { useArenaAccess } from '@/features/arena/hooks/useArenaAccess';
import { createGroup } from '@/features/arena/services/group.service';
import AccessCodeGate from '@/components/ui/AccessCodeGate';
import MunicipalPressureCard from '@/features/arena/components/MunicipalPressureCard';
import { getAuthority } from '@/features/admin/services/authority.service';
import { pickTemplate } from '@/features/arena/services/message-templates.service';
import type { AccessCodeResult } from '@/features/user/onboarding/services/access-code.service';
import type { CommunityGroup, CommunityGroupType } from '@/types/community.types';
import type { CreateGroupInput } from '@/features/arena/services/group.service';
import type { Authority } from '@/types/admin-types';

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

/** Gender-aware text helper. Returns the female form when gender === 'female', male form otherwise. */
function t(male: string, female: string, gender?: string | null): string {
  return gender === 'female' ? female : male;
}

const CATEGORY_OPTIONS: Array<{ value: CommunityGroup['category']; label: string }> = [
  { value: 'running', label: 'ריצה' },
  { value: 'walking', label: 'הליכה' },
  { value: 'calisthenics', label: 'כושר פונקציונלי' },
  { value: 'yoga', label: 'יוגה' },
  { value: 'cycling', label: 'אופניים' },
  { value: 'other', label: 'אחר' },
];

const DAYS_HEB = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

// ─── Main component ───────────────────────────────────────────────────────────

export default function CreateGroupPage() {
  const router = useRouter();
  const { profile } = useUserStore();
  const access = useArenaAccess();

  const [step, setStep] = useState<Step>('type');
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [isSaving, setIsSaving] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outreachSent, setOutreachSent] = useState(false);
  const [codeSuccessMsg, setCodeSuccessMsg] = useState<string | null>(null);
  const [createdGroupId, setCreatedGroupId] = useState<string | null>(null);
  // Authority doc for the neighborhood outreach card
  const [neighborhoodAuthority, setNeighborhoodAuthority] = useState<Authority | null>(null);
  // Dynamic WhatsApp text for "אין לך קוד?" — loaded from pressure_messages
  const [dynamicNoCodeMessage, setDynamicNoCodeMessage] = useState<string | null>(null);

  const myUid = profile?.id ?? '';
  const myName = profile?.core?.name ?? 'אווטיר';
  const myGender = profile?.core?.gender;

  // Fetch city authority doc when user lands on neighborhood outreach step
  useEffect(() => {
    if (step !== 'outreach' || state.groupType !== 'neighborhood') return;
    if (!access.cityAuthorityId) return;
    let cancelled = false;
    getAuthority(access.cityAuthorityId).then((auth) => {
      if (!cancelled) setNeighborhoodAuthority(auth);
    });
    return () => { cancelled = true; };
  }, [step, state.groupType, access.cityAuthorityId]);

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
    if (state.groupType === 'friends')    return t('צור ליגת חברים', 'צורי ליגת חברות', myGender);
    if (state.groupType === 'family')     return t('צור ליגת משפחה', 'צורי ליגת משפחה', myGender);
    if (state.groupType === 'school')     return t('הצטרף לבית ספר', 'הצטרפי לבית ספר', myGender);
    if (state.groupType === 'military')   return t('הצטרף ליחידה', 'הצטרפי ליחידה', myGender);
    if (state.groupType === 'neighborhood') return t('ליגת שכונה', 'ליגת שכונה', myGender);
    return t('צור ליגה חדשה', 'צורי ליגה חדשה', myGender);
  }, [state.groupType, myGender]);

  function update<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  // Outreach-only types redirect to the outreach card instead of the group wizard
  const OUTREACH_TYPES = new Set<CommunityGroupType>(['work', 'university', 'neighborhood']);
  // Org-code types go to the code-entry step
  const CODE_ENTRY_TYPES = new Set<CommunityGroupType>(['school', 'military']);

  const TYPE_CARDS = [
    {
      type: 'neighborhood' as CommunityGroupType,
      icon: <Home className="w-6 h-6" />,
      label: 'שכונה',
      description: 'קבוצה פתוחה לכל מתאמני העיר',
      available: access.hasCityAccess,
      lockedMsg: 'חבר GPS כדי להצטרף לעיר',
      getScopeId: () => access.cityAuthorityId ?? '',
      getAuthorityId: () => access.cityAuthorityId ?? '',
    },
    {
      type: 'friends' as CommunityGroupType,
      icon: <span className="text-2xl leading-none">👥</span>,
      label: 'חברים',
      description: 'ליגה לחברים פרטית',
      available: true,
      lockedMsg: '',
      getScopeId: () => '',
      getAuthorityId: () => '',
    },
    {
      type: 'family' as CommunityGroupType,
      icon: <span className="text-2xl leading-none">👨‍👩‍👧</span>,
      label: 'משפחה',
      description: 'ליגה משפחתית פרטית',
      available: true,
      lockedMsg: '',
      getScopeId: () => '',
      getAuthorityId: () => '',
    },
    {
      type: 'work' as CommunityGroupType,
      icon: <Building2 className="w-6 h-6" />,
      label: 'עבודה',
      description: 'הביאו את Out למקום העבודה!',
      available: true,
      lockedMsg: '',
      getScopeId: () => access.orgId ?? '',
      getAuthorityId: () => access.cityAuthorityId ?? '',
    },
    {
      type: 'university' as CommunityGroupType,
      icon: <GraduationCap className="w-6 h-6" />,
      label: 'אוני׳ / קמפוס',
      description: 'הביאו את Out לקמפוס!',
      available: true,
      lockedMsg: '',
      getScopeId: () => access.orgId ?? '',
      getAuthorityId: () => access.cityAuthorityId ?? '',
    },
    {
      type: 'park' as CommunityGroupType,
      icon: <Trees className="w-6 h-6" />,
      label: 'פארק',
      description: 'קבוצה אזורית לפארק ספציפי',
      available: true,
      lockedMsg: '',
      getScopeId: () => access.preferredParkId ?? '',
      getAuthorityId: () => access.cityAuthorityId ?? '',
    },
    {
      type: 'school' as CommunityGroupType,
      icon: <School className="w-6 h-6" />,
      label: 'בית ספר 🏫',
      description: 'הצטרף לליגת בית הספר שלך',
      available: true,
      lockedMsg: '',
      getScopeId: () => '',
      getAuthorityId: () => '',
    },
    {
      type: 'military' as CommunityGroupType,
      icon: <Shield className="w-6 h-6" />,
      label: 'צבא / יחידה 🛡️',
      description: 'הצטרף לליגת היחידה שלך',
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
        <p className="text-sm text-gray-500 px-1">בחר את סוג הקבוצה</p>
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
                setCodeSuccessMsg(null);
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
          <label className="block text-xs font-bold text-gray-700 mb-1.5">שם הקבוצה</label>
          <input
            value={state.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="למשל: ריצת בוקר הרצליה"
            className="w-full bg-gray-100 rounded-xl px-4 py-3 text-sm text-right outline-none focus:ring-2 focus:ring-cyan-400"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">קטגוריה</label>
          <div className="grid grid-cols-3 gap-2">
            {CATEGORY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => update('category', opt.value)}
                className={`py-2.5 rounded-xl text-xs font-bold transition-all ${
                  state.category === opt.value
                    ? 'bg-cyan-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">תיאור קצר</label>
          <textarea
            value={state.description}
            onChange={(e) => update('description', e.target.value)}
            placeholder="ספר בקצרה על הקבוצה..."
            rows={3}
            className="w-full bg-gray-100 rounded-xl px-4 py-3 text-sm text-right outline-none focus:ring-2 focus:ring-cyan-400 resize-none"
          />
        </div>

        {/* Social groups are always private — show a badge instead of a toggle */}
        {(state.groupType === 'friends' || state.groupType === 'family') ? (
          <div className="flex items-center gap-2 bg-cyan-50 rounded-xl px-4 py-3 border border-cyan-100">
            <Lock className="w-4 h-4 text-cyan-500 flex-shrink-0" />
            <p className="text-sm font-bold text-cyan-700">קבוצה פרטית — הצטרפות בקוד הזמנה בלבד</p>
          </div>
        ) : (
          <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
            <div>
              <p className="text-sm font-bold text-gray-900">קבוצה פתוחה לכולם</p>
              <p className="text-xs text-gray-500">מופיעה בתגלית הציבורית</p>
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
          className="w-full py-3.5 rounded-2xl bg-cyan-500 text-white font-black text-sm disabled:opacity-40 transition-opacity"
        >
          הבא — לוח זמנים
        </button>
      </div>
    );
  }

  // ── Step: Schedule & Location ────────────────────────────────────────────

  function renderScheduleStep() {
    return (
      <div className="space-y-4" dir="rtl">
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">יום בשבוע</label>
          <div className="grid grid-cols-4 gap-2">
            {DAYS_HEB.map((day, i) => (
              <button
                key={i}
                onClick={() => update('dayOfWeek', i)}
                className={`py-2.5 rounded-xl text-xs font-bold transition-all ${
                  state.dayOfWeek === i
                    ? 'bg-cyan-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {day}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">שעת התחלה</label>
          <input
            type="time"
            value={state.time}
            onChange={(e) => update('time', e.target.value)}
            className="w-full bg-gray-100 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-cyan-400"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">תדירות</label>
          <div className="grid grid-cols-3 gap-2">
            {([['weekly', 'שבועי'], ['biweekly', 'דו-שבועי'], ['monthly', 'חודשי']] as const).map(
              ([val, label]) => (
                <button
                  key={val}
                  onClick={() => update('frequency', val)}
                  className={`py-2.5 rounded-xl text-xs font-bold transition-all ${
                    state.frequency === val
                      ? 'bg-cyan-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ),
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">מיקום (אופציונלי)</label>
          <input
            value={state.meetingAddress}
            onChange={(e) => update('meetingAddress', e.target.value)}
            placeholder="כתובת נקודת מפגש..."
            className="w-full bg-gray-100 rounded-xl px-4 py-3 text-sm text-right outline-none focus:ring-2 focus:ring-cyan-400"
          />
        </div>

        <button
          onClick={() => setStep('invite')}
          className="w-full py-3.5 rounded-2xl bg-cyan-500 text-white font-black text-sm"
        >
          הבא — הזמן שותפים
        </button>
      </div>
    );
  }

  // ── Shared helpers for invite step ──────────────────────────────────────

  function buildInviteLink(groupId: string) {
    return `https://appout.co.il/join-group?id=${groupId}`;
  }

  function buildShareMessage(groupId: string) {
    return `הצטרפו לקבוצה שלי ב-Out! ${state.name}\n${buildInviteLink(groupId)}`;
  }

  function openWhatsAppFallback(msg: string) {
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  }

  async function ensureGroupCreated(): Promise<string | null> {
    if (createdGroupId) return createdGroupId;
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
        schedule: {
          dayOfWeek: state.dayOfWeek,
          time: state.time,
          frequency: state.frequency,
        },
        meetingLocation: state.meetingAddress
          ? { address: state.meetingAddress }
          : undefined,
      };
      const { groupId: id } = await createGroup(myUid, myName, input);
      setCreatedGroupId(id);
      return id;
    } catch (err) {
      console.error('[CreateGroup]', err);
      setError('אירעה שגיאה ביצירת הקבוצה. נסה שוב.');
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
        const groupId = await ensureGroupCreated();
        if (!groupId) { setIsSharing(false); return; }

        const msg = buildShareMessage(groupId);

        if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
          try {
            await navigator.share({ title: `הצטרפו ל${state.name}`, text: msg });
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
        setError('אירעה שגיאה. נסה שוב.');
      } finally {
        setIsSharing(false);
      }
    }

    async function handleWhatsAppDirect() {
      if (isSharing || isSaving) return;
      setIsSharing(true);
      setError(null);

      try {
        const groupId = await ensureGroupCreated();
        if (!groupId) { setIsSharing(false); return; }

        openWhatsAppFallback(buildShareMessage(groupId));
        router.push('/community?tab=leagues');
      } catch (err) {
        console.error('[WhatsAppDirect]', err);
        setError('אירעה שגיאה. נסה שוב.');
      } finally {
        setIsSharing(false);
      }
    }

    async function handleSkip() {
      if (isSaving) return;
      const groupId = await ensureGroupCreated();
      if (groupId) router.push('/community?tab=leagues');
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
          <h3 className="text-base font-black text-gray-900">הזמן לפחות שותף אחד</h3>
          <p className="text-xs text-gray-500 mt-1 max-w-[240px] mx-auto">
            קבוצה נפתחת לאחר שמצטרף שותף ראשון — כך בונים נבחרת אמיתית
          </p>
        </div>

        {/* Primary: native share (falls back to WhatsApp automatically) */}
        <button
          onClick={handleShareAndCreate}
          disabled={busy}
          className="w-full py-4 rounded-2xl font-black text-white text-sm disabled:opacity-60 active:scale-[0.98] transition-all"
          style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)' }}
        >
          {busy ? 'יוצר ושולח...' : `🟢 ${t('שתף', 'שתפי', myGender)} ופתח/י קבוצה`}
        </button>

        {/* Fallback: guaranteed WhatsApp redirect */}
        <button
          onClick={handleWhatsAppDirect}
          disabled={busy}
          className="w-full py-3.5 rounded-2xl bg-white border border-green-200 text-green-700 font-bold text-sm disabled:opacity-40 active:scale-[0.98] transition-all"
        >
          📲 {t('פתח', 'פתחי', myGender)} בוואטסאפ
        </button>

        {/* Skip: create without sharing */}
        <button
          onClick={handleSkip}
          disabled={busy}
          className="w-full py-3.5 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm disabled:opacity-40"
        >
          {isSaving ? 'יוצר קבוצה...' : `${t('דלג', 'דלגי', myGender)} — קבוצה פרטית`}
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
      ? t('הצטרף ליחידה שלך', 'הצטרפי ליחידה שלך', myGender)
      : t('הצטרף לבית הספר שלך', 'הצטרפי לבית הספר שלך', myGender);
    const orgName = isMilitary ? 'ליגת OUT של היחידה' : 'ליגת OUT של בית הספר';
    const contactLabel = isMilitary ? 'מפקד כושר' : 'מורה לחנ"ג';

    // Gender-aware fallback text; overridden by Firestore template when available
    const fallbackNoCode = isMilitary
      ? t('היי, אשמח להצטרף לליגת OUT של היחידה. אפשר לקבל קוד גישה?',
          'היי, אשמחי להצטרף לליגת OUT של היחידה. אפשר לקבל קוד גישה?', myGender)
      : t('היי, אשמח להצטרף לליגת OUT של בית הספר. אפשר לקבל קוד גישה?',
          'היי, אשמחי להצטרף לליגת OUT של בית הספר. אפשר לקבל קוד גישה?', myGender);
    const noCodeWhatsapp = dynamicNoCodeMessage || fallbackNoCode;

    // How-it-works steps, gender-aware
    const howItWorks = isMilitary
      ? [
          t('קבל קוד גישה ממפקד הכושר שלך', 'קבלי קוד גישה ממפקד הכושר שלך', myGender),
          t('הזן את הקוד כאן', 'הזיני את הקוד כאן', myGender),
          t('הצטרף אוטומטית לליגת היחידה שלך!', 'הצטרפי אוטומטית לליגת היחידה שלך!', myGender),
        ]
      : [
          t('קבל קוד גישה ממורה לחנ"ג / רכזת הספורט', 'קבלי קוד גישה ממורה לחנ"ג / רכזת הספורט', myGender),
          t('הזן את הקוד כאן', 'הזיני את הקוד כאן', myGender),
          t('הצטרף אוטומטית לליגת בית הספר שלך!', 'הצטרפי אוטומטית לליגת בית הספר שלך!', myGender),
        ];

    function handleCodeSuccess(result: AccessCodeResult) {
      const unitLabel = result.unitId ?? (isMilitary ? 'היחידה' : 'בית הספר');
      setCodeSuccessMsg(`ברוך הבא לליגת ${unitLabel}! 🎉`);
      setTimeout(() => router.push('/community?tab=leagues'), 1800);
    }

    function handleBack() {
      update('groupType', null);
      setCodeSuccessMsg(null);
      setDynamicNoCodeMessage(null);
      setStep('type');
    }

    // Success overlay
    if (codeSuccessMsg) {
      return (
        <div className="space-y-5 text-center py-8" dir="rtl">
          <div className="text-5xl mb-2">{icon}</div>
          <h3 className="text-xl font-black text-gray-900">{codeSuccessMsg}</h3>
          <p className="text-sm text-gray-500">מעביר אותך לליגה...</p>
        </div>
      );
    }

    return (
      <div className="space-y-5" dir="rtl">
        {/* Explanation card */}
        <div className="bg-gradient-to-b from-indigo-50 to-white rounded-3xl p-5 border border-indigo-200/60">
          <div className="text-3xl text-center mb-2">{icon}</div>
          <h3 className="text-sm font-black text-gray-900 text-center mb-3">
            {isMilitary ? 'איך מצטרפים לליגת היחידה?' : 'איך מצטרפים לליגת בית הספר?'}
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
          <p className="text-xs text-gray-500 text-center font-bold">אין לך קוד?</p>
          <button
            onClick={() =>
              window.open(
                `https://wa.me/?text=${encodeURIComponent(noCodeWhatsapp)}`,
                '_blank',
              )
            }
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-green-50 text-green-700 font-bold text-sm border border-green-100 active:scale-[0.98] transition-all"
          >
            📲 {t('שלח', 'שלחי', myGender)} הודעה ל{contactLabel}
          </button>
        </div>

        {/* Back */}
        <button
          onClick={handleBack}
          className="w-full py-3 rounded-2xl bg-gray-100 text-gray-600 font-bold text-sm"
        >
          חזור לבחירת סוג
        </button>
      </div>
    );
  }

  // ── Step: B2B/B2E Outreach (Work / University) + Neighborhood Municipal ────

  function renderOutreachStep() {
    // ── Neighborhood: use MunicipalPressureCard ──────────────────────────────
    if (state.groupType === 'neighborhood') {
      return (
        <div className="space-y-5" dir="rtl">
          <div className="bg-gradient-to-b from-cyan-50 to-white rounded-3xl p-6 border border-cyan-200/60 text-center">
            <div className="text-4xl mb-3">🏘️</div>
            <h3 className="text-base font-black text-gray-900">רוצים ליגת שכונה רשמית?</h3>
            <p className="text-xs text-gray-600 mt-2 leading-relaxed max-w-[280px] mx-auto">
              כדי לפתוח ליגת שכונה, נצטרך לתאם עם העירייה שלך
            </p>
          </div>

          <MunicipalPressureCard
            cityName={access.cityName ?? 'העיר שלך'}
            authority={neighborhoodAuthority}
          />

          <button
            onClick={() => {
              update('groupType', null);
              setOutreachSent(false);
              setNeighborhoodAuthority(null);
              setStep('type');
            }}
            className="w-full py-3 rounded-2xl bg-gray-100 text-gray-600 font-bold text-sm"
          >
            חזור לבחירת סוג
          </button>
        </div>
      );
    }

    // ── Work / University ────────────────────────────────────────────────────
    const isWork = state.groupType === 'work';
    const label = isWork ? 'מקום העבודה' : 'הקמפוס';
    const recipientLabel = isWork ? 'HR / מנהל ישיר' : 'אגודת הסטודנטים';
    const icon = isWork ? '🏢' : '🎓';

    const shareText =
      `היי, אני מתאמן/ת עם Out ורוצה להביא את הפלטפורמה ל${label} שלנו! Out זו ליגת כושר עירונית שמחברת אנשים לאימונים חכמים בחוץ. בואו נדבר!\n\nhttps://appout.co.il/`;

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
            רוצים ליגה רשמית ל{label}?
          </h3>
          <p className="text-xs text-gray-600 mt-2 leading-relaxed max-w-[280px] mx-auto">
            כדי לפתוח קבוצת {isWork ? 'עבודה' : 'קמפוס'} רשמית, פנו ל{recipientLabel} ובקשו שישתפו פעולה עם Out!
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-right">
          <div className="flex items-start gap-3">
            <Megaphone className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-gray-900">
                איך זה עובד?
              </p>
              <ol className="text-xs text-gray-600 mt-1.5 space-y-1 list-decimal pr-4">
                <li>שלחו את ההודעה ל{recipientLabel}</li>
                <li>הם יצרו קשר עם Out</li>
                <li>הליגה הרשמית של {isWork ? 'החברה' : 'הקמפוס'} נפתחת!</li>
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
              <Check className="w-4 h-4" /> נשלח! תודה {icon}
            </span>
          ) : (
            `📩 שלח הודעה ל${recipientLabel}`
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
          חזור לבחירת סוג
        </button>
      </div>
    );
  }

  // ─── Step label map ─────────────────────────────────────────────────────────

  const STEP_LABELS: Record<Step, string> = {
    type: 'סוג קבוצה',
    info: 'פרטים בסיסיים',
    schedule: 'לו"ז ומיקום',
    invite: 'הזמן שותפים',
    outreach: 'הזמנת ארגון',
    code_entry: 'כניסה בקוד',
  };

  const STEPS: Step[] = ['type', 'info', 'schedule', 'invite'];
  const currentIdx = STEPS.indexOf(step);

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
                setNeighborhoodAuthority(null);
              } else if (step === 'code_entry') {
                update('groupType', null);
                setCodeSuccessMsg(null);
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
