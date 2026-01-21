import React from 'react';
import { Route } from '@/features/map/types/map-objects.type';
import { Play, Clock, MapPin, Footprints, RotateCw } from 'lucide-react'; // הוספנו RotateCw

interface RouteCardProps {
  route: Route;
  isActive?: boolean;
  onClick?: () => void;
  onStart?: () => void;
  onShuffle?: () => void;
  isLoading?: boolean;
  onViewDetails?: () => void;
}

export default function RouteCard({
  route,
  isActive = false,
  onClick,
  onStart,
  onShuffle,
  isLoading,
  onViewDetails
}: RouteCardProps) {

  // חישוב קלוריות משוער (פשוט לתצוגה)
  const calories = Math.round(route.distance * 60 * 1.036);

  return (
    <div
      onClick={onClick}
      className={`
                relative flex-shrink-0 w-[85vw] max-w-[320px] p-5 rounded-3xl transition-all duration-300
                bg-white shadow-xl border-2 snap-center
                ${isActive ? 'border-cyan-400 scale-100' : 'border-transparent scale-95 opacity-80'}
                ${onClick ? 'cursor-pointer' : ''}
            `}
    >
      {/* כותרת ותגית */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
              Generated
            </span>
            {route.includesOfficialSegments && (
              <span className="bg-cyan-100 text-cyan-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                כולל שביל עירוני
              </span>
            )}
            {route.includesFitnessStop && (
              <span className="bg-orange-100 text-orange-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                כולל עצירה בפארק
              </span>
            )}
            {isLoading && <span className="text-xs text-gray-400 animate-pulse">טוען מסלול...</span>}
          </div>
          <h3 className="text-xl font-black text-gray-800 leading-tight">
            סיבוב מותאם אישית
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            מסלול {route.type === 'running' ? 'ריצה' : 'הליכה'} מעגלי של {route.distance.toFixed(1)} ק"מ
          </p>
        </div>

        {/* כפתור החלפה/רענון - מופיע רק כשהכרטיס פעיל */}
        {isActive && onShuffle && (
          <button
            onClick={(e) => {
              e.stopPropagation(); // כדי לא להפעיל את הלחיצה על הכרטיס עצמו
              onShuffle();
            }}
            className="p-2 rounded-full bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-cyan-500 transition-colors"
            title="החלף מסלול (שמור על מרחק)"
          >
            <RotateCw size={18} />
          </button>
        )}
      </div>

      {/* נתונים */}
      <div className="grid grid-cols-3 gap-3 mb-2">
        <div className="bg-gray-50 rounded-2xl p-3 text-center">
          <div className="flex justify-center text-gray-400 mb-1"><Clock size={16} /></div>
          <div className="font-black text-gray-800 text-lg">
            {Math.round(route.duration / 60)}
            <span className="text-xs font-normal mr-0.5">דק׳</span>
          </div>
          <div className="text-[10px] text-gray-400">זמן</div>
        </div>

        <div className="bg-gray-50 rounded-2xl p-3 text-center">
          <div className="flex justify-center text-gray-400 mb-1"><MapPin size={16} /></div>
          <div className="font-black text-gray-800 text-lg">
            {route.distance.toFixed(1)}
            <span className="text-xs font-normal mr-0.5">ק״מ</span>
          </div>
          <div className="text-[10px] text-gray-400">מרחק</div>
        </div>

        <div className="bg-yellow-50 rounded-2xl p-3 text-center border border-yellow-100">
          <div className="flex justify-center text-yellow-600 mb-1"><Footprints size={16} /></div>
          <div className="font-black text-gray-800 text-lg">
            {calories}
          </div>
          <div className="text-[10px] text-gray-400">תגמול</div>
        </div>
      </div>

      {/* פרטי אימון */}
      {isActive && onViewDetails && (
        <div className="flex justify-center mb-4">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails();
            }}
            className="text-xs font-bold text-out-blue flex items-center gap-1 hover:underline"
          >
            פרטי אימון מלאים <span className="text-[10px] mt-0.5">◀</span>
          </button>
        </div>
      )}

      {/* כפתור פעולה */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onStart?.();
        }}
        className={`
                    w-full py-3.5 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all
                    ${isActive
            ? 'bg-black text-white shadow-lg hover:bg-gray-800'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed'}
                `}
      >
        <Play size={18} fill="currentColor" />
        {isActive ? 'התחל אימון' : 'בחר מסלול'}
      </button>
    </div>
  );
}