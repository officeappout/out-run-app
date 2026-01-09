"use client";

import React from 'react';
import { Route, RouteSegment } from '../types/map-objects.type';
import { Play, X, Footprints, Dumbbell, Flag, MapPin, Bike } from 'lucide-react';

interface RouteTimelineOverlayProps {
  route: Route;
  onClose: () => void;
  onStart: () => void;
  onSegmentClick?: (segment: RouteSegment, index: number) => void;
}

export default function RouteTimelineOverlay({
  route,
  onClose,
  onStart,
  onSegmentClick,
}: RouteTimelineOverlayProps) {
  const segments = route.segments || [];
  
  // זיהוי סוג פעילות
  const activityType = route.activityType || route.type;
  const isCycling = activityType === 'cycling';
  
  // חישוב מהירות ממוצעת (קמ/ש) עבור אופניים
  const calculateAverageSpeed = () => {
    if (!isCycling) return null;
    const durationHours = route.duration / 60;
    if (durationHours === 0) return 0;
    return Math.round(route.distance / durationHours);
  };
  
  const averageSpeed = calculateAverageSpeed();

  const renderIcon = (type: RouteSegment['type']) => {
    const iconClass = "w-6 h-6";
    switch (type) {
      case 'run':
      case 'walk':
        // הצג אייקון אופניים אם זה מסלול אופניים
        if (isCycling) {
          return <Bike className={`${iconClass} text-blue-600`} />;
        }
        return <Footprints className={`${iconClass} text-blue-600`} />;
      case 'workout':
        return <Dumbbell className={`${iconClass} text-purple-600`} />;
      case 'bench':
        return <div className={`${iconClass} bg-orange-100 rounded-full flex items-center justify-center text-orange-600 font-bold text-xs`}>B</div>;
      case 'finish':
        return <Flag className={`${iconClass} text-green-600`} />;
      default:
        return <MapPin className={`${iconClass} text-gray-600`} />;
    }
  };

  const getSegmentColor = (type: RouteSegment['type']) => {
    switch (type) {
      case 'run':
      case 'walk':
        return 'bg-blue-100 border-blue-300';
      case 'workout':
        return 'bg-purple-100 border-purple-300';
      case 'bench':
        return 'bg-orange-100 border-orange-300';
      case 'finish':
        return 'bg-green-100 border-green-300';
      default:
        return 'bg-gray-100 border-gray-300';
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.15)] max-h-[85vh] flex flex-col animate-[slideUp_0.3s_ease-out]">
      <style jsx>{`
        @keyframes slideUp {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
      `}</style>

      {/* ידית גרירה */}
      <div className="w-full flex justify-center pt-3 pb-2">
        <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
      </div>

      {/* Header */}
      <div className="px-6 pb-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex-1">
          <h2 className="text-xl font-bold text-gray-900">{route.name}</h2>
          <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {route.duration} דק׳
            </span>
            <span className="flex items-center gap-1">
              {isCycling ? (
                <Bike className="w-4 h-4" />
              ) : (
                <Footprints className="w-4 h-4" />
              )}
              {route.distance} ק״מ
              {isCycling && averageSpeed !== null && (
                <span className="text-gray-400"> • {averageSpeed} קמ&quot;ש</span>
              )}
            </span>
            <span className="flex items-center gap-1 text-purple-600 font-medium">
              ✨ {route.score} נק׳
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-600 active:scale-95 transition-transform"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-6 relative">
        {segments.map((segment, index) => (
          <div
            key={index}
            onClick={() => onSegmentClick?.(segment, index)}
            className="flex gap-4 mb-6 last:mb-0 relative group cursor-pointer"
          >
            {/* קו אנכי מחבר */}
            {index !== segments.length - 1 && (
              <div className="absolute top-8 start-[11px] bottom-[-24px] w-0.5 bg-gray-200" />
            )}

            {/* אייקון */}
            <div className="relative z-10 flex-shrink-0">
              <div className={`w-12 h-12 rounded-full ${getSegmentColor(segment.type)} border-2 flex items-center justify-center`}>
                {renderIcon(segment.type)}
              </div>
            </div>

            {/* תוכן */}
            <div className="flex-1 pt-1">
              <h3 className="font-bold text-gray-900 text-base mb-1">{segment.title}</h3>
              {segment.subTitle && (
                <p className="text-sm text-gray-600 mb-2">{segment.subTitle}</p>
              )}

              {/* תרגילים (אם יש) */}
              {segment.exercises && segment.exercises.length > 0 && (
                <div className="space-y-1 mb-2">
                  {segment.exercises.map((exercise, exIndex) => (
                    <div key={exIndex} className="text-xs text-gray-500 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                      <span>{exercise.name} - {exercise.reps}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* תגיות */}
              <div className="flex gap-2 flex-wrap">
                {segment.distance && (
                  <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md">
                    {segment.distance}
                  </span>
                )}
                {segment.duration && (
                  <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md">
                    {segment.duration}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* כפתור התחלה - צף למטה */}
      <div className="p-5 border-t border-gray-100 bg-white safe-area-bottom sticky bottom-0">
        <button
          onClick={onStart}
          className="w-full bg-gradient-to-r from-[#00E5FF] to-[#00B8D4] text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 text-lg shadow-lg shadow-[#00E5FF]/30 transition-transform active:scale-95"
        >
          <Play className="w-6 h-6 fill-current" />
          יאללה, בוא נצא!
        </button>
      </div>
    </div>
  );
}
