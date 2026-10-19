'use client';

/**
 * EditProfileModal — consolidated "עריכת פרופיל" screen.
 *
 * "פרופיל חלק" Part 2: scoped down to PUBLIC presentation only — photo,
 * name, bio, training tags. Personal details (city/neighborhood/weight/DOB)
 * moved out entirely; they're private, not public-presentation, and already
 * live in SettingsModal (same usePersonalInfoEditor hook). A dedicated flat
 * "פרטים אישיים" screen is planned for the Settings redesign (Part 3) — this
 * screen does not attempt to be that.
 *
 * Still powered by usePersonalInfoEditor — the SAME hook SettingsModal
 * uses — so there is exactly one save path for this data, not two. This
 * component only lays out JSX; see that hook for the actual staged-edit/
 * save logic. Because savePersonalEdit() only ever includes a field in its
 * Firestore update when the staged value actually differs from the stored
 * one (see that function's own diff-checks), and openPersonalEdit() still
 * seeds weight/DOB/neighborhood from the profile on open even though this
 * screen no longer renders controls for them, those fields are seeded but
 * never mutated here — the diff is always "unchanged," so they're silently
 * never included on save. No hook change was needed to make this safe; this
 * screen just stopped rendering (and therefore stopped touching) that part
 * of the hook's state.
 *
 * Explicitly OUT of scope this round (approved: bio + training tags only,
 * not the full dating-layer mockup): relationship status, "what I'm looking
 * for", the opener prompt, and the 18+ visibility toggle. No UI for any of
 * those exists here — do not add it without separate approval.
 */
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Loader2 } from 'lucide-react';
import ProfilePhotoUploader from '@/components/ui/ProfilePhotoUploader';
import { useUserStore } from '@/features/user';
import { usePersonalInfoEditor, TRAINING_TAG_OPTIONS } from '@/features/profile/hooks/usePersonalInfoEditor';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import Sheet from '@/components/ui/v2/Sheet';
import IconButton from '@/components/ui/v2/IconButton';
import { SHEET_Z } from '@/components/ui/v2/tokens';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Bug fix (smoke test, round 6): none of this modal's inputs/textarea had
// an explicit text color, so on any device in dark mode they inherited
// globals.css's `body { color: var(--foreground) }` — which the
// `prefers-color-scheme: dark` media query there sets to #ededed (near
// white) — rendering invisible text on these light-background fields.
// -webkit-text-fill-color is set too: iOS Safari/WKWebView can apply its
// own text-fill color to form controls independent of `color`, so both
// must be pinned for this to be reliably fixed on iPhone specifically.
const INPUT_TEXT_FIX: React.CSSProperties = { color: '#111827', WebkitTextFillColor: '#111827' };
// text-base (16px), not text-sm (14px) — iOS Safari auto-zooms the whole
// viewport on focus of any text input under 16px (a built-in accessibility
// heuristic so the keyboard-covered text stays readable). Fixing the
// font-size is the correct fix; the viewport meta/maximum-scale must NOT
// be touched to suppress this, since that breaks pinch-zoom accessibility
// for everyone, not just this one screen. Applied here (not per-input) so
// every consumer of INPUT_TEXT_CLASS gets it uniformly.
const INPUT_TEXT_CLASS = 'text-base text-gray-900 placeholder:text-gray-400';

export default function EditProfileModal({ isOpen, onClose }: EditProfileModalProps) {
  const { profile } = useUserStore();
  const userAvatar = profile?.core?.photoURL;
  const userName = profile?.core?.name ?? 'משתמש';
  // enable_home_v2: the shared <Sheet>; flag off keeps the markup below untouched.
  const isSuperAdmin = !!(profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin;
  const v2 = useFeatureFlags(isSuperAdmin).flags.enableHomeV2;

  const {
    editName, setEditName,
    editBio, setEditBio,
    editTrainingTags, toggleTrainingTag,
    editSaving,
    openPersonalEdit, savePersonalEdit,
  } = usePersonalInfoEditor();

  // Seed the form fields the moment the sheet opens — mirrors how
  // SettingsModal's own "עריכה" button calls this before revealing its form.
  const wasOpenRef = React.useRef(false);
  React.useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      openPersonalEdit();
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, openPersonalEdit]);

  const handleSave = async () => {
    const ok = await savePersonalEdit();
    if (ok) onClose();
  };

  const fields = (
    <>
    {/* Photo */}
    <div className="flex justify-center">
      <ProfilePhotoUploader photoURL={userAvatar} displayName={userName} size={88} />
    </div>

    {/* Name — flat: bottom-border only, no boxed field (פרופיל חלק Part 2) */}
    <div className="border-b border-gray-200 pb-2.5">
      <label className="block text-xs font-bold text-gray-500 mb-1">שם</label>
      <input
        type="text"
        value={editName}
        onChange={(e) => setEditName(e.target.value)}
        placeholder="שמך"
        className={`w-full bg-transparent outline-none text-right ${INPUT_TEXT_CLASS}`}
        style={INPUT_TEXT_FIX}
      />
    </div>

    {/* Bio — flat: bottom-border only, no boxed field */}
    <div className="border-b border-gray-200 pb-2.5">
      <label className="block text-xs font-bold text-gray-500 mb-1">תיאור אישי</label>
      <textarea
        value={editBio}
        onChange={(e) => setEditBio(e.target.value.slice(0, 150))}
        placeholder="ספר/י קצת על עצמך..."
        rows={2}
        className={`w-full bg-transparent outline-none text-right resize-none ${INPUT_TEXT_CLASS}`}
        style={INPUT_TEXT_FIX}
      />
      <p className="text-[10px] text-gray-400 mt-1">{editBio.length}/150</p>
    </div>

    {/* תגיות אימון — chip selector stays as-is (it's the control
        itself, not a boxed section wrapper); only the surrounding
        field styling above was flattened. */}
    <div>
      <h3 className="text-xs font-bold text-gray-500 mb-2">תגיות אימון</h3>
      <p className="text-[11px] text-gray-400 mb-2.5">אלה התגיות שיופיעו עליך בכרטיס השותף</p>
      <div className="flex flex-wrap gap-2">
        {TRAINING_TAG_OPTIONS.map((tag) => {
          const selected = editTrainingTags.includes(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggleTrainingTag(tag.id)}
              className={`px-3.5 py-2 rounded-full text-sm font-bold border transition-colors ${
                selected
                  ? 'bg-[#00ADEF] text-on-brand border-[#00ADEF]'
                  : 'bg-gray-50 text-gray-600 border-gray-200'
              }`}
            >
              {tag.label}
            </button>
          );
        })}
      </div>
    </div>

    {/* Personal details (city/neighborhood/weight/DOB) live in
        Settings now — this screen is public-presentation only. */}
    <p className="text-[11px] text-gray-400 text-center pt-1">
      פרטים אישיים (עיר, משקל, תאריך לידה) נערכים בהגדרות
    </p>
    </>
  );

  if (v2) {
    return (
      <Sheet
        open={isOpen}
        onClose={onClose}
        // Full-screen overlay tier z-[100] (.cursorrules), nested, in place — unchanged.
        zIndex={SHEET_Z.overlay}
        layout="nested"
        portal={false}
        // Has inputs: kb-fit backdrop + kb-cap surface (the shared keyboard layer, #455).
        keyboardAware
        dismissOnBackdrop={!editSaving}
        backdropClassName="bg-black/40 sm:items-center"
        backdropStyle={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
        className="max-h-[92vh] sm:rounded-3xl"
        safeArea={false}
        scroll="body"
        bodyClassName="px-5 py-5 space-y-5"
        transition={{ type: 'spring', damping: 32, stiffness: 300 }}
        ariaLabel="עריכת פרופיל"
        header={
          <div className="flex items-center justify-between gap-3 px-5 pb-2">
            <h2 className="whitespace-nowrap text-[22px] font-black !tracking-[-0.02em] text-v2-ink">עריכת פרופיל</h2>
            <IconButton aria-label="סגירה" tone="surface" size={36} className="shrink-0" disabled={editSaving} onClick={onClose}>
              <X className="h-4 w-4" />
            </IconButton>
          </div>
        }
        footer={
          <div className="px-5 pb-5 pt-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={editSaving}
              className="flex h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-v2-cta text-[16px] font-extrabold text-v2-on-cta shadow-v2-cta transition-transform duration-150 ease-v2 active:scale-[0.97] disabled:opacity-60"
            >
              {editSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={3} />}
              שמור שינויים
            </button>
          </div>
        }
      >
        {fields}
      </Sheet>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="kb-fit fixed inset-0 z-[100] bg-black/40 flex items-end sm:items-center justify-center"
          style={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
          onClick={() => !editSaving && onClose()}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="kb-cap bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col"
            dir="rtl"
          >
            {/* Sticky header */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-5 py-3.5 flex items-center justify-between z-10 flex-shrink-0 rounded-t-3xl">
              <button
                type="button"
                onClick={handleSave}
                disabled={editSaving}
                className="text-sm font-bold text-[#00ADEF] disabled:opacity-50 flex items-center gap-1.5"
              >
                {editSaving ? <Loader2 size={14} className="animate-spin" /> : null}
                שמירה
              </button>
              <h2 className="text-base font-black text-gray-900">עריכת פרופיל</h2>
              <button
                type="button"
                onClick={onClose}
                disabled={editSaving}
                className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-40"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
              {fields}
            </div>

            {/* Footer save button */}
            <div className="p-5 border-t border-gray-100 flex-shrink-0">
              <button
                type="button"
                onClick={handleSave}
                disabled={editSaving}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-l from-[#00ADEF] to-[#5BC2F2] text-on-brand font-bold text-sm shadow-lg shadow-cyan-500/20 active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {editSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={3} />}
                שמור שינויים
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
