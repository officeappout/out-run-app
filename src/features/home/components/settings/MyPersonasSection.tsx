'use client';

import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { useUserStore } from '@/features/user';
import type { PersonaId, AnyPersonaEntry } from '@/types/persona.types';
import { PERSONA_QUESTIONS } from '@/types/persona-question.types';
import { LIFESTYLE_LABELS } from '@/features/workout-engine/logic/contextual-engine.types';
import { LIFESTYLE_OPTIONS, resolvePersonaEmoji } from '@/features/user/onboarding/components/steps/PersonaStep';
import { addPersona, removePersona } from '@/features/user/identity/services/persona-answers.service';
import { useResolvedPersonaSummary } from '@/features/user/identity/hooks/useResolvedPersonaSummary';
import PersonaQuestionsDrawer from '@/features/user/onboarding/components/PersonaQuestionsDrawer';
import { useToast } from '@/components/ui/Toast';
import UnitIconBadge from '@/components/ui/UnitIconBadge';

const ALL_PERSONA_IDS = Object.keys(LIFESTYLE_LABELS) as PersonaId[];
const LIFESTYLE_OPTION_BY_ID = new Map(LIFESTYLE_OPTIONS.map((o) => [o.id, o]));

function PersonaRow({
  entry,
  refreshKey,
  onEdit,
  onRemove,
}: {
  entry: AnyPersonaEntry;
  refreshKey: number;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const uid = auth.currentUser?.uid;
  const summary = useResolvedPersonaSummary(uid, entry, refreshKey);
  const hasQuestions = (PERSONA_QUESTIONS[entry.id]?.length ?? 0) > 0;

  const sublabel = !hasQuestions
    ? undefined
    : summary.loading
    ? 'טוען...'
    : !summary.resolved
    ? 'היחידה כבר לא קיימת — הקש לעדכון'
    : !summary.isComplete
    ? 'טרם הושלם — הקש להשלמה'
    : summary.parts.join(' · ');

  return (
    <div className="flex items-center gap-2">
      {hasQuestions ? (
        <button
          type="button"
          onClick={onEdit}
          className="flex-1 flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-gray-100 active:scale-[0.98] transition-transform text-start"
        >
          <div className="flex items-center gap-3 min-w-0">
            {/* 07.09.2026 — the one place a user's OWN declared unit shows
                back to them, and the one place UnitIconBadge was missing
                entirely (not even the hash fallback). Only shown once
                something real resolved — no badge during loading/pending/
                stale states, matching sublabel's own guards below. */}
            {summary.icon && (
              <UnitIconBadge unitId={summary.icon.unitId} iconUrl={summary.icon.iconUrl} name={summary.icon.name} size={36} />
            )}
            <div className="text-right min-w-0">
              <p className="text-sm font-semibold text-gray-900">{LIFESTYLE_LABELS[entry.id]}</p>
              {sublabel && (
                <p className={`text-xs mt-0.5 truncate ${!summary.resolved || !summary.isComplete ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}>
                  {sublabel}
                </p>
              )}
            </div>
          </div>
        </button>
      ) : (
        <div className="flex-1 px-4 py-3 bg-white rounded-xl border border-gray-100">
          <p className="text-sm font-semibold text-gray-900">{LIFESTYLE_LABELS[entry.id]}</p>
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="p-2.5 rounded-xl text-gray-300 active:scale-90 transition-transform"
        aria-label={`הסר ${LIFESTYLE_LABELS[entry.id]}`}
      >
        <X size={16} />
      </button>
    </div>
  );
}

/**
 * "הפרסונות שלי" — Phase 5, docs/research/military-persona-unified-architecture.md
 * §5. Lists every persona the user has, generic across all of them: driven
 * by `profile.personas[]` + `PERSONA_QUESTIONS` config, no `personaId`
 * comparison anywhere in this file. A future persona that reuses an
 * existing question type appears here correctly via config alone — the
 * same promise PersonaQuestionsDrawer and savePersonaAnswers() already hold.
 *
 * Mounted inside SettingsModal.tsx's "חשבון" section, next to the existing
 * "פרטים אישיים" row (same place city/neighborhood are already edited —
 * not a new screen).
 */
export default function MyPersonasSection() {
  const { profile, refreshProfile } = useUserStore();
  const { showToast } = useToast();
  const [editingPersonaId, setEditingPersonaId] = useState<PersonaId | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState<PersonaId | null>(null);
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  // Bumped on the drawer's onComplete — uid/personaId alone don't change
  // when the same user re-edits the same persona, so useResolvedPersonaSummary
  // needs an explicit trigger to refetch (see its own refreshKey doc).
  const [refreshKey, setRefreshKey] = useState(0);

  const personas = profile?.personas ?? [];
  const addableIds = ALL_PERSONA_IDS.filter((id) => !personas.some((p) => p.id === id));

  const handleAdd = async (personaId: PersonaId) => {
    const uid = auth.currentUser?.uid;
    if (!uid || busy) return;
    setBusy(true);
    try {
      await addPersona(uid, personaId);
      await refreshProfile();
      setShowAddPicker(false);
      // David's production test (03.09.2026): picking a persona gave no
      // signal it was received — the picker just closed, and the new row
      // silently appeared behind it. A toast always fires here so the
      // add is confirmed even when there's no follow-up drawer to make it
      // obvious (e.g. "אבא", no configured questions).
      showToast('success', `${LIFESTYLE_LABELS[personaId]} נוספה`);
      // Same UX as onboarding's PersonaStep: a newly-added persona with
      // configured questions opens its drawer immediately, not a second,
      // separate flow.
      if ((PERSONA_QUESTIONS[personaId]?.length ?? 0) > 0) {
        setEditingPersonaId(personaId);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmRemove = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !confirmingRemove || busy) return;
    setBusy(true);
    try {
      await removePersona(uid, confirmingRemove);
      await refreshProfile();
      setConfirmingRemove(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div dir="rtl" className="pt-1">
      <p className="text-sm font-bold text-gray-900 mb-1 px-1">הפרסונות שלי</p>
      <p className="text-xs text-gray-400 mb-2 px-1">הפרטים כאן פרטיים ולא מופיעים בפרופיל הציבורי שלך.</p>
      <div className="flex flex-col gap-2">
        {personas.map((entry) => (
          <PersonaRow
            key={entry.id}
            entry={entry}
            refreshKey={refreshKey}
            onEdit={() => setEditingPersonaId(entry.id)}
            onRemove={() => setConfirmingRemove(entry.id)}
          />
        ))}

        {addableIds.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAddPicker(true)}
            className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl border-2 border-dashed border-gray-200 text-sm font-semibold text-gray-400 active:scale-[0.98] transition-transform"
          >
            <Plus size={16} />
            <span>הוסף פרסונה</span>
          </button>
        )}
      </div>

      {editingPersonaId && (
        <PersonaQuestionsDrawer
          personaId={editingPersonaId}
          isOpen={!!editingPersonaId}
          onComplete={async () => {
            setEditingPersonaId(null);
            // Refresh the store BEFORE bumping refreshKey: for non-sensitive
            // personas the real answers live on profile.personas[].answers
            // itself, which useResolvedPersonaSummary reads via the `entry`
            // prop (excluded from its own effect deps by design) — the row
            // needs the fresh entry object in hand by the time refreshKey
            // triggers its refetch, not a stale one from before this save.
            await refreshProfile();
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

      {showAddPicker && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center" onClick={() => setShowAddPicker(false)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div
            className="relative w-full bg-white rounded-t-3xl p-5 max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-gray-900 mb-4">הוסף פרסונה</h3>
            <div className="flex flex-col gap-2">
              {addableIds.map((id) => {
                const option = LIFESTYLE_OPTION_BY_ID.get(id);
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={busy}
                    onClick={() => handleAdd(id)}
                    className="flex items-center gap-2.5 px-4 py-3 rounded-xl border-2 border-gray-200 text-right text-sm font-semibold text-gray-900 active:scale-[0.98] transition-transform disabled:opacity-50"
                  >
                    {/* Same emoji assets as the onboarding persona cards
                        (PersonaStep.tsx's LIFESTYLE_OPTIONS) — not a new
                        icon set, per David's 03.09.2026 note. */}
                    {option && <span className="text-xl flex-shrink-0">{resolvePersonaEmoji(option, profile?.core?.gender)}</span>}
                    <span>{LIFESTYLE_LABELS[id]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {confirmingRemove && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-5" onClick={() => setConfirmingRemove(null)}>
          <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm bg-white rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-gray-900 mb-4 text-center">
              {(PERSONA_QUESTIONS[confirmingRemove]?.length ?? 0) > 0
                ? `הסרת ${LIFESTYLE_LABELS[confirmingRemove]} תמחק גם את הפרטים שמילאת. להסיר?`
                : `להסיר את ${LIFESTYLE_LABELS[confirmingRemove]}?`}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmingRemove(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700"
              >
                ביטול
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleConfirmRemove}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold disabled:opacity-50"
              >
                הסר
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
