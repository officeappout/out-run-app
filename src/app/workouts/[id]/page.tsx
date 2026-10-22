import type { Metadata } from 'next';
import { fetchSharedWorkoutMeta } from './shared-workout-loader';
import WorkoutPreviewClient from './WorkoutPreviewClient';
import { APP_ORIGIN } from '@/lib/config/domain';
import { makeT } from '@/lib/i18n/t';
import { SOURCE_LOCALE } from '@/lib/i18n/locales';
import { library } from '@/messages/ns/library';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Dynamic Metadata (OG tags for WhatsApp / Instagram / Twitter previews)
// ---------------------------------------------------------------------------

// Crawlers (WhatsApp / Instagram / Twitter) carry no user, cookie or app locale: the share preview is
// rendered in the source locale, like the other server pages (privacy / accessibility / delete-data).
const pageT = () => makeT(SOURCE_LOCALE, library);

interface PageProps {
  params: { id: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const meta = await fetchSharedWorkoutMeta(params.id);
  const t = pageT();

  if (!meta) {
    return {
      title: t('sharedWorkout.meta.fallbackTitle'),
      description: t('sharedWorkout.meta.fallbackDescription'),
    };
  }

  const title = t('sharedWorkout.meta.title', { title: meta.title });
  const description = t('sharedWorkout.meta.description', {
    difficulty: String(meta.difficulty),
    minutes: String(meta.estimatedDuration),
  });

  return {
    title,
    description,
    metadataBase: new URL(APP_ORIGIN),
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: 'Out',
      locale: 'he_IL',
      url: `${APP_ORIGIN}/workouts/${params.id}`,
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
