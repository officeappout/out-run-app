/**
 * API Route: Export all exercises as CSV
 * GET /api/admin/exercises/export
 *
 * Returns a CSV file with exercise data for admin use.
 */

import { NextResponse } from 'next/server';
import { getAllExercises } from '@/features/content/exercises';
import { getLocalizedText } from '@/features/content/exercises/core/exercise.types';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';

const CSV_HEADERS = [
  'id',
  'name',
  'primaryMuscle',
  'movementType',
  'targetPrograms',
  'equipmentRequirements',
  'recommendedLevel',
  'tags',
] as const;

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatTargetPrograms(targetPrograms?: { programId: string; level: number }[]): string {
  if (!targetPrograms?.length) return '';
  return targetPrograms.map((tp) => `${tp.programId}:${tp.level}`).join('; ');
}

function formatEquipmentRequirements(exercise: Exercise): string {
  const parts: string[] = [];

  if (exercise.equipment?.length) {
    parts.push(...exercise.equipment);
  }
  if (exercise.requiredGymEquipment) {
    parts.push(`gym:${exercise.requiredGymEquipment}`);
  }
  if (exercise.requiredUserGear?.length) {
    parts.push(...exercise.requiredUserGear.map((g) => `gear:${g}`));
  }
  if (exercise.alternativeEquipmentRequirements?.length) {
    const alt = exercise.alternativeEquipmentRequirements
      .map((a) => {
        const val = a.equipmentId ?? a.gearId ?? a.urbanAssetName ?? '';
        return val ? `${a.type}:${val}` : '';
      })
      .filter(Boolean);
    parts.push(...alt);
  }

  return parts.join('; ');
}

function getRecommendedLevel(exercise: Exercise): string {
  if (exercise.recommendedLevel != null) {
    return String(exercise.recommendedLevel);
  }
  const levels = exercise.targetPrograms?.map((tp) => tp.level).filter((l) => l != null);
  if (levels?.length) {
    return String(Math.min(...levels));
  }
  return '';
}

function exerciseToCsvRow(exercise: Exercise): string {
  const name = getLocalizedText(exercise.name, 'he') || getLocalizedText(exercise.name, 'en') || '';
  const primaryMuscle = exercise.primaryMuscle ?? '';
  const movementType = exercise.movementType ?? '';
  const targetPrograms = formatTargetPrograms(exercise.targetPrograms);
  const equipmentRequirements = formatEquipmentRequirements(exercise);
  const recommendedLevel = getRecommendedLevel(exercise);
  const tags = exercise.tags?.join('; ') ?? '';

  return [
    escapeCsv(exercise.id),
    escapeCsv(name),
    escapeCsv(primaryMuscle),
    escapeCsv(movementType),
    escapeCsv(targetPrograms),
    escapeCsv(equipmentRequirements),
    escapeCsv(recommendedLevel),
    escapeCsv(tags),
  ].join(',');
}

export async function GET() {
  try {
    const exercises = await getAllExercises();
    const headerRow = CSV_HEADERS.join(',');
    const dataRows = exercises.map(exerciseToCsvRow);
    const csv = [headerRow, ...dataRows].join('\n');

    const filename = `exercises-export-${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('[API] Error exporting exercises:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to export exercises' },
      { status: 500 }
    );
  }
}
