'use client';

import { motion } from 'framer-motion';

interface SummaryHeaderProps {
  title?: string;
  date?: Date;
  motivationalMessage?: string;
}

export default function SummaryHeader({
  title = 'האימון הושלם!',
  date = new Date(),
  motivationalMessage,
}: SummaryHeaderProps) {
  const formattedDate = date.toLocaleDateString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white rounded-xl shadow-sm p-6 mb-6"
      style={{ fontFamily: 'var(--font-simpler)' }}
    >
      <h1 className="text-3xl md:text-4xl font-black text-gray-900 mb-2 leading-tight">
        {title}
      </h1>
      <p className="text-gray-500 text-lg font-medium mb-2">{formattedDate}</p>
      {motivationalMessage && (
        <p className="text-gray-600 text-base font-medium mt-3">{motivationalMessage}</p>
      )}
    </motion.div>
  );
}
