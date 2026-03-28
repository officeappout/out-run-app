'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Check, Share2, QrCode } from 'lucide-react';
import { useUserStore } from '@/features/user';

interface ViralUnlockSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

const REFERRAL_GOAL = 1;

function generateInviteLink(userId: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://out-run-app.vercel.app';
  return `${origin}/join?ref=${userId}`;
}

function resolveLocationName(profile: ReturnType<typeof useUserStore>['profile']): string {
  const cityAffiliation = profile?.core?.affiliations?.find((a) => a.type === 'city');
  if (cityAffiliation?.name) return cityAffiliation.name;

  const anyAffiliation = profile?.core?.affiliations?.[0];
  if (anyAffiliation?.name) return anyAffiliation.name;

  return 'השכונה שלך';
}

function generateInviteMessage(location: string, inviteLink: string): string {
  return `שומע? אני מתאמן ב${location} עם Out — תצטרף אליי ונפתח ביחד את מפת השותפים ודירוגי הליגה! 🤘 ${inviteLink}`;
}

export default function ViralUnlockSheet({ isOpen, onClose }: ViralUnlockSheetProps) {
  const { profile } = useUserStore();
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const referralCount = profile?.core?.referralCount ?? 0;
  const userId = profile?.id ?? '';

  const inviteLink = useMemo(() => generateInviteLink(userId), [userId]);
  const location = useMemo(() => resolveLocationName(profile), [profile]);

  const message = useMemo(
    () => generateInviteMessage(location, inviteLink),
    [location, inviteLink],
  );

  const handleShareWhatsApp = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'Out — בוא להתאמן איתי!',
          text: message,
          url: inviteLink,
        });
      } catch {
        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
      }
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
    }
  }, [message, inviteLink]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = inviteLink;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [inviteLink]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-black/40"
            onClick={onClose}
          />

          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            className="fixed bottom-0 left-0 right-0 z-[91] bg-white rounded-t-3xl shadow-2xl"
            style={{ maxHeight: '85vh' }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {/* Close */}
            <button
              onClick={onClose}
              className="absolute top-4 left-4 p-1 rounded-full text-gray-400 hover:bg-gray-100 transition-colors"
            >
              <X size={20} />
            </button>

            <div className="px-6 pb-8 pt-2 flex flex-col items-center gap-5 overflow-y-auto" dir="rtl">
              {/* Lemur mascot — smart-lemur with cyan glow */}
              <div
                className="w-24 h-24 rounded-full overflow-hidden border-[3px] border-[#00BAF7] flex items-center justify-center bg-cyan-50"
                style={{
                  boxShadow: '0 0 20px rgba(0, 186, 247, 0.35), 0 0 40px rgba(0, 186, 247, 0.15)',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/assets/lemur/smart-lemur.png"
                  alt="Smart Lemur"
                  width={96}
                  height={96}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Headline */}
              <div className="text-center">
                <h3 className="text-lg font-black text-gray-900">
                  בונים נבחרת!
                </h3>
                <p className="text-[13px] text-gray-500 mt-1.5 max-w-[280px] mx-auto leading-relaxed">
                  הזמן שותף אחד כדי לפתוח את מפת השותפים ודירוגי הליגה
                </p>
              </div>

              {/* Single-step goal indicator */}
              <div className="w-full max-w-[300px]">
                <div className="flex items-center justify-center gap-1.5 mb-3">
                  <span className="text-[12px] font-black text-gray-800 tracking-wide">
                    ({referralCount}/{REFERRAL_GOAL}) שותפים הצטרפו
                  </span>
                </div>

                {referralCount >= REFERRAL_GOAL ? (
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex flex-col items-center gap-2"
                  >
                    <div
                      className="w-14 h-14 rounded-full bg-[#00BAF7] text-white flex items-center justify-center shadow-lg"
                      style={{ boxShadow: '0 0 20px rgba(0,186,247,0.4)' }}
                    >
                      <Check size={28} strokeWidth={3} />
                    </div>
                    <span className="text-sm font-black text-[#00BAF7]">נפתח! 🎉</span>
                  </motion.div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <motion.div
                      animate={{ scale: [1, 1.08, 1] }}
                      transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                      className="w-14 h-14 rounded-full bg-white border-[3px] border-[#00BAF7] text-[#00BAF7] flex items-center justify-center shadow-lg"
                      style={{ boxShadow: '0 0 12px rgba(0,186,247,0.3)' }}
                    >
                      <span className="text-lg font-black">1</span>
                    </motion.div>
                    <span className="text-[11px] font-bold text-gray-400">חסר עוד שותף אחד</span>
                  </div>
                )}
              </div>

              {/* Primary: WhatsApp / Share — pill shape */}
              <button
                onClick={handleShareWhatsApp}
                className="w-full flex items-center justify-center gap-3 py-4 rounded-full text-white font-extrabold text-[15px] shadow-lg transition-all active:scale-[0.97]"
                style={{
                  background: 'linear-gradient(135deg, #25D366, #128C7E)',
                  boxShadow: '0 4px 24px rgba(37,211,102,0.35)',
                }}
              >
                <Share2 size={20} />
                <span>שלח הזמנה בוואטסאפ</span>
              </button>

              {/* Secondary actions row */}
              <div className="flex items-center gap-3 w-full">
                <button
                  onClick={handleCopyLink}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-full bg-gray-100 text-gray-700 font-bold text-[13px] transition-all active:scale-[0.97] hover:bg-gray-200"
                >
                  {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                  <span>{copied ? 'הקישור הועתק!' : 'העתק קישור'}</span>
                </button>
                <button
                  onClick={() => setShowQR(!showQR)}
                  className="flex items-center justify-center gap-2 py-3 px-5 rounded-full bg-gray-100 text-gray-700 font-bold text-[13px] transition-all active:scale-[0.97] hover:bg-gray-200"
                >
                  <QrCode size={16} />
                  <span>QR</span>
                </button>
              </div>

              {/* QR Code section */}
              <AnimatePresence>
                {showQR && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="w-full flex flex-col items-center gap-2 overflow-hidden"
                  >
                    <div className="w-48 h-48 bg-white border-2 border-gray-200 rounded-2xl flex items-center justify-center p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(inviteLink)}`}
                        alt="QR Code"
                        width={180}
                        height={180}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <p className="text-[11px] text-gray-400 text-center">
                      תן לשותף לסרוק — ייכנס ישירות לאפליקציה
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
