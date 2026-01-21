import React from 'react';
import { XCircle } from 'lucide-react'; // וודא שיש לך lucide-react מותקן

interface BlockingErrorModalProps {
  isOpen: boolean;
  onBack: () => void;
}

export default function BlockingErrorModal({ isOpen, onBack }: BlockingErrorModalProps) {
  // אם המודל לא אמור להיות פתוח - אל תציג כלום
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" dir="rtl">
      
      {/* כרטיס המודל */}
      <div className="bg-white rounded-3xl w-full max-w-sm p-8 shadow-2xl animate-in zoom-in-95 duration-200">
        
        <div className="flex flex-col items-center text-center space-y-4">
          
          {/* אייקון אדום גדול */}
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center text-red-500 shadow-sm">
            <XCircle size={48} strokeWidth={1.5} />
          </div>
          
          {/* כותרת */}
          <h3 className="text-2xl font-bold text-gray-900">
            לא ניתן להמשיך
          </h3>
          
          {/* הסבר */}
          <div className="text-gray-600 leading-relaxed space-y-2">
            <p>
              תודה על הכנות. הבריאות שלך חשובה לנו יותר מהכל.
            </p>
            <p className="text-sm">
              מכיוון שסימנת שיש לך מגבלה רפואית, האפליקציה במתכונתה הנוכחית אינה מתאימה לך ללא אישור והשגחה רפואית צמודה.
            </p>
          </div>

          {/* כפתור חזרה */}
          <button
            onClick={onBack}
            className="w-full bg-gray-900 text-white font-bold py-4 rounded-2xl hover:bg-gray-800 transition-all shadow-lg shadow-gray-200 mt-4 active:scale-95"
          >
            הבנתי, חזרה לתשובות
          </button>
        </div>

      </div>
    </div>
  );
}