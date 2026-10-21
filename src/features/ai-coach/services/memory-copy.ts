/**
 * "מה קלי זוכר" — the empty state's copy (K0 F8). The screen used to say only "קלי עוד לא
 * זוכר שום דבר", with no hint that memory is written once a night, from what the user told
 * Kelly about themself, and that the plan / levels / training days are NOT kept here (Kelly
 * reads those from the app on every message). Gender-free wording (impersonal), so no gender
 * branch is needed. The text lives in the `coach` catalog (src/messages/he/coach.json); these are
 * its keys (i18n wave 2 batch w).
 */
export const MEMORY_EMPTY_TITLE_KEY = 'memory.empty.title' as const;

export const MEMORY_EMPTY_EXPLAINER_KEY = 'memory.empty.explainer' as const;
