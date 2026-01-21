import React, { useEffect, useRef } from 'react';
import { HEALTH_QUESTIONS, LEGAL_TEXT } from '../data/health-questions';
import SignaturePad from './SignaturePad';

interface HealthDeclarationProps {
  value: Record<string, boolean>; 
  onChange: (answers: Record<string, boolean>) => void;
  isSigned: boolean; // בוליאני רק לצורך תצוגה (האם יש חתימה)
  onSignatureChange: (signatureData: string | null) => void; // מקבל את מחרוזת התמונה
}

export default function HealthDeclaration({ 
  value, 
  onChange, 
  isSigned, 
  onSignatureChange 
}: HealthDeclarationProps) {

  // רפרנס לאזור החתימה לצורך גלילה אוטומטית
  const signatureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // אתחול תשובות ל-False אם טרם אותחלו
    if (!value || Object.keys(value).length === 0) {
      const initial = HEALTH_QUESTIONS.reduce((acc, q) => ({
        ...acc, 
        [q.id]: false 
      }), {} as Record<string, boolean>);
      
      onChange(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAnswer = (id: string, answerIsYes: boolean) => {
    const currentValues = value || {};
    onChange({
      ...currentValues,
      [id]: answerIsYes
    });

    // --- לוגיקת גלילה אוטומטית ---
    // אם זו השאלה האחרונה ברשימה, נגלול בעדינות אל החתימה
    const lastQuestionId = HEALTH_QUESTIONS[HEALTH_QUESTIONS.length - 1].id;
    if (id === lastQuestionId) {
      setTimeout(() => {
        signatureRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }, 100);
    }
  };

  return (
    <div className="flex flex-col h-full w-full relative" dir="rtl">
      
      <div className="flex-1 overflow-y-auto px-1 pb-4 space-y-8 scroll-smooth">
        
        {/* טקסט פתיחה */}
        <div className="text-sm text-gray-600 space-y-2 px-1">
          <p>כל המידע שתמלא נשמר באופן פרטי ומאובטח, ומשמש רק לצורך התאמת התוכנית עבורך.</p>
          <p className="font-medium text-gray-800">אם התשובה לאחת השאלות תצביע על בעיה רפואית, לא תוכל להירשם לאפליקציה.</p>
        </div>

        {/* רשימת השאלות */}
        <div className="space-y-8">
          {HEALTH_QUESTIONS.map((q) => {
            const isYes = value?.[q.id] === true;
            const isNo = value?.[q.id] === false;

            return (
              <div key={q.id} className="space-y-3">
                <p className="text-gray-800 font-medium leading-relaxed">
                  {q.text}
                </p>
                
                <div className="flex gap-3">
                  <button
                    onClick={() => handleAnswer(q.id, false)}
                    className={`flex-1 py-2.5 rounded-full border transition-all font-medium
                      ${isNo 
                        ? 'bg-blue-50 border-blue-400 text-blue-600 ring-1 ring-blue-400' 
                        : 'bg-white border-gray-300 text-gray-500'}`}
                  >
                    לא
                  </button>

                  <button
                    onClick={() => handleAnswer(q.id, true)}
                    className={`flex-1 py-2.5 rounded-full border transition-all font-medium
                      ${isYes 
                        ? 'bg-red-50 border-red-400 text-red-600 ring-1 ring-red-400' 
                        : 'bg-white border-gray-300 text-gray-500'}`}
                  >
                    כן
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* --- אזור החתימה החדש --- */}
        <div ref={signatureRef} className="mt-8 pt-6 border-t border-gray-100">
           <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-4">
              
              <div className="space-y-2">
                 <h3 className="font-bold text-gray-900">חתימה על הצהרת בריאות</h3>
                 <p className="text-xs text-gray-500 leading-relaxed text-justify">
                   {LEGAL_TEXT}
                 </p>
              </div>

              {/* רכיב הציור (מחליף את הצ'קבוקס) */}
              <SignaturePad 
                onEnd={(data) => onSignatureChange(data)} 
              />
              
              {/* אינדיקציה חזותית */}
              <div className={`text-xs text-center transition-colors ${isSigned ? 'text-green-600 font-bold' : 'text-gray-400'}`}>
                {isSigned ? '✓ החתימה התקבלה' : 'יש לחתום בתיבה למעלה'}
              </div>

           </div>
        </div>
        
        {/* רווח תחתון כדי שהכפתור הצף לא יסתיר */}
        <div className="h-24"></div>
      </div>
    </div>
  );
}