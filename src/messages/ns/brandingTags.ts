/** Namespace `brandingTags`: the words the content @tags resolve to (tag names stay Hebrew). See docs/i18n/HOW-TO.md. */
import he from '../he/brandingTags.json';
import { defineNamespace } from '@/lib/i18n/catalogs';

export const brandingTags = defineNamespace('brandingTags', he);
