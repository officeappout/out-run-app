'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Clock, CheckCircle2, Loader2, X } from 'lucide-react';
import { bookSession } from '@/features/arena/services/booking.service';
import { useUserStore } from '@/features/user';
import type { UpcomingSession } from '@/features/arena/hooks/useCommunitySessionBanner';

interface CommunitySessionBannerProps {
  session: UpcomingSession;
  onDismiss: () => void;
  onOpenGroup?: (groupId: string) => void;
}

export default function CommunitySessionBanner({ session, onDismiss, onOpenGroup }: CommunitySessionBannerProps) {
  const profile = useUserStore((s) => s.profile);
  const uid = profile?.id ?? '';
  const userName = profile?.core?.name || 'משתמש';
  const photoURL = profile?.core?.photoURL ?? null;

  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState(false);

  const handleBook = async () => {
    if (!uid) {
      console.warn('[CommunitySessionBanner] no uid — user not signed in');
      return;
    }
    if (booking) return;
    setBooking(true);
    try {
      const result = await bookSession(
        session.groupId,
        session.date,
        session.time,
        uid,
        userName,
        photoURL,
        session.slot.maxParticipants,
      );
      if (result.success && !result.waitlisted) {
        setBooked(true);
        setTimeout(onDismiss, 2000);
      } else if (result.waitlisted) {
        setBooked(true);
        setTimeout(onDismiss, 2000);
      }
    } catch (err) {
      console.error('[CommunitySessionBanner] booking failed:', err);
    } finally {
      setBooking(false);
    }
  };

  const timeLabel = session.isToday ? `היום ב-${session.time}` : `מחר ב-${session.time}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
      onClick={() => onOpenGroup?.(session.groupId)}
      className={`relative flex items-center gap-3 px-4 py-3 rounded-2xl border ${onOpenGroup ? 'cursor-pointer active:scale-[0.98] transition-transform' : ''}`}
      dir="rtl"
      style={{
        background: 'linear-gradient(135deg, #ECFDF5 0%, #F0FDFA 100%)',
        borderColor: '#99F6E4',
      }}
    >
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center flex-shrink-0 shadow-sm">
        <Users className="w-4 h-4 text-white" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-black text-gray-900 truncate">{session.groupName}</p>
        <p className="text-[11px] text-gray-600 flex items-center gap-1">
          <Clock className="w-3 h-3 text-teal-500" />
          {timeLabel}
          {session.slot.price != null && session.slot.price > 0 && (
            <span className="mr-1 text-amber-600 font-bold">· ₪{session.slot.price}</span>
          )}
        </p>
      </div>

      <AnimatePresence mode="wait">
        {booked ? (
          <motion.div
            key="booked"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500 text-white text-[11px] font-black"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            אושר!
          </motion.div>
        ) : (
          <motion.button
            key="book"
            onClick={(e) => { e.stopPropagation(); handleBook(); }}
            disabled={booking}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-teal-500 hover:bg-teal-600 text-white text-[11px] font-black transition-all active:scale-95 disabled:opacity-60 shadow-sm"
          >
            {booking ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                {session.isToday ? 'אשר הגעה' : 'הירשם'}
              </>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      <button
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors"
      >
        <X className="w-3 h-3 text-gray-500" />
      </button>
    </motion.div>
  );
}
