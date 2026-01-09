"use client";
import React, { useState } from 'react';
import ParkList from '../park-list';
import ParkWithDistance from '@/features/park/types/park-with-distance.type';

type ParkDrawerProps = {
  parks: ParkWithDistance[];
};

export const ParkDrawer = ({ parks }: ParkDrawerProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div 
      className={`fixed inset-x-0 bottom-0 z-40 transition-all duration-500 ease-in-out ${
        isOpen ? 'h-[80vh]' : 'h-[100px]'
      }`}
    >
      {/* רקע המגירה */}
      <div className="h-full bg-white dark:bg-zinc-900 rounded-t-[2.5rem] shadow-[0_-10px_30px_rgba(0,0,0,0.1)] flex flex-col border-t border-gray-100 dark:border-zinc-800">
        
        {/* ידית גרירה וכותרת */}
        <div 
          className="pt-4 pb-2 px-6 cursor-pointer"
          onClick={() => setIsOpen(!isOpen)}
        >
          <div className="w-12 h-1.5 bg-gray-200 dark:bg-zinc-700 rounded-full mx-auto mb-4"></div>
          <div className="flex justify-between items-center">
             <span className="text-gray-400 text-xs font-medium">החלק למעלה לרשימה המלאה</span>
             <h2 className="font-bold text-gray-900 dark:text-white text-lg">
               {parks.length} מקומות בסביבה
             </h2>
          </div>
        </div>

        {/* תוכן הרשימה - מופיע בגלילה כשהמגירה פתוחה */}
        <div className="flex-1 overflow-y-auto no-scrollbar pt-2">
          <ParkList parks={parks} />
        </div>
      </div>
    </div>
  );
};