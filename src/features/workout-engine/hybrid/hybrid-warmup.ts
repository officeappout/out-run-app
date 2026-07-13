/**
 * hybrid-warmup — warm the runtime caches the hybrid composition path needs (Phase א fix).
 *
 * The hybrid path bypasses home-workout.service, so neither the equipment cache
 * NOR the program id→slug map get warmed at startup. Without them:
 *   • normalizeGearId can't translate Firestore equipment ids → empty station;
 *   • resolveToSlug returns NULL ("map was never built") → station level/program
 *     filtering is broken.
 * Warm BOTH before composeHybridSession — never touches home-workout.service.
 */

let programsWarmed = false;

export async function warmHybridCaches(): Promise<void> {
  const { ensureEquipmentCachesLoaded } = await import(
    '@/features/workout-engine/shared/utils/gear-mapping.utils'
  );
  await ensureEquipmentCachesLoaded();

  if (programsWarmed) return;
  try {
    const { getAllPrograms } = await import('@/features/content/programs/core/program.service');
    const { buildIdToSlugMapFromPrograms } = await import(
      '@/features/workout-engine/services/program-hierarchy.utils'
    );
    buildIdToSlugMapFromPrograms(await getAllPrograms());
    programsWarmed = true;
  } catch (e) {
    console.error('[warmHybridCaches] program id→slug map warm failed', e);
  }
}
