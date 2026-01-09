import React from 'react';
import { useRunStore } from '../store/useRunStore';

export const RunModeSelector = () => {
  // שורה קריטית: כאן אנחנו מתחברים ל"מוח" המרכזי (Store)
  // אנחנו לוקחים משם שני דברים:
  // 1. runMode - המצב הנוכחי (כדי לדעת את מי לצבוע)
  // 2. setRunMode - הפונקציה לשינוי המצב (כשלוחצים)
  const { runMode, setRunMode } = useRunStore();

  return (
    // זה הבר העליון שצף מעל המפה (z-20 דואג שהוא יהיה מעל המפה)
    <div className="absolute top-12 left-0 right-0 z-20 flex justify-center px-6">
       <div className="bg-gray-800/90 backdrop-blur-md rounded-full p-1.5 flex items-center shadow-lg w-full max-w-sm border border-gray-700">
          
          {/* כפתור 1: תכנן */}
          <button 
            onClick={() => setRunMode('plan')}
            className={`flex-1 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
              runMode === 'plan' 
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            תכנן
          </button>

          {/* כפתור 2: ריצה חופשית */}
          <button 
            onClick={() => setRunMode('free')}
            className={`flex-1 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
              runMode === 'free' 
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            ריצה חופשית
          </button>

           {/* כפתור 3: המסלולים שלי */}
           <button 
            onClick={() => setRunMode('my_routes')}
            className={`flex-1 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
              runMode === 'my_routes' 
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            שלי
          </button>

       </div>
    </div>
  );
};