"use client";

import React, { useState, useMemo } from 'react';
import { Route, ActivityType } from '../types/map-objects.type';
// Note: Removed AppMap import as it is rendered by parent (page.tsx)
import RunLapsTable from '@/features/run/components/RunLapsTable';
import { ActiveDashboard } from '@/features/run/components/ActiveDashboard';
import { RunControls } from '@/features/run/components/RunControls';
import { MapPin, Dumbbell, TreePine, Flag } from 'lucide-react';

interface ActiveWorkoutOverlayProps {
  mode: ActivityType;
  startTime: number;
  distance: number;
  averagePace: number; // minutes per km
  route?: Route | null; // For Guided Mode
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onAction: () => void;
  livePath: [number, number][]; // Not used directly in UI anymore, typically used by map
  currentLocation: { lat: number; lng: number } | null;
  isGuidedMode: boolean;
  locationError?: string | null;
  calories?: number;
}

export default function ActiveWorkoutOverlay({
  mode,
  startTime,
  distance,
  averagePace,
  route,
  isPaused,
  onPause,
  onResume,
  onStop,
  onAction,
  //   livePath, // Unused here, passed to map by parent
  currentLocation,
  isGuidedMode,
  locationError,
  calories = 0
}: ActiveWorkoutOverlayProps) {
  const [currentPage, setCurrentPage] = useState<'map' | 'laps'>('map');

  // ✅ Timeline Progress Calculation
  const timelineProgress = useMemo(() => {
    if (!route || !route.distance || route.distance === 0) return 0;
    return Math.min((distance / route.distance) * 100, 100);
  }, [distance, route]);

  // ✅ Timeline Icons Logic
  const timelineSteps = useMemo(() => {
    if (!isGuidedMode || !route) {
      // Free Run: Simple progress indicator
      return [
        { icon: MapPin, label: 'התחלה', isActive: true, isCompleted: false },
        { icon: Flag, label: 'סיום', isActive: false, isCompleted: false }
      ];
    }

    // Guided Mode: 3 steps based on route features
    return [
      { 
        icon: MapPin, 
        label: 'התחלה', 
        isActive: timelineProgress === 0, 
        isCompleted: timelineProgress > 0 
      },
      { 
        icon: route.features?.hasGym ? Dumbbell : TreePine, 
        label: route.features?.hasGym ? 'מתקן כושר' : 'פארק', 
        isActive: timelineProgress > 0 && timelineProgress < 100, 
        isCompleted: timelineProgress >= 50 
      },
      { 
        icon: Flag, 
        label: 'סיום', 
        isActive: timelineProgress >= 100, 
        isCompleted: timelineProgress >= 100 
      }
    ];
  }, [isGuidedMode, route, timelineProgress]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col font-sans pointer-events-none">

      {/* Background: Transparent to show Map, or White for Laps */}
      {currentPage === 'laps' && (
        <div className="absolute inset-0 bg-white z-0 pointer-events-auto" />
      )}

      {/* Header - Minimal and Transparent */}
      <header className="absolute top-0 left-0 right-0 h-14 flex items-center justify-between px-4 z-30 pointer-events-auto">
        <button
          onClick={onStop}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-black/20 backdrop-blur-md text-white shadow-sm active:scale-95 transition-all"
        >
          <span className="material-icons-round text-xl transform rotate-180">arrow_forward</span>
        </button>
        <div className="bg-black/20 backdrop-blur-md px-4 py-1.5 rounded-full text-white text-xs font-bold">
          {isGuidedMode && route ? route.name : 'אימון חופשי'}
        </div>
        <div className="w-10"></div>
      </header>

      {/* View Content */}
      <main className="flex-grow flex flex-col relative w-full h-full">

        {/* HUD Layer (Dashboard) - Only visible on Map view */}
        {currentPage === 'map' && (
          <>
            <ActiveDashboard
              mode={mode}
              startTime={startTime}
              distance={distance}
              averagePace={averagePace}
              calories={calories}
              nextStation={isGuidedMode && route ? "הנקודה הבאה" : undefined}
            />
            
            {/* ✅ Dynamic Timeline - Only show in Guided Mode */}
            {isGuidedMode && route && (
              <div className="absolute bottom-32 left-0 right-0 px-4 z-30 pointer-events-none">
                <div className="bg-black/60 backdrop-blur-md rounded-2xl p-4 mx-auto max-w-md pointer-events-auto">
                  {/* Progress Bar */}
                  <div className="w-full h-1.5 bg-white/20 rounded-full mb-4 overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-500 ease-out"
                      style={{ width: `${timelineProgress}%` }}
                    />
                  </div>
                  
                  {/* Timeline Steps */}
                  <div className="flex justify-between items-center relative">
                    {/* Connector Lines */}
                    <div className="absolute top-6 left-0 right-0 h-0.5 bg-white/10 -z-10" />
                    
                    {timelineSteps.map((step, index) => {
                      const Icon = step.icon;
                      const isActiveStep = step.isActive || step.isCompleted;
                      
                      return (
                        <div key={index} className="flex flex-col items-center gap-2 relative z-10">
                          {/* Icon Circle */}
                          <div 
                            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${
                              step.isCompleted 
                                ? 'bg-green-500 shadow-lg shadow-green-500/50' 
                                : step.isActive 
                                ? 'bg-cyan-500 shadow-lg shadow-cyan-500/50 scale-110' 
                                : 'bg-white/20'
                            }`}
                          >
                            <Icon 
                              size={20} 
                              className={`${
                                step.isCompleted || step.isActive ? 'text-white' : 'text-white/40'
                              }`}
                            />
                          </div>
                          
                          {/* Label */}
                          <span className={`text-[10px] font-bold text-center ${
                            step.isActive ? 'text-white' : 'text-white/60'
                          }`}>
                            {step.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Laps Table Layer */}
        {currentPage === 'laps' && (
          <div className="absolute inset-0 pt-20 pb-32 overflow-y-auto pointer-events-auto px-4">
            <RunLapsTable />
          </div>
        )}

        {/* Location Error Banner */}
        {locationError && currentPage === 'map' && (
          <div className="absolute top-32 left-4 right-4 p-3 bg-red-500/90 backdrop-blur text-white rounded-xl text-center z-20 pointer-events-auto">
            <p className="text-sm font-bold">{locationError}</p>
          </div>
        )}

        {/* Controls - Always Visible (conditionally styled?) */}
        <RunControls
          isPaused={isPaused}
          onPause={onPause}
          onResume={onResume}
          onStop={onStop}
          onAction={onAction}
        />

        {/* Map Attribution */}
        {currentPage === 'map' && (
          <div className="absolute bottom-24 right-2 text-[10px] text-white/50 pointer-events-none z-10">
            OutRun AI
          </div>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/80 to-transparent flex items-end pb-4 justify-center gap-8 pointer-events-auto z-40">
        <button
          onClick={() => setCurrentPage('map')}
          className={`flex flex-col items-center gap-1 transition-all duration-200 ${currentPage === 'map' ? 'text-cyan-400 scale-110' : 'text-white/60 hover:text-white'
            }`}
        >
          <span className="material-icons-round text-2xl">map</span>
          <span className="text-[10px] font-bold">MAP</span>
        </button>

        <div className="w-[1px] h-8 bg-white/10"></div>

        <button
          onClick={() => setCurrentPage('laps')}
          className={`flex flex-col items-center gap-1 transition-all duration-200 ${currentPage === 'laps' ? 'text-cyan-400 scale-110' : 'text-white/60 hover:text-white'
            }`}
        >
          <span className="material-icons-round text-2xl">format_list_bulleted</span>
          <span className="text-[10px] font-bold">LAPS</span>
        </button>
      </nav>
    </div>
  );
}
