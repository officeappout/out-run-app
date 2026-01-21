import React from 'react';
import { Route } from '../types/route.types';
import { Play, Dumbbell, Footprints, Flag, MapPin } from 'lucide-react';

interface Props {
  route: Route;
  onClose: () => void;
  onStart: () => void;
}

export const RoutePreviewDrawer: React.FC<Props> = ({ route, onClose, onStart }) => {
  
  // נתונים מדומים למבנה המקטעים (בעתיד יגיע מה-Route האמיתי)
  // כרגע אנחנו "מזריקים" את זה כדי לעצב
  const segments = [
    { type: 'walk', title: 'הליכה לגינת שנקין', distance: '800 מ׳', duration: '10 דק׳' },
    { type: 'workout', title: 'אימון גוף עליון', subTitle: 'מתח, מקבילים', duration: '15 דק׳' },
    { type: 'walk', title: 'הליכה לשדרות', distance: '400 מ׳', duration: '5 דק׳' },
    { type: 'bench', title: 'תרגיל ספסל', subTitle: 'עליות מדרגה', duration: '5 דק׳' },
    { type: 'finish', title: 'סיום מסלול', subTitle: 'כל הכבוד!', duration: '' },
  ];

  const renderIcon = (type: string) => {
    switch (type) {
      case 'walk': return <div className="bg-blue-100 p-2 rounded-full z-10"><Footprints className="w-5 h-5 text-blue-600" /></div>;
      case 'workout': return <div className="bg-purple-100 p-2 rounded-full z-10"><Dumbbell className="w-5 h-5 text-purple-600" /></div>;
      case 'bench': return <div className="bg-orange-100 p-2 rounded-full z-10"><div className="w-5 h-5 text-orange-600 font-bold text-center leading-5">B</div></div>;
      case 'finish': return <div className="bg-green-100 p-2 rounded-full z-10"><Flag className="w-5 h-5 text-green-600" /></div>;
      default: return <MapPin className="w-5 h-5" />;
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 bg-white z-50 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.15)] max-h-[80vh] flex flex-col animate-slide-up">
      
      {/* --- הכרטיס עצמו --- */}
      <div className="
          w-full bg-white rounded-t-[32px] shadow-[0_-10px_40px_rgba(0,0,0,0.1)] 
          pointer-events-auto
          animate-in slide-in-from-bottom duration-300
          flex flex-col
          max-h-[40vh]  /* 👈 התיקון: מגביל גובה ל-70% מהמסך */
      ">

      </div>
      {/* ידית גרירה */}
      <div className="w-full flex justify-center pt-3 pb-2" onClick={onClose}>
        <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
      </div>

      {/* כותרת ראשית */}
      <div className="px-6 pb-4 border-b border-gray-100">
        <h2 className="text-xl font-bold text-gray-900">{route.name}</h2>
        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
          <span className="flex items-center gap-1">🕒 {route.duration} {"דק׳"}</span>
          <span className="flex items-center gap-1">👣 {route.distance} {"ק״מ"}</span>
          <span className="flex items-center gap-1 text-purple-600 font-medium">✨ {route.score} {"נק׳"}</span>
        </div>
      </div>

      {/* ציר הזמן (Timeline) */}
      <div className="flex-1 overflow-y-auto p-6 relative">
        {segments.map((segment, index) => (
          <div key={index} className="flex gap-4 mb-8 last:mb-0 relative group">
            
            {/* הקו המחבר - מופיע רק אם זה לא האחרון */}
            {index !== segments.length - 1 && (
              <div className={`absolute top-10 right-[19px] bottom-[-32px] w-[2px] 
                ${segment.type === 'walk' ? 'bg-blue-200 dashed-line' : 'bg-gray-200'}`} 
              />
            )}

            {/* האייקון */}
            <div className="flex-shrink-0 relative">
              {renderIcon(segment.type)}
            </div>

            {/* הטקסט */}
            <div className="pt-1">
              <h3 className="font-bold text-gray-800 text-base">{segment.title}</h3>
              {segment.subTitle && <p className="text-sm text-gray-500">{segment.subTitle}</p>}
              
              {/* תגיות קטנות */}
              <div className="flex gap-2 mt-2">
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

      {/* כפתור התחלה מקובע למטה */}
      <div className="p-5 border-t border-gray-100 bg-white safe-area-bottom">
        <button 
          onClick={onStart}
          className="w-full bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 text-lg shadow-lg shadow-cyan-200 transition-transform active:scale-95"
        >
          <Play className="w-6 h-6 fill-current" />
          יאללה, בוא נצא!
        </button>
      </div>
    </div>
  );
};