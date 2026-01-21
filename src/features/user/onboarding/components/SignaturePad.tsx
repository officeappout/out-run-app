import React, { useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { RefreshCcw } from 'lucide-react';

interface SignaturePadProps {
  onEnd: (signatureData: string | null) => void;
}

export default function SignaturePad({ onEnd }: SignaturePadProps) {
  const sigPad = useRef<SignatureCanvas>(null);

  const clear = () => {
    sigPad.current?.clear();
    onEnd(null); // מאפס את החתימה
  };

  const handleEnd = () => {
    // בדיקה שיש רכיב ושלא ריק
    if (sigPad.current && !sigPad.current.isEmpty()) {
      // --- התיקון כאן ---
      // במקום getTrimmedCanvas().toDataURL()
      // אנחנו משתמשים בפונקציה הישירה והבטוחה יותר:
      const data = sigPad.current.toDataURL('image/png');
      onEnd(data);
    }
  };

  return (
    <div className="w-full" dir="ltr"> {/* ltr חשוב כדי שהקנבס יעבוד טוב */}
      <div className="relative border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 hover:border-blue-400 transition-colors">
        
        <SignatureCanvas 
          ref={sigPad}
          penColor="black"
          canvasProps={{
            className: 'w-full h-40 rounded-xl cursor-crosshair block',
          }}
          onEnd={handleEnd}
        />

        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none text-gray-300 text-sm select-none">
          חתום כאן עם האצבע
        </div>

        <button 
          onClick={clear}
          className="absolute top-2 right-2 p-1.5 bg-white shadow-sm rounded-full text-gray-500 hover:text-red-500 border border-gray-200 z-10"
          title="נקה חתימה"
          type="button" // חשוב כדי שלא ירפרש את הטופס
        >
          <RefreshCcw size={16} />
        </button>
      </div>
    </div>
  );
}