/** The park name to SHOW: `nameEn` in English mode when the park has one, else the Hebrew `name` (the data). */
export function parkDisplayName(park: { name?: string | null; nameEn?: string | null } | null | undefined, lang: string): string {
  if (!park) return '';
  return (lang === 'en' && park.nameEn?.trim()) || park.name || '';
}
