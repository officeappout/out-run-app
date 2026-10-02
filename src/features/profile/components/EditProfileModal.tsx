'use client';

/**
 * EditProfileModal — consolidated "עריכת פרופיל" screen (profile redesign
 * round 5). Replaces the scattered editing entry points (SettingsModal's
 * inline hero form) with one screen covering everything per the approved
 * canvas mockup: photo, name, bio, personal details (city/weight/DOB), and
 * training tags.
 *
 * Every field here is powered by usePersonalInfoEditor — the SAME hook
 * SettingsModal now uses — so there is exactly one save path for this data,
 * not two. This component only lays out JSX; see that hook for the actual
 * staged-edit/save logic and its own comments on each field's save
 * semantics (e.g. why core.birthDate is a direct client write, why
 * trainingTags is a whole-array overwrite not arrayUnion).
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
import NeighborhoodPickerSheet from '@/features/profile/components/NeighborhoodPickerSheet';
import { useUserStore } from '@/features/user';
import { usePersonalInfoEditor, TRAINING_TAG_OPTIONS } from '@/features/profile/hooks/usePersonalInfoEditor';

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
const INPUT_TEXT_CLASS = 'text-gray-900 placeholder:text-gray-400';

export default function EditProfileModal({ isOpen, onClose }: EditProfileModalProps) {
  const { profile } = useUserStore();
  const userAvatar = profile?.core?.photoURL;
  const userName = profile?.core?.name ?? 'משתמש';

  const {
    editName, setEditName,
    editWeight, setEditWeight,
    editDob,
    editBio, setEditBio,
    editTrainingTags, toggleTrainingTag,
    editSaving,
    cityDisplay, cityResolving,
    goToCityEdit,
    neighborhoodPickerOpen, setNeighborhoodPickerOpen,
    editNeighborhoodId, editNeighborhoodName, setEditNeighborhoodId, setEditNeighborhoodName,
    cityAuthorityId,
    monthRef, yearRef,
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

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center"
          onClick={() => !editSaving && onClose()}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col"
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
              {/* Photo */}
              <div className="flex justify-center">
                <ProfilePhotoUploader photoURL={userAvatar} displayName={userName} size={88} />
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5">שם</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="שמך"
                  className={`w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-400 focus:border-transparent outline-none text-right ${INPUT_TEXT_CLASS}`}
                  style={INPUT_TEXT_FIX}
                />
              </div>

              {/* Bio */}
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5">תיאור אישי</label>
                <textarea
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value.slice(0, 150))}
                  placeholder="ספר/י קצת על עצמך..."
                  rows={2}
                  className={`w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-400 focus:border-transparent outline-none text-right resize-none ${INPUT_TEXT_CLASS}`}
                  style={INPUT_TEXT_FIX}
                />
                <p className="text-[10px] text-gray-400 mt-1">{editBio.length}/150</p>
              </div>

              {/* פרטים אישיים */}
              <div>
                <h3 className="text-xs font-bold text-gray-500 mb-2">פרטים אישיים</h3>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => goToCityEdit()}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-right"
                  >
                    <span className="text-[#00ADEF] font-semibold text-xs">ערוך</span>
                    <span className="text-gray-900">{cityResolving ? 'טוען…' : cityDisplay ?? 'עיר · לא הוגדרה'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNeighborhoodPickerOpen(true)}
                    disabled={!cityAuthorityId}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-right disabled:opacity-50"
                  >
                    <span className="text-[#00ADEF] font-semibold text-xs">
                      {editNeighborhoodName ? 'ערוך' : 'בחר'}
                    </span>
                    <span className="text-gray-900">
                      {!cityAuthorityId ? 'שכונה · קודם בחר עיר' : editNeighborhoodName ?? 'שכונה · לא הוגדרה'}
                    </span>
                  </button>

                  <input
                    type="number"
                    value={editWeight}
                    onChange={(e) => setEditWeight(e.target.value)}
                    placeholder='משקל (ק"ג)'
                    min="20"
                    max="300"
                    className={`w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-400 focus:border-transparent outline-none ${INPUT_TEXT_CLASS}`}
                    style={INPUT_TEXT_FIX}
                    dir="ltr"
                  />

                  {/* Read-only (production incident, round 8): core.birthDate is
                      locked by firestore.rules' noLockedCoreFieldsChanged() — a
                      direct client write to it is always rejected, so this was
                      never a working edit path. Display-only now; no new edit
                      flow added per instruction. */}
                  <div className="flex gap-2" dir="ltr">
                    <input
                      type="text"
                      readOnly
                      value={editDob.day}
                      placeholder="DD"
                      className={`w-16 px-2 py-2.5 border border-gray-200 rounded-xl text-sm text-center outline-none bg-gray-50 cursor-default ${INPUT_TEXT_CLASS}`}
                      style={INPUT_TEXT_FIX}
                    />
                    <input
                      ref={monthRef}
                      type="text"
                      readOnly
                      value={editDob.month}
                      placeholder="MM"
                      className={`w-16 px-2 py-2.5 border border-gray-200 rounded-xl text-sm text-center outline-none bg-gray-50 cursor-default ${INPUT_TEXT_CLASS}`}
                      style={INPUT_TEXT_FIX}
                    />
                    <input
                      ref={yearRef}
                      type="text"
                      readOnly
                      value={editDob.year}
                      placeholder="YYYY"
                      className={`flex-1 px-2 py-2.5 border border-gray-200 rounded-xl text-sm text-center outline-none bg-gray-50 cursor-default ${INPUT_TEXT_CLASS}`}
                      style={INPUT_TEXT_FIX}
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">תאריך לידה לא ניתן לעריכה כאן</p>
                </div>
              </div>

              {/* תגיות אימון */}
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
                            ? 'bg-[#00ADEF] text-white border-[#00ADEF]'
                            : 'bg-gray-50 text-gray-600 border-gray-200'
                        }`}
                      >
                        {tag.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer save button */}
            <div className="p-5 border-t border-gray-100 flex-shrink-0">
              <button
                type="button"
                onClick={handleSave}
                disabled={editSaving}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-l from-[#00ADEF] to-[#5BC2F2] text-white font-bold text-sm shadow-lg shadow-cyan-500/20 active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {editSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={3} />}
                שמור שינויים
              </button>
            </div>
          </motion.div>

          <NeighborhoodPickerSheet
            isOpen={neighborhoodPickerOpen}
            onClose={() => setNeighborhoodPickerOpen(false)}
            cityAuthorityId={cityAuthorityId}
            cityName={cityDisplay}
            currentNeighborhoodId={editNeighborhoodId}
            onSelect={(n) => { setEditNeighborhoodId(n.id); setEditNeighborhoodName(n.name); }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
