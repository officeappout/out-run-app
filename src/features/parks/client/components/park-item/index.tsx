import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import ParkWithDistance from '../../types/park-with-distance.type';
import getDistanceStr from '@/lib/distanseStr';
import useCardPage from '@/@core/hooks/useCardPage';

type ParkItemProps = {
  park: ParkWithDistance;
};

function ParkItem({ park }: ParkItemProps) {
  const router = useRouter();
  const { href } = useCardPage('park', park.id);
  
  const distanceStr = useMemo(() => {
    return getDistanceStr(park.distance);
  }, [park.distance]);

  return (
    <button 
      onClick={() => router.push(href)} 
      className="group w-full flex flex-row-reverse items-center gap-4 p-3 mb-3 bg-white dark:bg-zinc-800/50 hover:bg-gray-50 dark:hover:bg-zinc-700/50 rounded-2xl transition-all border border-transparent hover:border-gray-100 dark:hover:border-zinc-600"
    >
      {/* תמונה קטנה בצד */}
      <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 shadow-sm">
        <img 
          src={park.imageUrl || '/api/placeholder/80/80'} 
          alt={park.name}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
        />
      </div>

      {/* תוכן הטקסט */}
      <div className="flex-1 flex flex-col items-start text-right">
        <h4 className="font-bold text-gray-900 dark:text-white text-base mb-1">{park.name}</h4>
        
        <div className="flex items-center gap-2 mb-2">
          <div className="flex items-center gap-1">
            <span className="text-xs font-bold text-gray-900 dark:text-white">4.8</span>
            <span className="material-icons-round text-amber-400 text-[14px]">star</span>
          </div>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">תל אביב</span>
        </div>

        {/* מרחק מהמשתמש */}
        <div className="flex items-center bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-md">
          <span className="material-icons-round text-blue-500 text-[12px] ml-1">near_me</span>
          <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">{distanceStr} ממך</span>
        </div>
      </div>

      {/* חץ קטן בצד */}
      <div className="text-gray-300 group-hover:text-primary transition-colors">
        <span className="material-icons-round">chevron_left</span>
      </div>
    </button>
  );
}

export default ParkItem;