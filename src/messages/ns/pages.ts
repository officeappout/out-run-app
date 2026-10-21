/**
 * Namespace `pages`: route pages under src/app whose folder has no owning namespace in
 * docs/i18n/HOW-TO.md §2 (settings screens). See docs/i18n/HOW-TO.md.
 */
import he from '../he/pages.json';
import { defineNamespace } from '@/lib/i18n/catalogs';

export const pages = defineNamespace('pages', he);
