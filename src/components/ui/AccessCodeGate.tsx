'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Loader2, Send, SkipForward } from 'lucide-react';
import { validateAccessCode, type AccessCodeResult } from '@/features/user/onboarding/services/access-code.service';
import { getContactLabel } from '@/features/arena/utils/contactLabels';

interface AccessCodeGateProps {
  /** Group or org display name — used in the WhatsApp template */
  orgName: string;
  /** Persona label for the message template (e.g. "חייל סדיר") */
  personaLabel?: string;
  /** Controls dynamic CTA label (e.g. 'military' → "מפקד כושר") */
  groupType?: string | null;
  tenantType?: string | null;
  /** WhatsApp phone number (with country code) for the "Contact Manager" CTA */
  contactPhone?: string | null;
  /** Called on successful code validation */
  onSuccess: (result: AccessCodeResult) => void;
  /** Called when user chooses to skip */
  onSkip?: () => void;
  /** Hide the skip button (e.g. when joining a locked group that requires a code) */
  hideSkip?: boolean;
  /** Compact inline mode vs full card */
  compact?: boolean;
}

const ERROR_MAP: Record<string, string> = {
  'not-found': 'קוד גישה לא נמצא. בדקו ונסו שוב.',
  'not found': 'קוד גישה לא נמצא. בדקו ונסו שוב.',
  expired: 'קוד הגישה פג תוקף.',
  'resource-exhausted': 'קוד הגישה הגיע למכסה המקסימלית.',
  maximum: 'קוד הגישה הגיע למכסה המקסימלית.',
  precondition: 'קוד הגישה אינו פעיל יותר.',
  'no longer active': 'קוד הגישה אינו פעיל יותר.',
};

function mapError(err: any): string {
  const msg = err?.message || err?.code || '';
  for (const [key, label] of Object.entries(ERROR_MAP)) {
    if (msg.includes(key)) return label;
  }
  return 'שגיאה בבדיקת הקוד. נסו שוב.';
}

export default function AccessCodeGate({
  orgName,
  personaLabel,
  groupType,
  tenantType,
  contactPhone,
  onSuccess,
  onSkip,
  hideSkip = false,
  compact = false,
}: AccessCodeGateProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const contact = getContactLabel(groupType, tenantType);

  const handleSubmit = useCallback(async () => {
    if (!code.trim()) {
      setError('יש להזין קוד גישה');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await validateAccessCode(code);
      onSuccess(result);
    } catch (err: any) {
      console.error('[AccessCodeGate] Validation failed for code:', code, '| Full error:', err, '| message:', err?.message, '| code:', err?.code, '| details:', err?.details);
      setError(mapError(err));
    } finally {
      setLoading(false);
    }
  }, [code, onSuccess]);

  const handleContact = useCallback(() => {
    const senderLabel = personaLabel || 'משתמש/ת';
    const text = `שלום, אני ${senderLabel} ואשמח לקבל קוד גישה עבור ${orgName}.`;
    const phone = contactPhone?.replace(/[^0-9]/g, '') || '';
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }, [personaLabel, orgName, contactPhone]);

  return (
    <div
      dir="rtl"
      className={`rounded-2xl border ${compact ? 'p-4' : 'p-5'} bg-gradient-to-br from-slate-50 to-white border-slate-200 shadow-sm`}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
          <Lock className="w-4 h-4 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-gray-900">נדרש קוד גישה</p>
          {!compact && (
            <p className="text-xs text-gray-500 mt-0.5">הזינו את הקוד שקיבלתם מהארגון</p>
          )}
        </div>
      </div>

      <div className="flex gap-2 items-center">
        <input
          dir="ltr"
          type="text"
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null); }}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="UNIT-X79"
          disabled={loading}
          className="flex-1 text-center text-lg font-mono tracking-widest border-2 border-gray-200 rounded-xl px-3 py-2.5 focus:border-[#5BC2F2] focus:outline-none transition-colors placeholder:text-gray-300"
        />
        <button
          onClick={handleSubmit}
          disabled={loading || !code.trim()}
          className="px-4 py-2.5 rounded-xl font-black text-sm text-white bg-[#5BC2F2] disabled:opacity-40 transition-opacity flex items-center gap-1.5"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'אישור'}
        </button>
      </div>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="text-red-500 text-xs text-center mt-2 font-medium"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-3 mt-3">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-[10px] text-gray-400 font-bold">או</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      <button
        onClick={handleContact}
        className="w-full mt-3 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 active:scale-[0.98] transition-all"
      >
        <Send className="w-3.5 h-3.5" />
        <span>פנה ל{contact.he}</span>
      </button>

      {!hideSkip && onSkip && (
        <button
          onClick={onSkip}
          className="w-full mt-2 flex items-center justify-center gap-1.5 py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          <SkipForward className="w-3 h-3" />
          דלג — המשך בלי קוד
        </button>
      )}
    </div>
  );
}
