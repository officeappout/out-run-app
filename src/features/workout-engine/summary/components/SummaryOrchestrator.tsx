'use client';

import { motion } from 'framer-motion';
import SummaryHeader from './shared/SummaryHeader';
import MainStatsGrid from './shared/MainStatsGrid';
import DopamineStreakBlock from './shared/DopamineStreakBlock';
import RunMapBlock from './running/RunMapBlock';
import LapTableBlock from './running/LapTableBlock';
import { Lap } from '@/features/workout-engine/core/types/session.types';

export interface WorkoutData {
  time: number; // seconds
  distance: number; // km
  calories: number;
  routeCoords: number[][]; // [[lng, lat], ...]
  laps: Lap[];
  date?: Date;
  title?: string;
  motivationalMessage?: string;
}

export type WorkoutType = 'FREE_RUN' | 'PLAN_RUN' | 'GUIDED_RUN' | 'STRENGTH' | 'HYBRID';

interface SummaryOrchestratorProps {
  workoutData: WorkoutData;
  workoutType: WorkoutType;
  streakDays?: number;
}

export default function SummaryOrchestrator({
  workoutData,
  workoutType,
  streakDays = 0,
}: SummaryOrchestratorProps) {
  // Extract start and end coordinates for map markers
  const startCoord =
    workoutData.routeCoords.length > 0 ? workoutData.routeCoords[0] : undefined;
  const endCoord =
    workoutData.routeCoords.length > 0
      ? workoutData.routeCoords[workoutData.routeCoords.length - 1]
      : undefined;

  // Render blocks based on workout type
  const renderBlocks = () => {
    switch (workoutType) {
      case 'FREE_RUN':
        return (
          <>
            <SummaryHeader
              title={workoutData.title}
              date={workoutData.date}
              motivationalMessage={workoutData.motivationalMessage}
            />
            <RunMapBlock
              routeCoords={workoutData.routeCoords}
              startCoord={startCoord}
              endCoord={endCoord}
            />
            <MainStatsGrid
              time={workoutData.time}
              distance={workoutData.distance}
              calories={workoutData.calories}
            />
            {workoutData.laps.length > 0 && (
              <LapTableBlock laps={workoutData.laps} />
            )}
            {streakDays > 0 && <DopamineStreakBlock streakDays={streakDays} />}
          </>
        );

      case 'PLAN_RUN':
      case 'GUIDED_RUN':
        return (
          <>
            <SummaryHeader
              title={workoutData.title}
              date={workoutData.date}
              motivationalMessage={workoutData.motivationalMessage}
            />
            <RunMapBlock
              routeCoords={workoutData.routeCoords}
              startCoord={startCoord}
              endCoord={endCoord}
            />
            <MainStatsGrid
              time={workoutData.time}
              distance={workoutData.distance}
              calories={workoutData.calories}
            />
            {workoutData.laps.length > 0 && (
              <LapTableBlock laps={workoutData.laps} />
            )}
            {streakDays > 0 && <DopamineStreakBlock streakDays={streakDays} />}
          </>
        );

      case 'STRENGTH':
      case 'HYBRID':
        return (
          <>
            <SummaryHeader
              title={workoutData.title}
              date={workoutData.date}
              motivationalMessage={workoutData.motivationalMessage}
            />
            <MainStatsGrid
              time={workoutData.time}
              distance={workoutData.distance}
              calories={workoutData.calories}
            />
            {streakDays > 0 && <DopamineStreakBlock streakDays={streakDays} />}
          </>
        );

      default:
        return (
          <>
            <SummaryHeader
              title={workoutData.title}
              date={workoutData.date}
              motivationalMessage={workoutData.motivationalMessage}
            />
            <MainStatsGrid
              time={workoutData.time}
              distance={workoutData.distance}
              calories={workoutData.calories}
            />
            {streakDays > 0 && <DopamineStreakBlock streakDays={streakDays} />}
          </>
        );
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6" dir="rtl">
      {renderBlocks()}
    </div>
  );
}
