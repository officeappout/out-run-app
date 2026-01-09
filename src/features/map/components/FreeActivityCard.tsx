import React from 'react';

export const FreeActivityCard = ({ onStart }: { onStart: () => void }) => {
  return (
    <div className="w-full bg-white dark:bg-gray-800 rounded-t-3xl shadow-[0_-5px_20px_rgba(0,0,0,0.1)] p-6 pb-8">
      <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">ריצה חופשית</h2>
      <p className="text-gray-500 text-sm mb-6">צא לדרך, אנחנו נמדוד את השאר.</p>
      <button 
        onClick={onStart}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-bold text-lg shadow-lg flex items-center justify-center transition-transform active:scale-95"
      >
        התחל אימון 🚀
      </button>
    </div>
  );
};