import React from 'react';

interface RunControlsProps {
    isPaused: boolean;
    onPause: () => void;
    onResume: () => void;
    onStop: () => void;
    onAction: () => void; // Used for "Lap" or other action
}

export const RunControls: React.FC<RunControlsProps> = ({
    isPaused,
    onPause,
    onResume,
    onStop,
    onAction
}) => {
    return (
        <div className="absolute bottom-10 left-0 right-0 px-8 flex items-end justify-between z-30 pointer-events-auto" dir="ltr">

            {/* Main Toggle (Play/Pause) */}
            <button
                onClick={isPaused ? onResume : onPause}
                className={`group w-20 h-20 rounded-full flex items-center justify-center shadow-xl transform active:scale-95 transition-all border-4 border-white/20 backdrop-blur-sm ${isPaused
                        ? 'bg-emerald-500 hover:bg-emerald-400 shadow-emerald-500/40'
                        : 'bg-orange-500 hover:bg-orange-400 shadow-orange-500/40'
                    }`}
            >
                <span className="material-icons-round text-5xl text-white">
                    {isPaused ? 'play_arrow' : 'pause'}
                </span>
            </button>

            {/* Stop / Finish (Only visible when paused?) - Or always accessible? 
            Let's keep it accessible but maybe highlighted when paused. */}
            <button
                onClick={onStop}
                className="group w-16 h-16 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center shadow-lg shadow-red-500/40 transform active:scale-95 transition-all border-4 border-white/20 backdrop-blur-sm"
            >
                <div className="w-6 h-6 bg-white rounded-sm"></div>
            </button>

            {/* Lap / Action */}
            <button
                onClick={onAction}
                className="group w-14 h-14 rounded-full bg-cyan-500 hover:bg-cyan-400 flex items-center justify-center shadow-lg shadow-cyan-500/40 transform active:scale-95 transition-all border-4 border-white/20 backdrop-blur-sm mb-1"
            >
                <span className="material-icons-round text-3xl font-bold text-white">cached</span>
            </button>

        </div>
    );
};
