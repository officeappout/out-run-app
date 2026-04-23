'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { X, Star, MapPin, Pencil, Flag, Loader2, ExternalLink, Users } from 'lucide-react';
import { getPark } from '@/features/parks/core/services/parks.service';
import { getAllContributions } from '@/features/parks/core/services/contribution.service';
import type { Park } from '@/features/parks/core/types/park.types';
import type { UserContribution } from '@/types/contribution.types';
import FacilityCard, { FACILITY_TAGS } from '@/features/parks/client/components/park-detail/FacilityCard';
import Link from 'next/link';

interface ParkDetailDrawerProps {
  parkId: string | null;
  onClose: () => void;
}

const FACILITY_LABELS: Record<string, string> = {
  gym_park: 'גינת כושר', court: 'מגרש ספורט', route: 'מסלול',
  zen_spot: 'פינת גוף-נפש', urban_spot: 'אורבן / אקסטרים', nature_community: 'טבע וקהילה',
};

function formatDate(ts: any): string {
  if (!ts) return '—';
  const d = ts instanceof Date ? ts : typeof ts?.toDate === 'function' ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ParkDetailDrawer({ parkId, onClose }: ParkDetailDrawerProps) {
  const [park, setPark] = useState<Park | null>(null);
  const [reviews, setReviews] = useState<UserContribution[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!parkId) { setPark(null); setReviews([]); return; }
    setLoading(true);
    (async () => {
      try {
        const [parkData, allContribs] = await Promise.all([
          getPark(parkId),
          getAllContributions(),
        ]);
        setPark(parkData);
        setReviews(allContribs.filter(c => c.type === 'review' && c.linkedParkId === parkId));
      } catch (err) {
        console.error('[ParkDetailDrawer] Load failed:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [parkId]);

  const avgRating = useMemo(() => {
    const rated = reviews.filter(r => r.rating);
    if (rated.length === 0) return park?.rating ?? null;
    return rated.reduce((sum, r) => sum + (r.rating ?? 0), 0) / rated.length;
  }, [reviews, park?.rating]);

  const activeReportsCount = reviews.filter(r => r.type === 'report' && r.status === 'pending').length;

  if (!parkId) return null;

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className="fixed top-0 bottom-0 right-0 z-[81] w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300" dir="rtl">
        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
          </div>
        )}

        {!loading && park && (
          <>
            {/* Header image */}
            <div className="relative h-48 bg-gradient-to-br from-slate-100 to-slate-200 flex-shrink-0">
              {(park.image || park.imageUrl) ? (
                <img src={park.image || park.imageUrl} alt={park.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <MapPin size={48} className="text-slate-300" />
                </div>
              )}
              <button onClick={onClose} className="absolute top-4 left-4 w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/60 transition-colors">
                <X size={18} />
              </button>
              {park.facilityType && (
                <div className="absolute bottom-3 right-4">
                  <span className="px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-full text-xs font-black text-slate-800 shadow-sm">
                    {FACILITY_LABELS[park.facilityType] || park.facilityType}
                  </span>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Name + rating */}
              <div className="px-5 pt-5 pb-3">
                <h2 className="text-xl font-black text-slate-900 mb-1">{park.name}</h2>
                <div className="flex items-center gap-3 text-sm">
                  {avgRating && (
                    <div className="flex items-center gap-1">
                      <Star size={16} className="text-amber-400" fill="#FBBF24" />
                      <span className="font-black text-slate-900">{avgRating.toFixed(1)}</span>
                      <span className="text-slate-400 text-xs">({reviews.filter(r => r.rating).length} ביקורות)</span>
                    </div>
                  )}
                  {park.city && <span className="text-slate-400 flex items-center gap-1 text-xs"><MapPin size={12} />{park.city}</span>}
                </div>
              </div>

              {park.description && (
                <div className="px-5 pb-4">
                  <p className="text-sm text-slate-600 leading-relaxed">{park.description}</p>
                </div>
              )}

              {/* Status row */}
              <div className="px-5 pb-4 flex items-center gap-3">
                <div className={`px-3 py-1.5 rounded-full text-[11px] font-bold ${
                  park.status === 'open' ? 'bg-emerald-100 text-emerald-700' :
                  park.status === 'under_repair' ? 'bg-amber-100 text-amber-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {park.status === 'open' ? 'פעיל' : park.status === 'under_repair' ? 'בתיקון' : 'סגור'}
                </div>
                {activeReportsCount > 0 && (
                  <div className="flex items-center gap-1 text-xs text-amber-600 font-bold">
                    <Flag size={12} />{activeReportsCount} דיווחים פתוחים
                  </div>
                )}
              </div>

              {/* Facilities grid — shared FacilityCard component */}
              <div className="px-5 pb-5">
                <h3 className="text-sm font-black text-slate-700 mb-3">מתקנים ותכונות</h3>
                <div className="grid grid-cols-2 gap-2">
                  {FACILITY_TAGS.map(tag => (
                    <FacilityCard
                      key={tag.id}
                      tag={tag}
                      isActive={!!park.featureTags?.includes(tag.id)}
                      variant="admin"
                    />
                  ))}
                </div>
              </div>

              {/* Action buttons */}
              <div className="px-5 pb-4 flex gap-2">
                <Link href={`/admin/authority/locations/${park.id}/edit`}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-cyan-500 text-white text-xs font-black hover:bg-cyan-600 transition-colors">
                  <Pencil size={14} />ערוך מיקום
                </Link>
                <Link href="/admin/authority/locations"
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 transition-colors">
                  <ExternalLink size={14} />רשימה
                </Link>
              </div>

              {/* Reviews list */}
              <div className="px-5 pb-8">
                <h3 className="text-sm font-black text-slate-700 mb-3 flex items-center gap-2">
                  <Users size={16} />ביקורות אחרונות
                </h3>
                {reviews.filter(r => r.rating).length === 0 ? (
                  <div className="text-center py-8 bg-slate-50 rounded-xl">
                    <Star size={24} className="mx-auto text-slate-300 mb-2" />
                    <p className="text-sm text-slate-400 font-medium">אין ביקורות עדיין</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {reviews.filter(r => r.rating).slice(0, 10).map(review => (
                      <div key={review.id} className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                              <span className="text-[10px] text-white font-black">{review.userId?.charAt(0)?.toUpperCase() ?? '?'}</span>
                            </div>
                            <span className="text-[11px] font-bold text-slate-600">{review.userId?.slice(0, 8)}...</span>
                          </div>
                          <div className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map(s => (
                              <Star key={s} size={12} className={s <= (review.rating ?? 0) ? 'text-amber-400' : 'text-slate-200'} fill={s <= (review.rating ?? 0) ? '#FBBF24' : 'none'} />
                            ))}
                          </div>
                        </div>
                        {review.comment && <p className="text-xs text-slate-600 leading-relaxed pr-9">{review.comment}</p>}
                        <p className="text-[10px] text-slate-400 mt-1.5 pr-9">{formatDate(review.createdAt)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {!loading && !park && parkId && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <MapPin size={40} className="text-slate-300" />
            <p className="text-slate-500 font-medium">הפארק לא נמצא</p>
            <button onClick={onClose} className="text-sm text-cyan-500 font-bold hover:underline">סגור</button>
          </div>
        )}
      </div>
    </>
  );
}
