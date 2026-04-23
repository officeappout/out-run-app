import type { Metadata } from 'next';
import { fetchSharedWorkoutMeta } from './shared-workout-loader';
import WorkoutPreviewClient from './WorkoutPreviewClient';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Dynamic Metadata (OG tags for WhatsApp / Instagram / Twitter previews)
// ---------------------------------------------------------------------------

const DIFFICULTY_HE: Record<number, string> = { 1: 'קל', 2: 'בינוני', 3: 'קשה' };

interface PageProps {
  params: { id: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const meta = await fetchSharedWorkoutMeta(params.id);

  if (!meta) {
    return {
      title: 'אימון | Out',
      description: 'צפו באימון וקפצו להתאמן!',
    };
  }

  const diffLabel = DIFFICULTY_HE[meta.difficulty] || 'בינוני';
  const title = `🔥 הצטרפו לאימון שלי: ${meta.title} | Out`;
  const description = `אימון ${diffLabel} של ${meta.estimatedDuration} דקות. לחצו לצפייה בתרגילים ותתחילו להתאמן!`;

  return {
    title,
    description,
    metadataBase: new URL('https://out-run-app.vercel.app'),
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: 'Out',
      locale: 'he_IL',
      url: `https://out-run-app.vercel.app/workouts/${params.id}`,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

// ---------------------------------------------------------------------------
// Server Component — fetches metadata, renders client UI
// ---------------------------------------------------------------------------

const DIFFICULTY_MAP: Record<number, string> = { 1: 'easy', 2: 'medium', 3: 'hard' };

export default async function WorkoutPage({ params }: PageProps) {
  const meta = await fetchSharedWorkoutMeta(params.id);

  return (
    <WorkoutPreviewClient
      workoutId={params.id}
      serverTitle={meta?.title}
      serverDifficulty={meta ? DIFFICULTY_MAP[meta.difficulty] || 'medium' : undefined}
      serverDuration={meta?.estimatedDuration}
    />
  );
}
