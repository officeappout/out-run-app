import React from 'react';
import { useMapStore } from '@/features/map/store/useMapStore';

export const ParkPreview = () => {
  const { selectedPark, setSelectedPark } = useMapStore();

  // אם לא נבחר פארק, הקומפוננטה לא מרנדרת כלום
  if (!selectedPark) return null;

  return (
    <div className="absolute bottom-[100px] left-4 right-4 z-30 animate-in slide-in-from-bottom-10 fade-in duration-500">
      <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl overflow-hidden h-32 flex flex-row-reverse border border-gray-100 dark:border-zinc-700">
        
        {/* כפתור סגירה מהירה */}
        <button 
          onClick={(e) => {
            e.stopPropagation();
            setSelectedPark(null);
          }}
          className="absolute top-2 left-2 z-10 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 backdrop-blur-sm transition-colors"
        >
          <span className="material-icons-round text-[10px] leading-none">close</span>
        </button>

        {/* תמונה צדדית */}
        <div className="w-[35%] relative">
          <img 
            alt={selectedPark.name} 
            className="absolute inset-0 w-full h-full object-cover" 
            src={selectedPark.imageUrl}
          />
        </div>

        {/* פרטי הפארק מהדאטה */}
        <div className="flex-1 p-4 flex flex-col justify-between text-right">
          <div>
            <h3 className="font-bold text-lg text-gray-900 dark:text-white leading-tight mb-0.5">
              {selectedPark.name}
            </h3>
            <p className="text-gray-500 dark:text-gray-400 text-xs">{selectedPark.city}</p>
          </div>

          <div className="flex items-center justify-between mt-auto">
            {/* מרחק (כרגע סטטי, בהמשך נחשב דינמית) */}
            <div className="flex items-center bg-gray-100 dark:bg-zinc-700 px-2 py-1 rounded-md">
              <span className="material-icons-round text-gray-500 dark:text-gray-300 text-[10px] ml-1">near_me</span>
              <span className="text-[10px] font-medium text-gray-700 dark:text-gray-200">
                450 מטר ממך
              </span>
            </div>

            {/* דירוג */}
            <div className="flex items-center space-x-1 space-x-reverse">
              <span className="text-sm font-bold text-gray-900 dark:text-white">
                {selectedPark.rating || '4.8'}
              </span>
              <span className="material-icons-round text-amber-400 text-sm">star</span>
              <span className="text-[10px] text-gray-400">(120)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};