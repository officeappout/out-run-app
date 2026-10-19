'use client';

import { motion, AnimatePresence } from 'framer-motion';

/** Full-screen photo viewer above the park sheet (z 120/121). */
export default function ParkPhotoLightbox({ url, onClose }: { url: string | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {url && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-4 z-[121] flex items-center justify-center"
            onClick={onClose}
          >
            <img src={url} alt="" className="max-w-full max-h-full rounded-2xl object-contain shadow-2xl" />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
