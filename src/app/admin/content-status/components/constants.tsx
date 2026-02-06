import React from 'react';
import {
  Home,
  TreePine,
  Building2,
  Building,
  GraduationCap,
  Dumbbell,
  Plane,
} from 'lucide-react';
import { ExecutionLocation, MuscleGroup, MovementGroup, ExerciseRole } from '@/features/content/exercises';

// Location icons mapping
export const LOCATION_ICONS: Record<ExecutionLocation, React.ReactNode> = {
  home: <Home size={16} />,
  park: <TreePine size={16} />,
  street: <Building2 size={16} />,
  office: <Building size={16} />,
  school: <GraduationCap size={16} />,
  gym: <Dumbbell size={16} />,
  airport: <Plane size={16} />,
};

export const LOCATION_LABELS: Record<ExecutionLocation, string> = {
  home: 'בית',
  park: 'פארק',
  street: 'רחוב',
  office: 'משרד',
  school: 'בית ספר',
  gym: 'מכון כושר',
  airport: 'שדה תעופה',
};

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: 'חזה',
  back: 'גב',
  shoulders: 'כתפיים',
  abs: 'בטן',
  obliques: 'אלכסונים',
  forearms: 'אמות',
  biceps: 'דו ראשי',
  triceps: 'שלוש ראשי',
  quads: 'ארבע ראשי',
  hamstrings: 'מיתר',
  glutes: 'ישבן',
  calves: 'שוקיים',
  traps: 'טרפז',
  cardio: 'קרדיו',
  full_body: 'גוף מלא',
  core: 'ליבה',
  legs: 'רגליים',
};

export const MOVEMENT_GROUP_LABELS: Record<MovementGroup, string> = {
  squat: 'סקוואט',
  hinge: 'הינג׳',
  horizontal_push: 'דחיקה אופקית',
  vertical_push: 'דחיקה אנכית',
  horizontal_pull: 'משיכה אופקית',
  vertical_pull: 'משיכה אנכית',
  core: 'ליבה',
  isolation: 'איסוליישן',
};

export const EXERCISE_ROLE_LABELS: Record<ExerciseRole, string> = {
  warmup: 'חימום',
  main: 'עיקרי',
  cooldown: 'קירור',
};
