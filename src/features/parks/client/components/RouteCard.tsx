import React from 'react';

// 1. הגדרת המבנה המדויק (Interface)
export interface RouteProps {
  title: string;
  tags?: string[]; // סימן שאלה אומר שזה לא חובה
  reward: number;
  stats: {
    time: number;
    calories: number;
    distance: number;
  };
}

// 2. הקומפוננטה שמקבלת את האובייקט
export const RouteCard = ({ route }: { route: RouteProps }) => {
  if (!route) return null; // הגנה למקרה שאין נתונים

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-xl p-4 border border-gray-100 dark:border-zinc-800 w-full animate-in fade-in slide-in-from-bottom-5 duration-500">
      
      {/* כותרת */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
           <span className="bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
             Easy
           </span>
           <h3 className="font-bold text-gray-900 dark:text-white text-sm">
             {route.title}
           </h3>
        </div>
        
        {/* אייקונים */}
        <div className="flex items-center gap-1 opacity-80">
           <span className="material-icons-round text-blue-500 text-sm">directions_run</span>
           <span className="material-icons-round text-gray-300 text-[10px]">arrow_forward</span>
           <span className="material-icons-round text-orange-500 text-sm">fitness_center</span>
           <span className="material-icons-round text-gray-300 text-[10px]">arrow_forward</span>
           <span className="material-icons-round text-green-500 text-sm">directions_walk</span>
        </div>
      </div>

      <div className="h-[1px] bg-gray-100 dark:bg-zinc-800 w-full mb-3" />

      {/* נתונים */}
      <div className="flex justify-between items-center px-2">
        <div className="flex items-center gap-1.5">
          <span className="material-icons-round text-orange-500 text-sm">local_fire_department</span>
          <div className="flex flex-col leading-none">
            <span className="text-xs font-bold text-gray-900 dark:text-white">{route.stats.calories}</span>
            <span className="text-[9px] text-gray-400">Cal</span>
          </div>
        </div>

        <div className="w-[1px] h-6 bg-gray-100 dark:bg-zinc-800"></div>

        <div className="flex items-center gap-1.5">
          <span className="material-icons-round text-blue-500 text-sm">timer</span>
          <div className="flex flex-col leading-none">
            <span className="text-xs font-bold text-gray-900 dark:text-white">{route.stats.time}</span>
            <span className="text-[9px] text-gray-400">Min</span>
          </div>
        </div>

        <div className="w-[1px] h-6 bg-gray-100 dark:bg-zinc-800"></div>

        <div className="flex items-center gap-1.5">
          <span className="material-icons-round text-amber-500 text-sm">monetization_on</span>
          <div className="flex flex-col leading-none">
            <span className="text-xs font-bold text-gray-900 dark:text-white">+{route.reward}</span>
            <span className="text-[9px] text-gray-400">Coins</span>
          </div>
        </div>
      </div>
      
      <button className="w-full mt-4 bg-zinc-900 dark:bg-white text-white dark:text-black rounded-xl py-2.5 text-xs font-bold shadow-lg active:scale-95 transition-transform">
        התחל אימון
      </button>

    </div>
  );
};