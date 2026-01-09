"use client";
import React from 'react';
// שים לב: אנחנו משתמשים בטיפוס החדש שיצרנו
import { Route } from '@/features/map/types/map-objects.type';
import { RankedRoute } from '../services/route-ranking.service';
import { Bike, Footprints } from 'lucide-react';

interface Props {
  route: Route | RankedRoute;
  onClick?: () => void; // הוספנו את זה כדי לאפשר לחיצה
}

export const RouteCard: React.FC<Props> = ({ route, onClick }) => {
  
  // פונקציית עזר לתרגום קושי (כי ב-Type החדש זה באנגלית)
  const getDifficultyInfo = (level: string) => {
    switch (level) {
      case 'easy': return { text: 'קל', color: 'bg-green-100 text-green-700' };
      case 'medium': return { text: 'בינוני', color: 'bg-orange-100 text-orange-700' };
      case 'hard': return { text: 'קשה', color: 'bg-red-100 text-red-700' };
      default: return { text: 'רגיל', color: 'bg-gray-100 text-gray-700' };
    }
  };

  // זיהוי סוג פעילות
  const activityType = route.activityType || route.type;
  const isCycling = activityType === 'cycling';
  
  // חישוב מהירות (קמ/ש) עבור אופניים
  const calculateSpeed = () => {
    if (!isCycling) return null;
    const durationHours = route.duration / 60;
    if (durationHours === 0) return 0;
    return Math.round(route.distance / durationHours);
  };
  
  const speed = calculateSpeed();

  const difficulty = getDifficultyInfo(route.difficulty);
  const rankedRoute = route as RankedRoute;
  const hasRanking = 'matchScore' in rankedRoute;

  return (
    <div 
      onClick={onClick}
      className="bg-white rounded-2xl shadow-sm border-2 border-gray-200 p-4 w-full max-w-sm mx-auto flex items-center justify-between gap-3 cursor-pointer transition-all active:scale-95 hover:shadow-md relative overflow-hidden"
      style={{
        borderColor: rankedRoute.isRecommended ? '#00E5FF' : undefined,
      }}
    >
      {/* תגית "מומלץ עבורך" */}
      {rankedRoute.isRecommended && (
        <div className="absolute top-2 start-2 bg-[#00E5FF] text-white text-[10px] font-bold px-2 py-0.5 rounded-full z-10">
          מומלץ עבורך
        </div>
      )}
      
      {/* צד ימין: המידע */}
      <div className="flex-1 flex flex-col justify-center gap-1">
        
        {/* שורה עליונה: כותרת + תגית קושי */}
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-bold text-gray-800 text-base leading-none line-clamp-1">
            {route.name}
          </h3>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${difficulty.color}`}>
            {difficulty.text}
          </span>
        </div>
        
        {/* שורה תחתונה: נתונים */}
        <div className="flex items-center gap-3 text-xs text-gray-500 font-medium flex-wrap">
           <div className="flex items-center gap-1">
             {isCycling ? (
               <Bike className="w-3.5 h-3.5 text-blue-600" />
             ) : (
               <Footprints className="w-3.5 h-3.5 text-blue-600" />
             )}
             <span className="text-gray-900">{route.distance} ק&quot;מ</span>
             {isCycling && speed !== null && (
               <span className="text-gray-500">({speed} קמ&quot;ש)</span>
             )}
           </div>
           <div className="w-px h-3 bg-gray-300"></div>
           <div>{route.duration} דק&apos;</div>
           {hasRanking && rankedRoute.estimatedCoins > 0 && (
             <>
               <div className="w-px h-3 bg-gray-300"></div>
               <div className="flex items-center gap-0.5 text-yellow-600 font-bold">
                 <span>$</span>
                 <span>{rankedRoute.estimatedCoins}</span>
               </div>
             </>
           )}
           <div className="w-px h-3 bg-gray-300"></div>
           <div className="flex items-center gap-0.5 text-purple-600 font-bold">
             <span>+{route.score}</span>
             <span className="material-icons-round text-[10px]">stars</span>
           </div>
        </div>
      </div>

      {/* צד שמאל: כפתור פעולה */}
      <div>
         <button className="h-10 w-10 rounded-full bg-black text-white flex items-center justify-center shadow-md">
           <span className="material-icons-round text-xl">near_me</span>
         </button>
      </div>
    </div>
  );
};