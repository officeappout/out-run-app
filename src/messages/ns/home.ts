/**
 * Namespace `home`: the home screen (src/features/home, src/app/home). See docs/i18n/HOW-TO.md.
 */
import he from '../he/home.json';
import { defineNamespace, type NamespaceKey } from '@/lib/i18n/catalogs';

export const home = defineNamespace('home', he);
export type HomeKey = NamespaceKey<typeof home>;
