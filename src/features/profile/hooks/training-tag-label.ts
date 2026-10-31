/**
 * AH1: a tag chip's text in the UI language. An id the catalog select does not know (it falls through to
 * `other`, i.e. the raw id) keeps the list's own label, so Hebrew is byte-identical for every id.
 */
export function trainingTagLabel(
  tag: { id: string; label: string },
  t: (key: 'editProfile.tags.option', values: { id: string }) => string,
): string {
  const text = t('editProfile.tags.option', { id: tag.id });
  return text === tag.id ? tag.label : text;
}
