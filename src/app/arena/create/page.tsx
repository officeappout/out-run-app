'use client';

export const dynamic = 'force-dynamic';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ArrowRight, Home, Building2, GraduationCap, Trees, Share2, Lock, Check, Megaphone } from 'lucide-react';
import { useUserStore } from '@/features/user';
import { useArenaAccess } from '@/features/arena/hooks/useArenaAccess';
import { createGroup } from '@/features/arena/services/group.service';
import type { CommunityGroup, CommunityGroupType } from '@/types/community.types';
import type { CreateGroupInput } from '@/features/arena/services/group.service';

// ─── Step types ───────────────────────────────────────────────────────────────

type Step = 'type' | 'info' | 'schedule' | 'invite' | 'outreach';

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
  const [createdGroupId, setCreatedGroupId] = useState<string | null>(null);

  const myUid = profile?.id ?? '';
  const myName = profile?.core?.name ?? 'אווטיר';

  function update<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  // Outreach-only types redirect to the outreach card instead of the group wizard
  const OUTREACH_TYPES = new Set<CommunityGroupType>(['work', 'university']);

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
              if (OUTREACH_TYPES.has(card.type)) {
                setStep('outreach');
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
      const input: CreateGroupInput = {
        name: state.name,
        description: state.description,
        category: state.category,
        groupType: state.groupType,
        scopeId: state.scopeId,
        authorityId: state.authorityId,
        isPublic: state.isPublic,
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
      const id = await createGroup(myUid, myName, input);
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

        router.push('/arena');
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
        router.push('/arena');
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
      if (groupId) router.push('/arena');
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
          {busy ? 'יוצר ושולח...' : '🟢 שתף ופתח קבוצה'}
        </button>

        {/* Fallback: guaranteed WhatsApp redirect */}
        <button
          onClick={handleWhatsAppDirect}
          disabled={busy}
          className="w-full py-3.5 rounded-2xl bg-white border border-green-200 text-green-700 font-bold text-sm disabled:opacity-40 active:scale-[0.98] transition-all"
        >
          📲 פתח בוואטסאפ
        </button>

        {/* Skip: create without sharing */}
        <button
          onClick={handleSkip}
          disabled={busy}
          className="w-full py-3.5 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm disabled:opacity-40"
        >
          {isSaving ? 'יוצר קבוצה...' : 'דלג — קבוצה פרטית'}
        </button>

        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  // ── Step: B2B/B2E Outreach (Work / University) ──────────────────────────

  function renderOutreachStep() {
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
  };

  const STEPS: Step[] = ['type', 'info', 'schedule', 'invite'];
  const currentIdx = STEPS.indexOf(step);

  return (
    <div
      className="min-h-[100dvh] bg-[#F8FAFC]"
      style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-md mx-auto px-5 py-3 flex items-center justify-between" dir="rtl">
          <button
            onClick={() => {
              if (step === 'type') {
                router.push('/arena');
              } else if (step === 'outreach') {
                setStep('type');
                setOutreachSent(false);
              } else {
                const prev = STEPS[currentIdx - 1];
                setStep(prev);
              }
            }}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
          >
            <ArrowRight className="w-4 h-4 text-gray-600" />
          </button>
          <h1 className="text-base font-black text-gray-900">צור קבוצה</h1>
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
            {step === 'info' && renderInfoStep()}
            {step === 'schedule' && renderScheduleStep()}
            {step === 'invite' && renderInviteStep()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
