/** Namespace `library`: library, content and search screens. See docs/i18n/HOW-TO.md. */
import he from '../he/library.json';
import { defineNamespace, type NamespaceKey } from '@/lib/i18n/catalogs';
import type { MessageValues } from '@/lib/i18n/core/i18n-core';

export const library = defineNamespace('library', he);

/** A `library` key — for constant maps that hold a key and translate at render. */
export type LibraryKey = NamespaceKey<typeof library>;

/** A `library` translator handed to a pure helper (the caller's `useT(library)`). */
export type LibraryT = (key: LibraryKey, values?: MessageValues) => string;
